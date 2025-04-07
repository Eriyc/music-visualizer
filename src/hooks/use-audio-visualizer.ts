import { useCallback, useEffect, useRef, useState, useMemo } from "react";
// *** Import Tauri event functions directly ***
import {
  listen,
  type Event as TauriEvent, // Rename to avoid conflict with DOM Event
  type UnlistenFn,
} from "@tauri-apps/api/event";

// --- Configuration ---
// !! IMPORTANT: Set these based on the actual data from Tauri !!
const INCOMING_AUDIO_CHANNELS: 1 | 2 = 2; // 1 for mono, 2 for stereo
const INCOMING_DATA_IS_FLOAT32: boolean = true; // true if numbers are -1.0 to 1.0, false if e.g., Int16
export const DEFAULT_PRE_AMP_GAIN = 2.5; // Initial amplification factor (adjust as needed)
// --- ---

interface UseStreamedAudioVisualizerOptions {
  initialPreAmpGain?: number;
  initialPlaybackGain?: number;
  fftSize?: number;
  smoothingTimeConstant?: number;
}

interface UseStreamedAudioVisualizerReturn {
  audioContextRef: React.RefObject<AudioContext | null>;
  analyserRef: React.RefObject<AnalyserNode | null>;
  preAmpGainNodeRef: React.RefObject<GainNode | null>;
  playbackGainNodeRef: React.RefObject<GainNode | null>;
  isReady: boolean;
  error: string | null;
  resumeContext: () => Promise<void>;
}

