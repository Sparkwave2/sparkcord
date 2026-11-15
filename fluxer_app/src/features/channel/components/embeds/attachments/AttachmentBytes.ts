// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: downloads an attachment's bytes for in-app viewers (PDF, games), refreshing
// signed URLs that expired.

import {fetchApiAttachmentBlob, fetchedApiAttachmentKey} from '@app/features/messaging/state/ApiAttachmentMedia';
import AttachmentUrlRefresher from '@app/features/messaging/state/AttachmentUrlRefresher';
import {wrapDesktopLocalResourceURL} from '@app/features/messaging/utils/DesktopResourceUrl';

export async function fetchAttachmentBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
	const target = await AttachmentUrlRefresher.refresh(url);
	if (fetchedApiAttachmentKey(target) !== null) {
		return (await fetchApiAttachmentBlob(target, signal)).arrayBuffer();
	}
	let response = await fetch(wrapDesktopLocalResourceURL(target), {signal});
	if (!response.ok && [401, 403, 404, 410].includes(response.status)) {
		const refreshed = await AttachmentUrlRefresher.refresh(url, {force: true});
		if (refreshed !== target) response = await fetch(wrapDesktopLocalResourceURL(refreshed), {signal});
	}
	if (!response.ok) throw new Error(`Attachment request failed: ${response.status}`);
	return response.arrayBuffer();
}
