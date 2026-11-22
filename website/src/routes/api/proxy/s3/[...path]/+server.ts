
import { error, isHttpError } from '@sveltejs/kit';
import { generateDownloadUrl } from '$lib/server/s3';

export async function GET({ params, request }) {
    const path = params.path;

    if (!path) {
        throw error(400, 'Path is required');
    }

    if (path.includes('..') || path.includes('\0')) {
        throw error(400, 'Invalid path');
    }

    try {
        // Generate an authenticated download URL for private B2 storage
        const signedUrl = await generateDownloadUrl(path);

        const response = await fetch(signedUrl, {
            signal: request.signal
        });

        if (!response.ok) {
            console.error(
                `[S3 Proxy] Backblaze returned ${response.status} for ${path}`
            );

            throw error(response.status, 'Failed to fetch from B2');
        }

        const contentType =
            response.headers.get('content-type') ||
            'application/octet-stream';

        let cacheControl: string;

        if (path.includes('/coin/') || path.includes('coin-icon')) {
            cacheControl = 'public, max-age=31536000, immutable';
        } else if (
            path.includes('avatars/') ||
            path.includes('profile-') ||
            path.includes('avatar')
        ) {
            cacheControl = 'public, max-age=60';
        } else {
            cacheControl = 'public, max-age=86400';
        }

        return new Response(response.body, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': cacheControl,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });

    } catch (e) {
        if (isHttpError(e)) {
            throw e;
        }

        console.error('[S3 Proxy] Error:', e);

        throw error(500, 'Failed to proxy S3 request');
    }
}
