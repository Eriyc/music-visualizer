import { usePlayerStore } from "@/context";
import { useProgress } from "@/hooks/use-progress";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Line = {
	startTimeMs: string;
	endTimeMs: string;
	words: string;
	syllables: string[];
};

type Lyrics = {
	error: boolean;
	message?: string;
	lines: Line[];
	syncType: "UNSYNCED" | "LINE_SYNCED";
};

export default function Lyrics() {
	const trackUri = usePlayerStore((state) => state.currentItem?.track_id);

	const [result, setResult] = useState<Lyrics | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [activeLineIndex, setActiveLineIndex] = useState(0);

	const fetchLyrics = async () => {
		const response = await invoke<Lyrics>("get_lyrics", {
			trackId: trackUri,
		}).catch(console.error);

		setResult(response);
	};

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const activeElement = container.querySelector(`[data-line="${0}"]`);
		if (!activeElement) return;

		// Calculate the scroll position to center the active line
		const containerHeight = container.clientHeight;
		const elementTop = activeElement.getBoundingClientRect().top;
		const containerTop = container.getBoundingClientRect().top;
		const elementRelativeTop = elementTop - containerTop;
		const centerPosition = elementRelativeTop - containerHeight / 2;

		// Smooth scroll to the position
		container.scrollTo({
			top: container.scrollTop + centerPosition + 24,
			behavior: "smooth",
		});
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		if (trackUri) {
			fetchLyrics();
		}
	}, [trackUri]);

	const { displayPosition } = useProgress({ interval: 400 });
	useEffect(() => {
		if (!result || result.error || result.syncType !== "LINE_SYNCED") return;

		let animationFrameId: number;

		const updateActiveLine = () => {
			const currentPosition = displayPosition;

			// Find the active line based on the current playback position
			const newLineIndex = result.lines.findIndex((line, index) => {
				if (index === result.lines.length - 1) {
					return currentPosition >= Number.parseInt(line.startTimeMs);
				}
				const nextLine = result.lines[index + 1];
				return (
					currentPosition >= Number.parseInt(line.startTimeMs) &&
					currentPosition < Number.parseInt(nextLine.startTimeMs)
				);
			});

			if (newLineIndex !== -1 && newLineIndex !== activeLineIndex) {
				setActiveLineIndex(newLineIndex);
			}

			animationFrameId = requestAnimationFrame(updateActiveLine);
		};

		animationFrameId = requestAnimationFrame(updateActiveLine);

		return () => {
			cancelAnimationFrame(animationFrameId);
		};
	}, [displayPosition, result, activeLineIndex]);

	return (
		<div className="overflow-scroll max-h-[100vh] pt-4">
			{result?.error && <div>Error: {result.message}</div>}
			{result?.lines?.map((line, index) => (
				<p
					// biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
					key={index}
					data-line={index}
					className={`transition-all duration-300 py-2 text-4xl font-semibold rounded ${
						index === 0 ? "bg-neutral-700 text-white" : "text-gray-500"
					}`}
				>
					{line.words}
				</p>
			))}
		</div>
	);
}
