import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import { user, platformControl, arcadeControl, platformAnnouncement, platformAnnouncementDelivery, platformControlAudit, notifications } from '$lib/server/db/schema';
import { redis } from '$lib/server/redis';
import { eq, and, lte, isNull, gt, asc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export const GAME_IDS = ['coinflip', 'slots', 'mines', 'dice', 'tower', 'blackjack'] as const;
export type GameId = typeof GAME_IDS[number];
export function isGameId(x: unknown): x is GameId { return typeof x === 'string' && (GAME_IDS as readonly string[]).includes(x); }

export async function requireControlAdmin(request: Request) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw error(401, 'Not authenticated');
    const [admin] = await db.select({ id: user.id, username: user.username, isAdmin: user.isAdmin })
        .from(user).where(eq(user.id, Number(session.user.id))).limit(1);
    if (!admin?.isAdmin) throw error(403, 'Admin access required');
    return admin;
}

export function requireSameOrigin(request: Request, origin: string) {
    const supplied = request.headers.get('origin');
    if (!supplied || supplied !== origin) throw error(403, 'Invalid request origin');
}

let cachedControl: Awaited<ReturnType<typeof readPlatformControl>> | null = null;
let cachedControlUntil = 0;
async function readPlatformControl() {
    await db.insert(platformControl).values({ id: 1 }).onConflictDoNothing();
    const [row] = await db.select().from(platformControl).where(eq(platformControl.id, 1));
    return row;
}
export async function getPlatformControl() {
    if (cachedControl && Date.now() < cachedControlUntil) return cachedControl;
    cachedControl = await readPlatformControl();
    cachedControlUntil = Date.now() + 3000;
    return cachedControl;
}
export function clearPlatformControlCache() { cachedControl = null; cachedControlUntil = 0; }


export async function getArcadeConfig(game: GameId) {
    const [row] = await db.select().from(arcadeControl).where(eq(arcadeControl.game, game)).limit(1);
    return row ?? { game, enabled: true, minBet: '0.01000000', maxBet: '1000000.00000000', updatedAt: new Date(0) };
}

export async function arcadeRequestError(pathname: string, request: Request): Promise<string | null> {
    if (request.method !== 'POST') return null;
    const bits = pathname.split('/');
    const game = bits[3];
    if (!isGameId(game)) return null;
    const suffix = bits.slice(4).join('/');
    // Existing sessions may always finish. Only block the creation of new wagers.
    if ((game === 'mines' || game === 'tower') && suffix !== 'start') return null;
    const data = await request.clone().json().catch(() => null);
    if (!data) return null; // endpoint itself validates malformed input
    if (game === 'blackjack' && data.action !== 'deal') return null;
    const config = await getArcadeConfig(game);
    if (!config.enabled) return `${game} is currently disabled by the administrators`;
    const raw = game === 'blackjack' || game === 'mines' || game === 'tower' ? data.betAmount : data.amount;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    const min = Math.max(0.01, Number(config.minBet));
    const max = Number(config.maxBet);
    if (raw < min || raw > max) return `Bet must be between $${min} and $${max}`;
    return null;
}

export async function auditControl(admin: { id: number; username: string }, section: string, details: string) {
    await db.insert(platformControlAudit).values({ adminId: admin.id, adminUsername: admin.username, section, details });
}

// Durable scheduled delivery. Insert delivery marker and notification in one transaction.
// Multiple scheduler instances cannot duplicate a user's notification.
export async function dispatchDueAnnouncements() {
    const due = await db.select().from(platformAnnouncement)
        .where(and(lte(platformAnnouncement.scheduledAt, new Date()), isNull(platformAnnouncement.sentAt), isNull(platformAnnouncement.cancelledAt)))
        .orderBy(asc(platformAnnouncement.scheduledAt)).limit(10);
    for (const item of due) {
        let cursor = 0;
        while (true) {
            const batch = await db.select({ id: user.id }).from(user).where(gt(user.id, cursor)).orderBy(asc(user.id)).limit(100);
            if (!batch.length) break;
            for (const recipient of batch) {
                const inserted = await db.transaction(async (tx) => {
                    const marker = await tx.insert(platformAnnouncementDelivery)
                        .values({ announcementId: item.id, userId: recipient.id })
                        .onConflictDoNothing().returning();
                    if (!marker.length) return false;
                    await tx.insert(notifications).values({
                        userId: recipient.id, type: 'SYSTEM', title: item.title,
                        message: item.message, link: item.link
                    });
                    return true;
                });
                if (inserted) {
                    try {
                        await redis.publish(`notifications:${recipient.id}`, JSON.stringify({
                            type: 'notification', timestamp: new Date().toISOString(), userId: String(recipient.id),
                            notificationType: 'SYSTEM', title: item.title, message: item.message, link: item.link
                        }));
                    } catch (e) { console.error('Announcement realtime publish failed', e); }
                }
            }
            cursor = batch[batch.length - 1].id;
        }
        await db.update(platformAnnouncement).set({ sentAt: new Date() })
            .where(and(eq(platformAnnouncement.id, item.id), isNull(platformAnnouncement.cancelledAt)));
    }
}
