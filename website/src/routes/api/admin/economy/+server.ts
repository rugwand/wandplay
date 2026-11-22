
import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import { user, adminBalanceAdjustment } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { desc, eq, ilike } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const SCALE = 100000000n;
const MAX_CASH = 10n ** 30n - 1n;
const MAX_GEMS = 2147483647;

function parseCash(value: string): bigint {
    if (!/^(0|[1-9]\d{0,21})(\.\d{1,8})?$/.test(value)) {
        throw error(400, 'Invalid cash amount');
    }

    const [whole, fractional = ''] = value.split('.');
    return BigInt(whole) * SCALE +
        BigInt(fractional.padEnd(8, '0'));
}

function formatCash(value: bigint): string {
    const whole = value / SCALE;
    const fraction = (value % SCALE).toString().padStart(8, '0');
    return `${whole}.${fraction}`;
}

async function requireAdmin(request: Request) {
    const session = await auth.api.getSession({
        headers: request.headers
    });

    if (!session?.user) {
        throw error(401, 'Not authenticated');
    }

    const [admin] = await db
        .select({
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin
        })
        .from(user)
        .where(eq(user.id, Number(session.user.id)))
        .limit(1);

    if (!admin?.isAdmin) {
        throw error(403, 'Admin access required');
    }

    return admin;
}

// Search users and retrieve recent adjustment history.
export const GET: RequestHandler = async ({ request, url }) => {
    await requireAdmin(request);

    const q = (url.searchParams.get('q') || '').trim();

    const users = q
        ? await db
            .select({
                id: user.id,
                username: user.username,
                name: user.name,
                cash: user.baseCurrencyBalance,
                gems: user.gems
            })
            .from(user)
            .where(ilike(user.username, `%${q.slice(0, 30)}%`))
            .limit(10)
        : [];

    const history = await db
        .select()
        .from(adminBalanceAdjustment)
        .orderBy(desc(adminBalanceAdjustment.createdAt))
        .limit(20);

    return json({ users, history });
};

// Add, remove or set a user's cash or gems.
export const POST: RequestHandler = async ({ request, url }) => {
    const admin = await requireAdmin(request);

    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) {
        throw error(403, 'Invalid request origin');
    }

    const body = await request.json().catch(() => {
        throw error(400, 'Invalid JSON');
    });

    const { targetUserId, currency, operation, amount, reason } = body;

    if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
        throw error(400, 'Invalid user ID');
    }

    if (currency !== 'cash' && currency !== 'gems') {
        throw error(400, 'Invalid currency');
    }

    if (!['add', 'remove', 'set'].includes(operation)) {
        throw error(400, 'Invalid operation');
    }

    if (typeof reason !== 'string' ||
        !reason.trim() ||
        reason.trim().length > 500) {
        throw error(400, 'Reason is required (maximum 500 characters)');
    }

    if (typeof amount !== 'string') {
        throw error(400, 'Amount must be a string');
    }

    let cashAmount = 0n;
    let gemAmount = 0;

    if (currency === 'cash') {
        cashAmount = parseCash(amount);
        if (cashAmount > MAX_CASH) {
            throw error(400, 'Cash amount too large');
        }
        if (operation !== 'set' && cashAmount === 0n) {
            throw error(400, 'Amount must be greater than zero');
        }
    } else {
        if (!/^(0|[1-9]\d*)$/.test(amount)) {
            throw error(400, 'Gems must be a whole number');
        }

        gemAmount = Number(amount);
        if (!Number.isSafeInteger(gemAmount) ||
            gemAmount > MAX_GEMS ||
            (operation !== 'set' && gemAmount === 0)) {
            throw error(400, 'Invalid gem amount');
        }
    }

    const result = await db.transaction(async (tx) => {
        // Lock the target row until the adjustment finishes.
        const [target] = await tx
            .select({
                id: user.id,
                username: user.username,
                cash: user.baseCurrencyBalance,
                gems: user.gems
            })
            .from(user)
            .where(eq(user.id, targetUserId))
            .for('update');

        if (!target) {
            throw error(404, 'User not found');
        }

        let previousBalance: string;
        let newBalance: string;
        let auditAmount: string;

        if (currency === 'cash') {
            const oldValue = parseCash(target.cash);

            const nextValue =
                operation === 'add' ? oldValue + cashAmount :
                operation === 'remove' ? oldValue - cashAmount :
                cashAmount;

            if (nextValue < 0n || nextValue > MAX_CASH) {
                throw error(400, 'Invalid resulting cash balance');
            }

            previousBalance = formatCash(oldValue);
            newBalance = formatCash(nextValue);
            auditAmount = formatCash(cashAmount);

            await tx.update(user)
                .set({
                    baseCurrencyBalance: newBalance,
                    updatedAt: new Date()
                })
                .where(eq(user.id, target.id));
        } else {
            const oldValue = target.gems;

            const nextValue =
                operation === 'add' ? oldValue + gemAmount :
                operation === 'remove' ? oldValue - gemAmount :
                gemAmount;

            if (nextValue < 0 || nextValue > MAX_GEMS) {
                throw error(400, 'Invalid resulting gem balance');
            }

            previousBalance = formatCash(BigInt(oldValue) * SCALE);
            newBalance = formatCash(BigInt(nextValue) * SCALE);
            auditAmount = formatCash(BigInt(gemAmount) * SCALE);

            await tx.update(user)
                .set({
                    gems: nextValue,
                    updatedAt: new Date()
                })
                .where(eq(user.id, target.id));
        }

        // Record the administrative action.
        await tx.insert(adminBalanceAdjustment).values({
            adminUserId: admin.id,
            targetUserId: target.id,
            adminUsername: admin.username,
            targetUsername: target.username,
            currency,
            operation,
            amount: auditAmount,
            previousBalance,
            newBalance,
            reason: reason.trim()
        });

        return {
            userId: target.id,
            username: target.username,
            currency,
            newBalance
        };
    });

    return json({ success: true, ...result });
};
