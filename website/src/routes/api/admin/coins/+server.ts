import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import { coin, coinModerationLog, user } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { desc, eq, ilike, or } from 'drizzle-orm';
import type { RequestHandler } from './$types';

async function requireAdmin(request: Request) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw error(401, 'Not authenticated');

    const [admin] = await db.select({
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin
    }).from(user).where(eq(user.id, Number(session.user.id))).limit(1);

    if (!admin?.isAdmin) throw error(403, 'Admin access required');
    return admin;
}

export const GET: RequestHandler = async ({ request, url }) => {
    await requireAdmin(request);
    const search = (url.searchParams.get('q') ?? '').trim().slice(0, 50);
    const filter = search
        ? or(ilike(coin.name, `%${search}%`), ilike(coin.symbol, `%${search}%`))
        : undefined;

    const [coins, history] = await Promise.all([
        db.select({
            id: coin.id,
            name: coin.name,
            symbol: coin.symbol,
            isListed: coin.isListed,
            marketCap: coin.marketCap,
            currentPrice: coin.currentPrice,
            volume24h: coin.volume24h,
            createdAt: coin.createdAt,
            creatorUsername: user.username
        }).from(coin)
          .leftJoin(user, eq(coin.creatorId, user.id))
          .where(filter)
          .orderBy(desc(coin.createdAt))
          .limit(50),
        db.select().from(coinModerationLog)
          .orderBy(desc(coinModerationLog.createdAt))
          .limit(30)
    ]);

    return json({ coins, history });
};

export const POST: RequestHandler = async ({ request, url }) => {
    const admin = await requireAdmin(request);

    // This endpoint changes moderation state, so reject cross-origin requests.
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) throw error(403, 'Invalid origin');

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw error(400, 'Invalid JSON body');
    }
    const { coinId, action, reason } = body as Record<string, unknown>;
    if (typeof coinId !== 'number' || !Number.isSafeInteger(coinId) || coinId <= 0) {
        throw error(400, 'Invalid coin ID');
    }
    if (action !== 'delist' && action !== 'relist') {
        throw error(400, 'Invalid moderation action');
    }
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) {
        throw error(400, 'Give a reason between 3 and 500 characters');
    }

    // Lock the coin row. The normal trade API also locks it and checks isListed,
    // so takedowns and in-flight trades are serialized safely.
    const updated = await db.transaction(async (tx) => {
        const [entry] = await tx.select({
            id: coin.id,
            name: coin.name,
            symbol: coin.symbol,
            isListed: coin.isListed
        }).from(coin).where(eq(coin.id, coinId)).for('update').limit(1);

        if (!entry) throw error(404, 'Coin not found');
        const shouldBeListed = action === 'relist';
        if (entry.isListed === shouldBeListed) {
            throw error(409, shouldBeListed ? 'Coin is already listed' : 'Coin is already delisted');
        }

        await tx.update(coin)
            .set({ isListed: shouldBeListed, updatedAt: new Date() })
            .where(eq(coin.id, entry.id));

        await tx.insert(coinModerationLog).values({
            coinId: entry.id,
            coinName: entry.name,
            coinSymbol: entry.symbol,
            adminUserId: admin.id,
            adminUsername: admin.username,
            action,
            reason: reason.trim()
        });

        return { id: entry.id, symbol: entry.symbol, isListed: shouldBeListed };
    });

    return json({ success: true, coin: updated });
};
