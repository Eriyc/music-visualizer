import { usePlayerStore } from "@/context";
import { CurrentUser } from "./current-user";

export const CurrentTrackInfo = () => {
	const item = usePlayerStore((state) => state.currentItem);

	if (!item) {
		return <div>Loading...</div>;
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="w-full rounded-sm">
				<img src={item.covers[0]} alt="Cover Art" />
			</div>
			<div>
				<h3 className="text-3xl">{item.name}</h3>
				<p className="text-xl">{item.artists?.[0]}</p>
			</div>
			<CurrentUser />
		</div>
	);
};
