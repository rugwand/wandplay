import { db } from '$lib/server/db';
import { user, arcadeControl, platformControlAudit } from '$lib/server/db/schema';
import { GAME_IDS, getArcadeConfig, requireControlAdmin, requireSameOrigin, isGameId } from '$lib/server/control-center';
import { sql } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
    await requireControlAdmin(request);
    const games = await Promise.all(GAME_IDS.map((g) => getArcadeConfig(g)));
    const [totals] = await db.select({
        players: sql<number>`count(*)::int`,
        gamesPlayed: sql<string>`coalesce(sum(${user.totalArcadeGamesPlayed}),0)::text`,
        wagered: sql<string>`coalesce(sum(${user.totalArcadeWagered}),0)::text`,
        playerWinnings: sql<string>`coalesce(sum(${user.arcadeWins}),0)::text`,
        playerLosses: sql<string>`coalesce(sum(${user.arcadeLosses}),0)::text`
    }).from(user);
    return json({ games, totals });
};

export const PATCH: RequestHandler = async ({ request, url }) => {
    const admin = await requireControlAdmin(request);
    requireSameOrigin(request, url.origin);
    const body = await request.json().catch(() => ({}));
    if (!isGameId(body.game)) throw error(400, 'Unknown game');
    if (typeof body.enabled !== 'boolean') throw error(400, 'Invalid enabled flag');
    const min = Number(body.minBet);
    const max = Number(body.maxBet);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < .01 || min > max || max > 1000000 ||
        !/^\d{1,15}(\.\d{1,8})?$/.test(String(body.minBet)) ||
        !/^\d{1,15}(\.\d{1,8})?$/.test(String(body.maxBet)))
        throw error(400, 'Invalid bet limits (0.01 minimum, 1 million maximum)');
    const reason = String(body.reason ?? '').trim();
    if (reason.length < 4 || reason.length > 300) throw error(400, 'Reason must be 4 to 300 characters');
    const values = { game: body.game, enabled: body.enabled, minBet: String(body.minBet), maxBet: String(body.maxBet), updatedAt: new Date() };
    await db.transaction(async tx => {
        await tx.insert(arcadeControl).values(values).onConflictDoUpdate({ target: arcadeControl.game, set: values });
        await tx.insert(platformControlAudit).values({ adminId: admin.id, adminUsername: admin.username, section: 'arcade', details: JSON.stringify({ ...values, reason }) });
    });
    return json({ success: true });
};
