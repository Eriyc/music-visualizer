import { useProgress } from "@/hooks/use-progress";
import { formatMs } from "@/lib/utils";

export const ProgressBar = () => {
	const { displayPosition, duration } = useProgress();

	const progressPercent =
		displayPosition > 0 ? (displayPosition / (duration ?? 1)) * 100 : 0;

	return (
		<div className="h-8 flex-1 gap-2 flex flex-row items-center">
			<div className="w-18">
				<span>{formatMs(displayPosition)}</span>
			</div>
			<div className="bg-rainbow w-full h-full relative rounded-sm [transition:_width_1s_ease] overflow-hidden">
				<div
					className="h-full bg-muted right-0 top-0 bottom-0  absolute"
					style={{
						width: `${100 - progressPercent}%`,
					}}
				/>
			</div>
			<div className="w-18">
				<span>{formatMs(duration ?? 0)}</span>
			</div>
		</div>
	);
};
