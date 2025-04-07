import { ButterchurnVisualizer } from "@/components/butterchurn";
import { CurrentTrackInfo } from "@/components/current-track-info";
import Lyrics from "@/components/lyrics";
import { ProgressBar } from "@/components/progress-bar";
import { createFileRoute } from "@tanstack/react-router";
import {
	createContext,
	KeyboardEvent,
	type KeyboardEventHandler,
	useEffect,
	useRef,
} from "react";

export const Route = createFileRoute("/player")({
	component: PlayerComponent,
});

// 1. Create a Context
interface VisualizerContextType {
	triggerEffect: () => void;
}

const VisualizerContext = createContext<VisualizerContextType | null>(
	{} as VisualizerContextType,
);

function PlayerComponent() {
	const visualizerRef = useRef<VisualizerContextType>(null);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	const handleKeyDown = (event: globalThis.KeyboardEvent) => {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			triggerVisualizerEffect();
		}
	};

	const triggerVisualizerEffect = () => {
		if (visualizerRef.current?.triggerEffect) {
			visualizerRef.current.triggerEffect();
		}
	};

	return (
		<VisualizerContext.Provider value={visualizerRef.current}>
			<main className="flex flex-col flex-1 relative max-h-screen overflow-hidden">
				<div className="flex flex-row gap-2 flex-1 max-h-screen">
					<div className="flex-1/5 flex flex-col bg-muted/40 ">
						<div className="mb-4 p-4">
							<CurrentTrackInfo />
						</div>
						<div>
							<ProgressBar />
						</div>
						<div className="flex-1" />
					</div>
					<div className="flex-4/5">
						<Lyrics />
					</div>
				</div>
				<div className="absolute top-0 left-0 w-full h-full -z-10">
					<ButterchurnVisualizer ref={visualizerRef} />
				</div>
			</main>
		</VisualizerContext.Provider>
	);
}
