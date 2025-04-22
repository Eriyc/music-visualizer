import { usePlayerStore } from "@/context";
import type { PlayerState } from "@/lib/events";
import { useEffect, useRef, useState } from "react";

export const useProgress = (
  { interval }: { interval: number } = { interval: 1000 }
) => {
  const storePosition = usePlayerStore((state) => state.positionMs);
  const duration = usePlayerStore((state) => state.currentItem?.duration_ms);
  const state = usePlayerStore((state) => state.playbackState);
  const currentTrackId = usePlayerStore((state) => state.currentTrackId);

  const [displayPosition, setDisplayPosition] = useState(storePosition ?? 0);
  const intervalRef = useRef<number | null>(null);

  const stoppedStates: PlayerState["playbackState"][] = [
    "unavailable",
    "stopped",
    "ended",
    "paused",
  ];

  const isPlaying = !stoppedStates.includes(state);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    setDisplayPosition(storePosition ?? 0);
  }, [storePosition, currentTrackId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isPlaying && duration && duration > 0) {
      intervalRef.current = setInterval(() => {
        setDisplayPosition((prevPosition) => {
          const newPosition = Math.min(prevPosition + interval, duration);
          return newPosition;
        });
      }, interval);
    } else {
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, duration, currentTrackId]);

  return { displayPosition, duration };
};
