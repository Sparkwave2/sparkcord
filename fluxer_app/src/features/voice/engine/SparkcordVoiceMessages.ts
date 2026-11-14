// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sparkcord: small messages between the people in a call (used by the soundboard).
// LiveKit calls use a data channel topic; peer-to-peer (mesh) calls send them as a
// custom signal type through the gateway's voice signal relay. A leaf module: the mesh
// engine is detected by duck typing so it doesn't have to be imported here.

import {type Room, RoomEvent, type RemoteParticipant} from 'livekit-client';

export const SPARKCORD_VOICE_TOPIC = 'sparkcord';

export type SparkcordVoiceMessage = {k: string} & Record<string, unknown>;
type Listener = (fromUserId: string, message: SparkcordVoiceMessage) => void;

const listeners = new Set<Listener>();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function onSparkcordVoiceMessage(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Called by the mesh engine and the LiveKit binding below. */
export function emitSparkcordVoiceMessage(fromUserId: string, message: unknown): void {
	if (typeof message !== 'object' || message === null || typeof (message as {k?: unknown}).k !== 'string') return;
	for (const listener of listeners) {
		try {
			listener(fromUserId, message as SparkcordVoiceMessage);
		} catch {
			// A broken listener must not break the call.
		}
	}
}

interface MeshEngineLike {
	broadcastSparkcordMessage(message: SparkcordVoiceMessage): void;
}

function meshEngineOf(room: Room): MeshEngineLike | null {
	const engine = (room as unknown as {engine?: unknown}).engine as Partial<MeshEngineLike> | undefined;
	return engine && typeof engine.broadcastSparkcordMessage === 'function' ? (engine as MeshEngineLike) : null;
}

export async function sendSparkcordVoiceMessage(room: Room, message: SparkcordVoiceMessage): Promise<void> {
	const mesh = meshEngineOf(room);
	if (mesh) {
		mesh.broadcastSparkcordMessage(message);
		return;
	}
	await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
		reliable: true,
		topic: SPARKCORD_VOICE_TOPIC,
	});
}

/** For LiveKit rooms: forwards data messages on our topic to the listeners. */
export function bindSparkcordVoiceMessages(room: Room, userIdOf: (identity: string) => string): () => void {
	if (meshEngineOf(room)) return () => {};
	const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
		if (topic !== SPARKCORD_VOICE_TOPIC || !participant) return;
		try {
			emitSparkcordVoiceMessage(userIdOf(participant.identity), JSON.parse(decoder.decode(payload)));
		} catch {
			// Ignore malformed messages.
		}
	};
	room.on(RoomEvent.DataReceived, onData);
	return () => {
		room.off(RoomEvent.DataReceived, onData);
	};
}
