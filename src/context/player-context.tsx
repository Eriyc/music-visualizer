import { create } from "zustand";
import type {
	PlayerState,
	SpotifyPlayerEventPayload,
	SerializableAudioItem,
} from "@/lib/events"; // Adjust path if needed

import type React from "react";
import { useEffect } from "react";
import { listen, type EventCallback } from "@tauri-apps/api/event";

// Define the shape of the store, including state and actions
interface PlayerStore extends PlayerState {
	// Action to process incoming player events
	handlePlayerEvent: (payload: SpotifyPlayerEventPayload) => void;
	// You could add other actions here if needed for UI interactions later
	// e.g., sendSeekCommand: (positionMs: number) => void;
}

// Re-use the initial state definition
const initialState: PlayerState = {
	playbackState: "unavailable",
	positionMs: 0,
	volume: 65535,
	shuffle: false,
	repeat: "off",
	autoPlay: false,
	filterExplicitContent: false,
	// Ensure all fields from PlayerState are here
	playRequestId: undefined,
	currentItem: undefined,
	currentTrackId: undefined,
};

export const usePlayerStore = create<PlayerStore>((set) => ({
	...initialState, // Spread the initial state

	// Define the action to handle events
	handlePlayerEvent: (payload) => {
		console.log("Received event (Zustand):", payload.type, payload); // Debug log

		// 'set' merges the returned object with the current state
		set((state) => {
			// --- Logic directly moved from playerReducer ---
			switch (payload.type) {
				case "play_request_id_changed":
					// Return only the changed part
					return { playRequestId: payload.play_request_id };
				case "track_changed": {
					const { type, ...item } = payload;
					return {
						currentItem: item as SerializableAudioItem,
						currentTrackId: item.track_id,
						positionMs: 0, // Reset position
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
					console.log("Preloading:", payload.track_id);
					return {}; // No state change needed, just log
				case "end_of_track":
					if (state.currentItem?.track_id === payload.track_id) {
						return {
							playbackState: "ended",
							// Use current state's duration if available
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

	// Example of another action you might add later:
	// sendSeekCommand: async (positionMs: number) => {
	//   const currentTrackId = get().currentTrackId; // Use get() to access current state inside actions
	//   if (currentTrackId) {
	//     try {
	//       // Replace with your actual Tauri command invocation
	//       await invoke('seek_player', { trackId: currentTrackId, positionMs });
	//       // Optionally update local state optimistically or wait for seeked event
	//       set({ positionMs });
	//     } catch (error) {
	//       console.error("Failed to send seek command:", error);
	//     }
	//   }
	// }
}));

// --- Component to Initialize Event Listener ---
// This component should be rendered once near the root of your app.
// It doesn't render anything itself but sets up the Tauri listener.

export const PlayerEventInitializer: React.FC = () => {
	// Get the action function from the store.
	// Using the selector ensures we get the function reference correctly.
	const handlePlayerEvent = usePlayerStore((state) => state.handlePlayerEvent);

	useEffect(() => {
		const handleMessage: EventCallback<SpotifyPlayerEventPayload> = (event) => {
			try {
				const payload = event.payload;
				if (payload && typeof payload.type === "string") {
					// Call the Zustand action instead of dispatch
					handlePlayerEvent(payload);
				} else {
					console.error("Received invalid event data:", event);
				}
			} catch (error) {
				console.error("Failed to parse player event:", error, event);
			}
		};

		const unlistenPromise = listen("spotify_player_event", handleMessage);

		// Cleanup listener on component unmount
		return () => {
			unlistenPromise.then((unlistenFn) => unlistenFn());
		};
	}, [handlePlayerEvent]); // Include handlePlayerEvent in dependency array

	return null; // This component does not render anything
};
