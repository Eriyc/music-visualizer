import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  listen,
  type Event as TauriEvent,
  type UnlistenFn,
} from "@tauri-apps/api/event";

// heavily vibe-coded (not really, but LLM's could find the issues in my initial code. I don't know anything about audio)

const INCOMING_AUDIO_CHANNELS: 1 | 2 = 2; // 1 for mono, 2 for stereo
const INCOMING_DATA_IS_FLOAT32: boolean = true; // true if numbers are -1.0 to 1.0, false if e.g., Int16
export const DEFAULT_PRE_AMP_GAIN = 2.5; // Initial amplification factor (adjust as needed)

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
  const unlistenRef = useRef<UnlistenFn | null>(null);

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

  useEffect(() => {
    console.log("useStreamedAudioVisualizer: Initializing audio graph...");
    setIsReady(false);
    let localAudioContext: AudioContext | null = null;

    try {
      const context = new window.AudioContext();
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

      setError(null);
      setIsReady(true);
    } catch (e) {
      console.error(
        "useStreamedAudioVisualizer: Failed to initialize Web Audio:",
        e
      );
      setError(
        `Web Audio init failed: ${e instanceof Error ? e.message : String(e)}`
      );
      audioContextRef.current = null;
      analyserRef.current = null;
      preAmpGainNodeRef.current = null;
      playbackGainNodeRef.current = null;
      setIsReady(false);
    }

    return () => {
      console.log("useStreamedAudioVisualizer: Cleaning up audio graph...");
      setIsReady(false);
      const contextToClose = localAudioContext || audioContextRef.current;
      if (contextToClose && contextToClose.state !== "closed") {
        contextToClose.close().catch((err) => {
          console.warn("Error closing AudioContext:", err);
        });
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      preAmpGainNodeRef.current = null;
      playbackGainNodeRef.current = null;
    };
  }, [memoizedOptions]);

  const handleAudioEvent = useCallback((event: TauriEvent<number[]>) => {
    const chunk = event.payload;
    const context = audioContextRef.current;
    const preAmpGain = preAmpGainNodeRef.current;

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
        } catch (e) {}
      };
    } catch (e) {
      console.error("Error processing audio chunk:", e);
    }
  }, []);

  useEffect(() => {
    if (isReady) {
      const promise = listen<number[]>("audio_chunk", handleAudioEvent);

      promise
        .then((unlistenFn) => {
          unlistenRef.current = unlistenFn;
        })
        .catch((err) => {
          console.error(
            "useStreamedAudioVisualizer: Failed to attach event listener:",
            err
          );
          setError(`Failed to listen for audio_chunk: ${err}`);
        });
    } else {
      if (unlistenRef.current) {
        console.log(
          "useStreamedAudioVisualizer: Audio not ready, detaching listener (if any)..."
        );
        unlistenRef.current();
        unlistenRef.current = null;
      }
    }

    return () => {
      if (unlistenRef.current) {
        console.log(
          "useStreamedAudioVisualizer: Cleaning up event listener..."
        );
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [isReady, handleAudioEvent]);

  const resumeContext = useCallback(async (): Promise<void> => {
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
