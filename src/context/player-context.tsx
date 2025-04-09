import { create } from "zustand";
import type {
	PlayerState,
	SpotifyPlayerEventPayload,
	SerializableAudioItem,
} from "@/lib/events";

import type React from "react";
import { useEffect } from "react";
import { listen, type EventCallback } from "@tauri-apps/api/event";

interface PlayerStore extends PlayerState {
	handlePlayerEvent: (payload: SpotifyPlayerEventPayload) => void;
}

const initialState: PlayerState = {
	playbackState: "unavailable",
	positionMs: 0,
	volume: 65535,
	shuffle: false,
	repeat: "off",
	autoPlay: false,
	filterExplicitContent: false,
	playRequestId: undefined,
	currentItem: undefined,
	currentTrackId: undefined,
};

export const usePlayerStore = create<PlayerStore>((set) => ({
	...initialState,
	handlePlayerEvent: (payload) => {
		// console.log("Received event (Zustand):", payload.type, payload);

		set((state) => {
			switch (payload.type) {
				case "play_request_id_changed":
					return { playRequestId: payload.play_request_id };
				case "track_changed": {
					const { type, ...item } = payload;
					return {
						currentItem: item as SerializableAudioItem,
						currentTrackId: item.track_id,
						positionMs: 0,
					};
				}
				case "stopped":
					return {
						playbackState: "stopped",
						positionMs: 0,
						currentTrackId: payload.track_id,
					};
				case "playing":
					if (
						!state.currentItem ||
						state.currentItem.track_id === payload.track_id
					) {
						return {
							playbackState: "playing",
							positionMs: payload.position_ms,
							currentTrackId: payload.track_id,
						};
					}
					return {}; // No change if track ID doesn't match
				case "paused":
					if (
						!state.currentItem ||
						state.currentItem.track_id === payload.track_id
					) {
						return {
							playbackState: "paused",
							positionMs: payload.position_ms,
							currentTrackId: payload.track_id,
						};
					}
					return {}; // No change
				case "loading":
					if (
						!state.currentItem ||
						state.currentItem.track_id === payload.track_id
					) {
						return {
							playbackState: "loading",
							currentTrackId: payload.track_id,
						};
					}
					return {}; // No change
				case "preloading":
					// console.log("Preloading:", payload.track_id);
					return {}; // No state change needed, just log
				case "end_of_track":
					if (state.currentItem?.track_id === payload.track_id) {
						return {
							playbackState: "ended",
							positionMs: state.currentItem?.duration_ms ?? state.positionMs,
						};
					}
					return {}; // No change
				case "seeked":
					if (
						!state.currentItem ||
						state.currentItem.track_id === payload.track_id
					) {
						return { positionMs: payload.position_ms };
					}
					return {}; // No change
				case "unavailable":
					if (
						!state.currentItem ||
						state.currentItem.track_id === payload.track_id
					) {
						return {
							playbackState: "unavailable",
							currentTrackId: payload.track_id,
						};
					}
					return {}; // No change
				case "volume_changed":
					return { volume: payload.volume };
				case "shuffle_changed":
					return { shuffle: payload.shuffle };
				case "repeat_changed":
					if (["context", "track", "off"].includes(payload.repeat)) {
						return { repeat: payload.repeat as PlayerState["repeat"] };
					}
					console.warn("Invalid repeat value received:", payload.repeat);
					return {}; // No change on invalid value
				case "auto_play_changed":
					return { autoPlay: payload.auto_play };
				case "filter_explicit_content_changed":
					return { filterExplicitContent: payload.filter };
				case "session_disconnected":
					return initialState;

				default:
					console.warn("Unhandled player event type (Zustand):", payload);
					return {}; // Return empty object for no state change
			}
		});
	},
}));

export const PlayerEventInitializer: React.FC = () => {
	const handlePlayerEvent = usePlayerStore((state) => state.handlePlayerEvent);

	useEffect(() => {
		const handleMessage: EventCallback<SpotifyPlayerEventPayload> = (event) => {
			try {
				const payload = event.payload;
				if (payload && typeof payload.type === "string") {
					handlePlayerEvent(payload);
				} else {
					console.error("Received invalid event data:", event);
				}
			} catch (error) {
				console.error("Failed to parse player event:", error, event);
			}
		};

		const unlistenPromise = listen("spotify_player_event", handleMessage);

		return () => {
			unlistenPromise.then((unlistenFn) => unlistenFn());
		};
	}, [handlePlayerEvent]);
	return null;
};
