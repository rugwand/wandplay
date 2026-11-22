import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import { playerReport, user, coin, comment } from '$lib/server/db/schema';
import { and, count, desc, eq, gte, ilike, or } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

async function userIdFromRequest(request: Request) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw error(401, 'Sign in required');
    return Number(session.user.id);
}

export const GET: RequestHandler = async ({ request }) => {
    const reporterId = await userIdFromRequest(request);
    const reports = await db.select({
        id: playerReport.id, targetType: playerReport.targetType,
        targetLabel: playerReport.targetLabel, status: playerReport.status,
        createdAt: playerReport.createdAt
    }).from(playerReport).where(eq(playerReport.reporterId, reporterId))
        .orderBy(desc(playerReport.createdAt)).limit(20);
    return json({ reports });
};

export const POST: RequestHandler = async ({ request, url }) => {
    const reporterId = await userIdFromRequest(request);
    if (request.headers.get('origin') !== url.origin) throw error(403, 'Invalid request origin');
    const raw: unknown = await request.json().catch(() => null);
    if (!raw || typeof raw !== 'object') throw error(400, 'Invalid request');
    const { targetType, target, reason } = raw as Record<string, unknown>;
    if (!['USER', 'COIN', 'COMMENT'].includes(String(targetType)) || typeof target !== 'string' || typeof reason !== 'string') {
        throw error(400, 'Choose a report type, target and reason');
    }
    const targetQuery = target.trim().replace(/^@/, '');
    const explanation = reason.trim();
    if (targetQuery.length < 1 || targetQuery.length > 100 || explanation.length < 10 || explanation.length > 2000) {
        throw error(400, 'Target required, and reason must be 10 to 2,000 characters');
    }

    const result = await db.transaction(async (tx) => {
        // Lock the reporting user to serialize simultaneous report submissions.
        const [reporter] = await tx.select({ id: user.id, username: user.username, isBanned: user.isBanned })
            .from(user).where(eq(user.id, reporterId)).for('update').limit(1);
        if (!reporter || reporter.isBanned) throw error(403, 'Cannot submit reports from this account');

        let targetId: number;
        let targetLabel: string;
        if (targetType === 'USER') {
            const [targetUser] = await tx.select({ id: user.id, username: user.username })
                .from(user).where(eq(user.username, targetQuery)).limit(1);
            if (!targetUser) throw error(404, 'Player not found');
            if (targetUser.id === reporterId) throw error(400, 'Cannot report yourself');
            targetId = targetUser.id;
            targetLabel = `@${targetUser.username}`;
        } else if (targetType === 'COIN') {
            const [targetCoin] = await tx.select({ id: coin.id, name: coin.name, symbol: coin.symbol })
                .from(coin).where(or(eq(coin.symbol, targetQuery.toUpperCase()), ilike(coin.name, targetQuery))).limit(1);
            if (!targetCoin) throw error(404, 'Coin not found. Enter its exact symbol or name');
            targetId = targetCoin.id;
            targetLabel = `${targetCoin.name} (${targetCoin.symbol})`;
        } else {
            const id = Number(targetQuery);
            if (!Number.isSafeInteger(id) || id < 1) throw error(400, 'Enter a valid comment ID');
            const [targetComment] = await tx.select({ id: comment.id, isDeleted: comment.isDeleted })
                .from(comment).where(eq(comment.id, id)).limit(1);
            if (!targetComment || targetComment.isDeleted) throw error(404, 'Comment not found');
            targetId = id;
            targetLabel = `Comment #${id}`;
        }

        const since = new Date(Date.now() - 86400000);
        const [{ total }] = await tx.select({ total: count() }).from(playerReport)
            .where(and(eq(playerReport.reporterId, reporterId), gte(playerReport.createdAt, since)));
        if (Number(total) >= 5) throw error(429, 'Limit of five reports per 24 hours reached');
        const [duplicate] = await tx.select({ id: playerReport.id }).from(playerReport)
            .where(and(eq(playerReport.reporterId, reporterId), eq(playerReport.targetType, targetType as string),
                eq(playerReport.targetId, targetId), eq(playerReport.status, 'OPEN'))).limit(1);
        if (duplicate) throw error(409, 'You already have an open report for this target');

        const [created] = await tx.insert(playerReport).values({
            reporterId, reporterUsername: reporter.username,
            targetType: targetType as string, targetId, targetLabel, reason: explanation
        }).returning({ id: playerReport.id });
        return created.id;
    });
    return json({ success: true, reportId: result });
};
