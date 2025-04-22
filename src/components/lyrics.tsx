import { usePlayerStore } from "@/context";
import { useProgress } from "@/hooks/use-progress";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { type Line, parseLrc } from "@/lib/lyric-utils";
import { cn } from "@/lib/utils";

type Lyrics = {
	type: "synced" | "plain";
	lines: Line[];
};

type LyricsSucess = {
	id: number;
	trackName: string;
	artistName: string;
	albumName: string;
	duration: number;
	instrumental: boolean;
	plainLyrics: string;
	syncedLyrics: string;
};

type LyricsError = {
	code: number;
	message: string;
	name: string;
};

export default function Lyrics() {
	const track = usePlayerStore((state) => state.currentItem);
	const [result, setResult] = useState<Lyrics | null>(null);
	const [error, setError] = useState<LyricsError | null>(null);

	const containerRef = useRef<HTMLDivElement>(null);
	const [activeLineIndex, setActiveLineIndex] = useState(-1);

	const fetchLyrics = async () => {
		if (!track) return;
		setResult(null);
		setError(null);
		setActiveLineIndex(-1);
		const response = await invoke<LyricsSucess>("get_lyrics", {
			artist: track?.artists?.[0],
			track: track?.name,
			album: track.album,
			duration: Math.round(track.duration_ms / 1000).toFixed(0),
		}).catch((e) => {
			const error = e as LyricsError;
			setError(error);
			return null;
		});

		if (!response) {
			return;
		}
		if (!response.syncedLyrics) {
			setResult({
				type: "plain",
				lines: response.plainLyrics.split("\n").map((line) => ({
					startTimeMs: 0,
					words: line,
				})),
			});
			return;
		}
		const lines = parseLrc(response.syncedLyrics);

		setResult({
			type: "synced",
			lines,
		});
	};

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const activeElement = container.querySelector(
			`[data-line="${activeLineIndex}"]`,
		);
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
	}, [activeLineIndex]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		if (track?.uri) {
			fetchLyrics();
		}
	}, [track?.uri]);

	const { displayPosition } = useProgress({ interval: 400 });
	useEffect(() => {
		if (!result || error) return;

		let animationFrameId: number;

		const scollPlainLyrics = () => {
			const container = containerRef.current;
			if (!container) return;

			const top =
				container.offsetHeight * (displayPosition / (track?.duration_ms ?? 1));

			container.scrollTo({
				top,
				behavior: "smooth",
			});
		};

		const updateActiveLine = () => {
			const currentPosition = displayPosition;

			// Find the active line based on the current playback position
			const newLineIndex = result.lines.findIndex((line, index) => {
				if (index === result.lines.length - 1) {
					return currentPosition >= line.startTimeMs;
				}
				const nextLine = result.lines[index + 1];
				return (
					currentPosition >= line.startTimeMs &&
					currentPosition < nextLine.startTimeMs
				);
			});

			if (newLineIndex !== -1 && newLineIndex !== activeLineIndex) {
				setActiveLineIndex(newLineIndex);
			}

			animationFrameId = requestAnimationFrame(updateActiveLine);
		};

		if (result.type === "synced") {
			animationFrameId = requestAnimationFrame(updateActiveLine);
		} else {
			animationFrameId = requestAnimationFrame(scollPlainLyrics);
		}

		return () => {
			cancelAnimationFrame(animationFrameId);
		};
	}, [displayPosition, result, activeLineIndex, error, track?.duration_ms]);
	return (
		<div
			className={cn(
				"overflow-scroll max-h-[100vh] max-w-2/3 pt-4 no-scrollbar",
				result?.type === "plain" && "bg-muted/50",
			)}
			ref={containerRef}
		>
			{result?.lines?.map((line, index) => (
				<p
					// biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
					key={index}
					data-line={index}
					className={cn(
						"transition-colors duration-300 py-1 px-2 text-7xl font-semibold rounded",
						index === activeLineIndex
							? "bg-neutral-700/50 text-white"
							: "text-gray-500 text-5xl",
						result.type === "plain" && "text-white",
						line.words === " " && "my-4",
					)}
				>
					{line.words}
				</p>
			))}
		</div>
	);
}
