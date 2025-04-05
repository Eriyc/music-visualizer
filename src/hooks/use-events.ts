import { listen, type EventCallback } from "@tauri-apps/api/event";
import { useCallback, useEffect } from "react";

export const useEvent = <T>(eventName: string, handler: EventCallback<T>) => {
  const startListen = useCallback(async () => {
    return await listen<T>(eventName, handler, {}).catch((e) => {
      console.error("Could not track event", eventName, ":", e);
    });
  }, [eventName, handler]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const t = startListen();
    return () => {
      t.then((unlisten) => unlisten?.()).then((x) => x);
    };
  }, []);
};
