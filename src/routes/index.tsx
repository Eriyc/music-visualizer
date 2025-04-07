import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useEvent } from "@/hooks/use-events";
import { usePlayerStore } from "@/context";

export const Route = createFileRoute("/")({
	component: Index,
});

function Index() {
	const [events, setEvents] = useState<string[]>([]);
	const logEndRef = useRef<HTMLPreElement>(null);
	const playerState = usePlayerStore((state) => state.playbackState);
	const navigate = useNavigate();

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		if (playerState !== "unavailable") {
			navigate({ to: "/player", viewTransition: true });
		}
	}, [playerState]);

	useEvent<string>("info", (event) => {
		console.log("event", event);

		setEvents((prev) => [
			...prev,
			`${new Date().toLocaleTimeString()}: [${event.id}] ${JSON.stringify(event.payload)}`,
		]);
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		// 5. Scroll Logic
		if (logEndRef.current) {
			logEndRef.current.scrollTop = logEndRef.current.scrollHeight;
		}
	}, [events]);

	return (
		<div className="p-2 flex-1 flex flex-col mb-10">
			<h3>State: {playerState}</h3>
			<pre
				className="p-2 bg-stone-200 flex-1 rounded-sm overflow-scroll max-h-96"
				ref={logEndRef}
			>
				{events.map((event, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
					<div key={index}>{event}</div>
				))}
			</pre>
		</div>
	);
}
