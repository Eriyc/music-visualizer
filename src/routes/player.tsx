import { ButterchurnVisualizer } from "@/components/butterchurn";
import { CurrentTrackInfo } from "@/components/current-track-info";
import Lyrics from "@/components/lyrics";
import { ProgressBar } from "@/components/progress-bar";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { createContext, useEffect, useRef } from "react";

export const Route = createFileRoute("/player")({
	component: PlayerComponent,
	loader: async () => {
		const logo = await invoke<string | undefined>("read_string", {
			key: "logo",
		});

		const appDataDirPath = await appDataDir();
		const filePath = await join(appDataDirPath, `logos/${logo}`);
		const assetUrl = convertFileSrc(filePath);

		return { logo: assetUrl };
	},
});

// 1. Create a Context
interface VisualizerContextType {
	triggerEffect: () => void;
}

const VisualizerContext = createContext<VisualizerContextType | null>(
	{} as VisualizerContextType,
);

function PlayerComponent() {
	const routeApi = getRouteApi("/player");
	const data = routeApi.useLoaderData();

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
						<img src={data.logo} className="h-32 w-auto aspect-square " alt="logo" />
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