export const useStreamedAudioVisualizer = (
  options?: UseStreamedAudioVisualizerOptions
): UseStreamedAudioVisualizerReturn => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const preAmpGainNodeRef = useRef<GainNode | null>(null);
  const playbackGainNodeRef = useRef<GainNode | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null); // Ref to store the unlisten function

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memoizedOptions = useMemo(
    () => ({
      initialPreAmpGain: options?.initialPreAmpGain ?? DEFAULT_PRE_AMP_GAIN,
      initialPlaybackGain: options?.initialPlaybackGain ?? 1.0,
      fftSize: options?.fftSize ?? 2048,
      smoothingTimeConstant: options?.smoothingTimeConstant ?? 0.6,
    }),
    [
      options?.initialPreAmpGain,
      options?.initialPlaybackGain,
      options?.fftSize,
      options?.smoothingTimeConstant,
    ]
  );

  // --- Initialization Effect ---
  useEffect(() => {
    console.log("useStreamedAudioVisualizer: Initializing audio graph...");
    setIsReady(false);
    let localAudioContext: AudioContext | null = null;

    try {
      // ... (Detailed logging steps 1-6 from previous answer recommended here for debugging) ...
      const context = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      localAudioContext = context;

      const analyser = context.createAnalyser();
      analyser.fftSize = memoizedOptions.fftSize;
      analyser.smoothingTimeConstant = memoizedOptions.smoothingTimeConstant;

      const preAmpGain = context.createGain();
      preAmpGain.gain.value = memoizedOptions.initialPreAmpGain;

      const playbackGain = context.createGain();
      playbackGain.gain.value = memoizedOptions.initialPlaybackGain;

      preAmpGain.connect(analyser);
      analyser.connect(playbackGain);

      audioContextRef.current = context;
      analyserRef.current = analyser;
      preAmpGainNodeRef.current = preAmpGain;
      playbackGainNodeRef.current = playbackGain;

      console.log("useStreamedAudioVisualizer: Audio graph initialized.");
      setError(null);
      setIsReady(true); // Signal readiness *only after* successful setup
    } catch (e) {
      console.error(
        "useStreamedAudioVisualizer: Failed to initialize Web Audio:",
        e
      );
      setError(
        `Web Audio init failed: ${e instanceof Error ? e.message : String(e)}`
      );
      // Ensure refs are nullified
      audioContextRef.current = null;
      analyserRef.current = null;
      preAmpGainNodeRef.current = null;
      playbackGainNodeRef.current = null;
      setIsReady(false);
    }

    // --- Cleanup Function for Initialization Effect ---
    return () => {
      console.log("useStreamedAudioVisualizer: Cleaning up audio graph...");
      setIsReady(false); // Mark as not ready during cleanup
      const contextToClose = localAudioContext || audioContextRef.current;
      if (contextToClose && contextToClose.state !== "closed") {
        contextToClose.close().catch((err) => {
          console.warn("Error closing AudioContext:", err);
        });
      }
      // Nullify refs
      audioContextRef.current = null;
      analyserRef.current = null;
      preAmpGainNodeRef.current = null;
      playbackGainNodeRef.current = null;
    };
  }, [memoizedOptions]); // Rerun if options change

  // --- Audio Chunk Processing Callback ---
  // Defined with useCallback, but dependencies are stable refs/state
  const handleAudioEvent = useCallback(
    (event: TauriEvent<number[]>) => {
      const chunk = event.payload;
      const context = audioContextRef.current;
      const preAmpGain = preAmpGainNodeRef.current;

      // *** Remove the !isReady check - it's implicitly handled by when the listener is active ***
      // Still check for valid context, gain node, and chunk
      if (!context || !preAmpGain || !chunk || chunk.length === 0) {
        // console.warn("Context/Gain not ready or empty chunk in handleAudioEvent.");
        return;
      }

      try {
        if (context.state === "suspended") {
          context
            .resume()
            .catch((e) => console.warn("Failed to resume audio context:", e));
        }

        const sampleRate = context.sampleRate;
        const frameCount = chunk.length / INCOMING_AUDIO_CHANNELS;

        if (!Number.isInteger(frameCount) || frameCount <= 0) {
          console.warn(`Invalid frame count (${frameCount}). Skipping chunk.`);
          return;
        }

        const buffer = context.createBuffer(
          INCOMING_AUDIO_CHANNELS,
          frameCount,
          sampleRate
        );

        let audioData: Float32Array;
        if (INCOMING_DATA_IS_FLOAT32) {
          audioData = new Float32Array(chunk);
        } else {
          console.error("Audio data conversion needed but not implemented.");
          return;
        }

        if (INCOMING_AUDIO_CHANNELS === 2) {
          if (audioData.length !== frameCount * 2) {
            console.warn("Stereo data length mismatch. Skipping chunk.");
            return;
          }
          const left = buffer.getChannelData(0);
          const right = buffer.getChannelData(1);
          for (let i = 0; i < frameCount; i++) {
            left[i] = audioData[i * 2];
            right[i] = audioData[i * 2 + 1];
          }
        } else {
          if (audioData.length !== frameCount) {
            console.warn("Mono data length mismatch. Skipping chunk.");
            return;
          }
          buffer.getChannelData(0).set(audioData);
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(preAmpGain);
        source.start(0);

        source.onended = () => {
          try {
            source.disconnect();
          } catch (e) {
            /* ignore */
          }
        };
      } catch (e) {
        console.error("Error processing audio chunk:", e);
      }
    },
    [] // No dependencies needed as it uses refs and constants
  );

  // --- Effect to Manage Tauri Event Listener ---
  useEffect(() => {
    // Only listen if the audio graph is ready
    if (isReady) {
      console.log(
        "useStreamedAudioVisualizer: Audio ready, starting event listener for 'audio_chunk'..."
      );
      // Use Tauri's listen function directly
      const promise = listen<number[]>("audio_chunk", handleAudioEvent);

      promise
        .then((unlistenFn) => {
          // Store the unlisten function to be called on cleanup
          unlistenRef.current = unlistenFn;
          console.log("useStreamedAudioVisualizer: Event listener attached.");
        })
        .catch((err) => {
          console.error(
            "useStreamedAudioVisualizer: Failed to attach event listener:",
            err
          );
          setError(`Failed to listen for audio_chunk: ${err}`);
        });
    } else {
      // If not ready, ensure any existing listener is cleaned up
      // (This handles cases where isReady might toggle, though unlikely here)
      if (unlistenRef.current) {
        console.log(
          "useStreamedAudioVisualizer: Audio not ready, detaching listener (if any)..."
        );
        unlistenRef.current();
        unlistenRef.current = null;
      }
    }

    // --- Cleanup for the Listener Effect ---
    return () => {
      if (unlistenRef.current) {
        console.log(
          "useStreamedAudioVisualizer: Cleaning up event listener..."
        );
        unlistenRef.current(); // Call the unlisten function provided by Tauri
        unlistenRef.current = null;
      }
    };
  }, [isReady, handleAudioEvent]); // Dependencies: Run when readiness changes or handler changes

  // --- Manual Context Resume Function ---
  const resumeContext = useCallback(async (): Promise<void> => {
    // ... (same as before) ...
    if (
      audioContextRef.current &&
      audioContextRef.current.state === "suspended"
    ) {
      console.log("Attempting to resume AudioContext manually...");
      try {
        await audioContextRef.current.resume();
        console.log("AudioContext resumed successfully.");
      } catch (e) {
        console.error("Manual resume of AudioContext failed:", e);
        setError(
          `Failed to resume audio context: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }
  }, []);

  // --- Return Hook API ---
  return {
    audioContextRef,
    analyserRef,
    preAmpGainNodeRef,
    playbackGainNodeRef,
    isReady,
    error,
    resumeContext,
  };
};
