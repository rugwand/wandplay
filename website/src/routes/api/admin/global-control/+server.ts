import { db } from '$lib/server/db';
import { platformControl, platformControlAudit } from '$lib/server/db/schema';
import { getPlatformControl, requireControlAdmin, requireSameOrigin, clearPlatformControlCache } from '$lib/server/control-center';
import { eq, desc } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
    await requireControlAdmin(request);
    const settings = await getPlatformControl();
    const history = await db.select().from(platformControlAudit).orderBy(desc(platformControlAudit.createdAt)).limit(25);
    return json({ settings, history });
};

export const PATCH: RequestHandler = async ({ request, url }) => {
    const admin = await requireControlAdmin(request);
    requireSameOrigin(request, url.origin);
    const body = await request.json().catch(() => ({}));
    const boolKeys = ['maintenance', 'registrationsEnabled', 'coinCreationEnabled'] as const;
    const updates: Record<string, unknown> = {};
    for (const key of boolKeys) {
        if (key in body) {
            if (typeof body[key] !== 'boolean') throw error(400, `Invalid ${key}`);
            updates[key] = body[key];
        }
    }
    if ('maxCoinsPerUser' in body) {
        if (!Number.isInteger(body.maxCoinsPerUser) || body.maxCoinsPerUser < 0 || body.maxCoinsPerUser > 100000)
            throw error(400, 'Max coins per user must be 0 to 100000');
        updates.maxCoinsPerUser = body.maxCoinsPerUser;
    }
    if ('startingGems' in body) {
        if (!Number.isInteger(body.startingGems) || body.startingGems < 0 || body.startingGems > 10000000)
            throw error(400, 'Invalid starting gems');
        updates.startingGems = body.startingGems;
    }
    if ('startingCash' in body) {
        const x = String(body.startingCash);
        if (!/^(0|[1-9]\d{0,18})(\.\d{1,8})?$/.test(x)) throw error(400, 'Invalid starting cash');
        updates.startingCash = x;
    }
    if ('coinFeeMultiplier' in body) {
        const x = String(body.coinFeeMultiplier);
        const n = Number(x);
        if (!Number.isFinite(n) || n < 0 || n > 100 || !/^\d{1,3}(\.\d{1,2})?$/.test(x))
            throw error(400, 'Creation fee multiplier must be 0 to 100, max 2 decimal places');
        updates.coinFeeMultiplier = x;
    }
    if (!Object.keys(updates).length) throw error(400, 'No settings submitted');
    const reason = String(body.reason ?? '').trim();
    if (reason.length < 4 || reason.length > 300) throw error(400, 'Reason must be 4 to 300 characters');
    await getPlatformControl();
    const saved = await db.transaction(async (tx) => {
        const result = await tx.update(platformControl).set({ ...updates, updatedAt: new Date() })
            .where(eq(platformControl.id, 1)).returning();
        await tx.insert(platformControlAudit).values({ adminId: admin.id, adminUsername: admin.username, section: 'global', details: JSON.stringify({ updates, reason }) });
        return result;
    });
    clearPlatformControlCache();
    return json({ success: true, settings: saved });
};
