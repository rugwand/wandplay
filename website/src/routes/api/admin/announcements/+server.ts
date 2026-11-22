import { db } from '$lib/server/db';
import { platformAnnouncement, platformControlAudit } from '$lib/server/db/schema';
import { requireControlAdmin, requireSameOrigin, dispatchDueAnnouncements } from '$lib/server/control-center';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
    await requireControlAdmin(request);
    const announcements = await db.select().from(platformAnnouncement).orderBy(desc(platformAnnouncement.createdAt)).limit(100);
    return json({ announcements });
};

export const POST: RequestHandler = async ({ request, url }) => {
    const admin = await requireControlAdmin(request);
    requireSameOrigin(request, url.origin);
    const body = await request.json().catch(() => ({}));
    if (body.action === 'cancel') {
        if (!Number.isInteger(body.id) || body.id < 1) throw error(400, 'Invalid announcement ID');
        const [cancelled] = await db.update(platformAnnouncement).set({ cancelledAt: new Date() })
            .where(and(eq(platformAnnouncement.id, body.id), isNull(platformAnnouncement.sentAt), isNull(platformAnnouncement.cancelledAt))).returning();
        if (!cancelled) throw error(400, 'Announcement already sent, cancelled or not found');
        await db.insert(platformControlAudit).values({ adminId: admin.id, adminUsername: admin.username, section: 'announcements', details: `Cancelled announcement #${body.id}` });
        return json({ success: true });
    }
    if (body.action !== 'create') throw error(400, 'Invalid action');
    const title = String(body.title ?? '').trim();
    const message = String(body.message ?? '').trim();
    const kind = String(body.kind ?? 'announcement');
    const link = String(body.link ?? '').trim();
    if (title.length < 3 || title.length > 200 || message.length < 3 || message.length > 2000)
        throw error(400, 'Title must be 3–200 chars and message 3–2000 chars');
    if (!['announcement', 'maintenance', 'notice'].includes(kind)) throw error(400, 'Invalid announcement type');
    if (link && (!/^\/[a-zA-Z0-9/_?=&.%-]*$/.test(link) || link.startsWith('//')))
        throw error(400, 'Link must be an internal site path, e.g. /market');
    let scheduledAt = new Date();
    if (body.scheduledAt) {
        scheduledAt = new Date(body.scheduledAt);
        if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60000 || scheduledAt.getTime() > Date.now() + 365*86400000)
            throw error(400, 'Schedule must be within the next year');
    }
    const [created] = await db.insert(platformAnnouncement).values({
        title, message, kind, link: link || null, scheduledAt, createdBy: admin.id
    }).returning();
    await db.insert(platformControlAudit).values({ adminId: admin.id, adminUsername: admin.username, section: 'announcements', details: `Created announcement #${created.id} for ${scheduledAt.toISOString()}` });
    if (scheduledAt.getTime() <= Date.now()) {
        try { await dispatchDueAnnouncements(); }
        catch (e) { console.error('Immediate announcement dispatch failed; scheduler will retry', e); }
    }
    return json({ success: true, id: created.id });
};
