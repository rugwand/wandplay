import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import { user, playerReport } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { createNotification } from '$lib/server/notification';
import type { RequestHandler } from './$types';

async function requireAdmin(request: Request) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw error(401, 'Sign in required');
    const [admin] = await db.select({ id: user.id, username: user.username, isAdmin: user.isAdmin })
        .from(user).where(eq(user.id, Number(session.user.id))).limit(1);
    if (!admin?.isAdmin) throw error(403, 'Admin access required');
    return admin;
}

export const GET: RequestHandler = async ({ request }) => {
    await requireAdmin(request);
    const reports = await db.select().from(playerReport)
        .orderBy(desc(playerReport.createdAt)).limit(100);
    return json({ reports });
};

export const POST: RequestHandler = async ({ request, url }) => {
    const admin = await requireAdmin(request);
    if (request.headers.get('origin') !== url.origin) throw error(403, 'Invalid request origin');
    const raw: unknown = await request.json().catch(() => null);
    if (!raw || typeof raw !== 'object') throw error(400, 'Invalid request');
    const { reportId, status, note } = raw as Record<string, unknown>;
    if (!Number.isSafeInteger(reportId) || (reportId as number) < 1 || !['RESOLVED', 'DISMISSED'].includes(String(status)) || typeof note !== 'string' || note.trim().length > 1000) {
        throw error(400, 'Invalid moderation action');
    }
    const saved = await db.transaction(async (tx) => {
        const [current] = await tx.select({
            id: playerReport.id, status: playerReport.status, reporterId: playerReport.reporterId
        }).from(playerReport).where(eq(playerReport.id, reportId as number)).for('update').limit(1);
        if (!current) throw error(404, 'Report not found');
        if (current.status !== 'OPEN') throw error(409, 'Report is already reviewed');
        await tx.update(playerReport).set({
            status: status as string, reviewNote: note.trim() || null,
            reviewedById: admin.id, reviewedByUsername: admin.username,
            reviewedAt: new Date()
        }).where(eq(playerReport.id, current.id));
        return { reporterId: current.reporterId };
    });
    if (saved.reporterId) {
        try {
            await createNotification(String(saved.reporterId), 'SYSTEM', 'Report reviewed',
                `Your report #${reportId} was ${String(status).toLowerCase()}.`, '/report');
        } catch (e) { console.error('Report saved; notification failed:', e); }
    }
    return json({ success: true });
};
