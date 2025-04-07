import { ButterchurnVisualizer } from "@/components/butterchurn";
import { CurrentTrackInfo } from "@/components/current-track-info";
import Lyrics from "@/components/lyrics";
import { ProgressBar } from "@/components/progress-bar";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/player")({
	component: PlayerComponent,
});

function PlayerComponent() {
	console.log("PlayerComponent");

	return (
		<main className="flex flex-col flex-1 relative max-h-screen overflow-hidden">
			<div className="flex flex-row gap-2 flex-1 max-h-screen">
				<div className="flex-1/5 flex flex-col">
					<div className="mb-8 p-4">
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
				<ButterchurnVisualizer />
			</div>
		</main>
	);
}
