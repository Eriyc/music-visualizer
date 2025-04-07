import { PlayerEventInitializer } from "@/context/player-context";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { emit } from "@tauri-apps/api/event";

export const Route = createRootRoute({
	onEnter: () => {
		emit("start_listen");
	},
	component: () => (
		<>
			<Outlet />
			<PlayerEventInitializer />
			<TanStackRouterDevtools />
		</>
	),
});
