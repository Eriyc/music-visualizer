import type { EventCallback } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEvent } from "./use-events";

export const useAudioEvent = () => {
  const audioContextRef = useRef<AudioContext>(null);
  const analyserRef = useRef<AnalyserNode>(null);
  const dataArrayRef = useRef<Uint8Array>(null);
  const preAmpGainNodeRef = useRef<GainNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const [isMounted, setIsMounted] = useState(false); // Flag to prevent state updates on unmounted component

  useEffect(() => {
    try {
      // Use window.AudioContext directly if standardized-audio-context isn't needed/used
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048; // Example FFT size
      dataArrayRef.current = new Uint8Array(analyserRef.current.fftSize);

      const preAmpGain = audioContextRef.current.createGain();
      preAmpGain.gain.value = 1.0; // Start with 2x amplification (adjust this value!)
      preAmpGainNodeRef.current = preAmpGain;

      // Create the playback gain node (optional, for volume control)
      const playbackGainNode = audioContextRef.current.createGain();
      gainNodeRef.current = playbackGainNode; // Assuming gainNodeRef exists for playback volume

      preAmpGainNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(playbackGainNode);
      playbackGainNode.connect(audioContextRef.current.destination);

      console.log(
        "Web Audio API initialized. Sample Rate:",
        audioContextRef.current.sampleRate
      );
    } catch (e) {
      console.error("Web Audio API not supported or failed to initialize:", e);
    }

    // Cleanup Web Audio on unmount
    return () => {
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        console.log("Closing Web Audio API context");
        audioContextRef.current.close();
      }
    };
  }, []); // Run only once on mount

  const handleAudioEvent: EventCallback<number[]> = useCallback(
    (event) => {
      if (!isMounted) return;
      const chunk = event.payload;

      if (
        !audioContextRef.current ||
        !analyserRef.current ||
        !dataArrayRef.current ||
        !preAmpGainNodeRef.current ||
        chunk?.length === 0
      ) {
        return;
      }

      const sampleRate = audioContextRef.current.sampleRate;
      const buffer = audioContextRef.current.createBuffer(
        1, // channels (librespot usually mono or stereo, adjust if needed)
        chunk.length,
        sampleRate // Use context's sample rate
      );

      buffer.getChannelData(0).set(chunk);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      // Connect to analyser for visualization/analysis
      source.connect(preAmpGainNodeRef.current);
      source.start();
    },
    [isMounted]
  );
  useEvent<number[]>("audio_chunk", handleAudioEvent); // Listen for audio chunks

  // --- Effect for Listening to Audio Chunks ---
  useEffect(() => {
    setIsMounted(true); // Flag to prevent state updates on unmounted component

    return () => {
      setIsMounted(false); // Flag to prevent state updates on unmounted component
    };
  }, []); // Empty dependency array: Run setup/cleanup only once on mount/unmount

  return {
    analyser: analyserRef,
    dataArray: dataArrayRef,
    audioContext: audioContextRef,
    isMounted,
  };
};
