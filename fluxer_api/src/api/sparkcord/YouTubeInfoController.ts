// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: title and channel name of a YouTube video, for the voice chat radio's
// queue. The web app's content security policy doesn't let it ask YouTube directly, so
// the server asks YouTube's public oEmbed endpoint (no API key) and remembers the answer.

import {LoginRequired} from '@app/api/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@app/api/middleware/RateLimitMiddleware';
import {OpenAPI} from '@app/api/middleware/ResponseTypeMiddleware';
import {getCacheService} from '@app/api/middleware/ServiceSingletons';
import {RateLimitConfigs} from '@app/api/RateLimitConfig';
import type {HonoApp} from '@app/api/types/HonoEnv';
import {Validator} from '@app/api/Validator';
import {z} from 'zod';

const FOUND_TTL_SECONDS = 24 * 60 * 60;
const MISSING_TTL_SECONDS = 10 * 60;
const FETCH_TIMEOUT_MS = 5000;

const VideoParam = z.object({video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/)});
const VideoInfoResponse = z.object({
	title: z.string().nullable(),
	author: z.string().nullable(),
});
type VideoInfo = z.infer<typeof VideoInfoResponse>;

const security: Array<'bearerToken' | 'sessionToken'> = ['bearerToken', 'sessionToken'];

async function fetchVideoInfo(videoId: string): Promise<VideoInfo> {
	const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
	const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`, {
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		headers: {accept: 'application/json'},
	});
	if (!response.ok) return {title: null, author: null};
	const body = (await response.json()) as {title?: unknown; author_name?: unknown};
	return {
		title: typeof body.title === 'string' ? body.title.slice(0, 200) : null,
		author: typeof body.author_name === 'string' ? body.author_name.slice(0, 100) : null,
	};
}

export function YouTubeInfoController(app: HonoApp) {
	app.get(
		'/sparkcord/youtube/:video_id',
		RateLimitMiddleware(RateLimitConfigs.SPARKCORD_YOUTUBE_INFO),
		LoginRequired,
		Validator('param', VideoParam),
		OpenAPI({
			operationId: 'get_youtube_video_info',
			summary: 'Get YouTube video info',
			responseSchema: VideoInfoResponse,
			statusCode: 200,
			security,
			tags: ['Sparkcord'],
			description: 'Gets the title and channel name of a YouTube video. Both are null when YouTube has none to give.',
		}),
		async (ctx) => {
			const {video_id: videoId} = ctx.req.valid('param');
			const key = `sparkcord:youtube:${videoId}`;
			const cache = getCacheService();
			const [cached] = await cache.mget<VideoInfo>([key]);
			if (cached != null) return ctx.json(cached);
			let info: VideoInfo = {title: null, author: null};
			try {
				info = await fetchVideoInfo(videoId);
			} catch {
				// YouTube unreachable or slow; the client falls back to showing the link.
			}
			await cache.set(key, info, info.title === null ? MISSING_TTL_SECONDS : FOUND_TTL_SECONDS);
			return ctx.json(info);
		},
	);
}
