import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import { user, userInventory, userBlock, giftTransfer, season, seasonParticipant } from '$lib/server/db/schema';
import { NAME_COLOR_CATALOG } from '$lib/data/shop-catalog';
import { createNotification } from '$lib/server/notification';
import { and, asc, count, desc, eq, gte, inArray, or } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

async function currentUser(request: Request) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw error(401, 'Sign in required');
    return Number(session.user.id);
}

export const GET: RequestHandler = async ({ request }) => {
    const userId = await currentUser(request);
    const entries = await db.select().from(giftTransfer)
        .where(or(eq(giftTransfer.senderId, userId), eq(giftTransfer.recipientId, userId)))
        .orderBy(desc(giftTransfer.createdAt)).limit(25);
    return json({ history: entries });
};

export const POST: RequestHandler = async ({ request, url }) => {
    const senderId = await currentUser(request);
    if (request.headers.get('origin') !== url.origin) throw error(403, 'Invalid request origin');
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw error(400, 'Invalid request');
    const data = body as Record<string, unknown>;
    const recipientUsername = typeof data.recipientUsername === 'string' ? data.recipientUsername.trim() : '';
    const kind = data.kind;
    if (!/^[\w.-]{3,30}$/.test(recipientUsername) || (kind !== 'GEMS' && kind !== 'COLOR')) {
        throw error(400, 'Invalid recipient or gift type');
    }

    const amount = data.amount;
    const colorKey = data.colorKey;
    if (kind === 'GEMS' && (!Number.isSafeInteger(amount) || (amount as number) < 1 || (amount as number) > 100000)) {
        throw error(400, 'Gift must contain 1 to 100,000 gems');
    }
    if (kind === 'COLOR' && (typeof colorKey !== 'string' || !NAME_COLOR_CATALOG.some((item) => item.key === colorKey))) {
        throw error(400, 'Choose a valid name color');
    }

    const gift = await db.transaction(async (tx) => {
        const [recipient] = await tx.select({ id: user.id })
            .from(user).where(eq(user.username, recipientUsername)).limit(1);
        if (!recipient) throw error(404, 'Recipient not found');
        if (recipient.id === senderId) throw error(400, 'You cannot gift yourself');

        // Lock both participants in a consistent order to prevent concurrent balance races.
        const participants = await tx.select({
            id: user.id, username: user.username, gems: user.gems,
            isBanned: user.isBanned, nameColor: user.nameColor
        }).from(user).where(inArray(user.id, [senderId, recipient.id]))
            .orderBy(asc(user.id)).for('update');
        const sender = participants.find((p) => p.id === senderId);
        const receiver = participants.find((p) => p.id === recipient.id);
        if (!sender || !receiver) throw error(404, 'Player not found');
        if (sender.isBanned || receiver.isBanned) throw error(403, 'Gifting is unavailable for this account');

        const [blocked] = await tx.select({ id: userBlock.id }).from(userBlock)
            .where(or(
                and(eq(userBlock.blockerId, senderId), eq(userBlock.blockedId, receiver.id)),
                and(eq(userBlock.blockerId, receiver.id), eq(userBlock.blockedId, senderId))
            )).limit(1);
        if (blocked) throw error(403, 'Gifts cannot be sent between blocked users');

        const [activeSeason] = await tx.select({ id: seasonParticipant.id })
            .from(seasonParticipant).innerJoin(season, eq(season.id, seasonParticipant.seasonId))
            .where(and(eq(seasonParticipant.userId, receiver.id), eq(season.status, 'ACTIVE'))).limit(1);
        if (activeSeason) throw error(403, 'This user cannot receive transfers while competing in a season');

        const since = new Date(Date.now() - 86400000);
        const [{ sent }] = await tx.select({ sent: count() }).from(giftTransfer)
            .where(and(eq(giftTransfer.senderId, senderId), gte(giftTransfer.createdAt, since)));
        if (Number(sent) >= 20) throw error(429, 'Daily limit of 20 gifts reached');

        let label: string;
        if (kind === 'GEMS') {
            const gems = amount as number;
            if (sender.gems < gems) throw error(400, 'Insufficient gems');
            if (receiver.gems + gems > 2147483647) throw error(400, 'Recipient gem balance exceeds limit');
            await tx.update(user).set({ gems: sender.gems - gems, updatedAt: new Date() }).where(eq(user.id, senderId));
            await tx.update(user).set({ gems: receiver.gems + gems, updatedAt: new Date() }).where(eq(user.id, receiver.id));
            label = `${gems.toLocaleString()} gems`;
        } else {
            const key = colorKey as string;
            const [owned] = await tx.select({ id: userInventory.id }).from(userInventory)
                .where(and(eq(userInventory.userId, senderId), eq(userInventory.itemType, 'namecolor'), eq(userInventory.itemKey, key))).limit(1);
            if (!owned) throw error(400, 'You do not own that name color');
            const [alreadyOwned] = await tx.select({ id: userInventory.id }).from(userInventory)
                .where(and(eq(userInventory.userId, receiver.id), eq(userInventory.itemType, 'namecolor'), eq(userInventory.itemKey, key))).limit(1);
            if (alreadyOwned) throw error(409, 'Recipient already owns that name color');
            await tx.delete(userInventory).where(eq(userInventory.id, owned.id));
            // Unique constraint handles any unexpected concurrent ownership change with rollback.
            await tx.insert(userInventory).values({ userId: receiver.id, itemType: 'namecolor', itemKey: key });
            if (sender.nameColor === key) {
                await tx.update(user).set({ nameColor: null, updatedAt: new Date() }).where(eq(user.id, senderId));
            }
            label = NAME_COLOR_CATALOG.find((c) => c.key === key)?.label ?? key;
        }

        const [saved] = await tx.insert(giftTransfer).values({
            senderId, recipientId: receiver.id,
            senderUsername: sender.username, recipientUsername: receiver.username,
            kind, gemsAmount: kind === 'GEMS' ? amount as number : null,
            colorKey: kind === 'COLOR' ? colorKey as string : null
        }).returning({ id: giftTransfer.id });
        return { id: saved.id, recipientId: receiver.id, receiverName: receiver.username, senderName: sender.username, label };
    });

    // Notifications are after the transaction: a notification outage cannot undo or duplicate a gift.
    try {
        await createNotification(String(gift.recipientId), 'TRANSFER', 'You received a gift!',
            `@${gift.senderName} sent you ${gift.label}`, '/gifts');
    } catch (e) {
        console.error('Gift completed but notification failed:', e);
    }
    return json({ success: true, id: gift.id, recipient: gift.receiverName });
};
