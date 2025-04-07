import { usePlayerStore } from "@/context";
import { useEffect, useRef, useState } from "react";

export const useProgress = (
  { interval }: { interval: number } = { interval: 1000 }
) => {
  const storePosition = usePlayerStore((state) => state.positionMs);
  const duration = usePlayerStore((state) => state.currentItem?.duration_ms);
  const state = usePlayerStore((state) => state.playbackState);
  const currentTrackId = usePlayerStore((state) => state.currentTrackId);

  const [displayPosition, setDisplayPosition] = useState(storePosition ?? 0);
  const intervalRef = useRef<number | null>(null); // Ref to hold interval ID

  const isPlaying = ["playing", "preloading"].includes(state); // <-- ADJUST THIS CONDITION if needed

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    // console.log("Store position changed, resetting display position:", storePosition);
    setDisplayPosition(storePosition ?? 0);
  }, [storePosition, currentTrackId]); // Depend on storePosition and trackId

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only start the timer if playing and duration is valid
    if (isPlaying && duration && duration > 0) {
      // console.log("Starting timer");
      intervalRef.current = setInterval(() => {
        setDisplayPosition((prevPosition) => {
          // Increment position, but don't exceed duration
          const newPosition = Math.min(prevPosition + interval, duration);
          // console.log("Timer tick:", newPosition);
          return newPosition;
        });
      }, interval); // Update every 1000ms (1 second)
    } else {
      // console.log("Timer stopped (not playing or no duration)");
    }

    // Cleanup function: clear interval when component unmounts or dependencies change
    return () => {
      if (intervalRef.current) {
        // console.log("Clearing timer interval");
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, duration, currentTrackId]); // Re-run effect if playing state, duration, or track changes

  return { displayPosition, duration };
};
