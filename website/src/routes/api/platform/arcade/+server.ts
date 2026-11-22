import { GAME_IDS, getArcadeConfig } from '$lib/server/control-center';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async () => {
    const games = await Promise.all(GAME_IDS.map((g) => getArcadeConfig(g)));
    return json({ games }, { headers: { 'Cache-Control': 'no-store' } });
};
