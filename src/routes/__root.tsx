import { CurrentUser } from "@/components/current-user";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { emit } from "@tauri-apps/api/event";

export const Route = createRootRoute({
	onEnter: () => {
		emit("start_listen");
	},
	component: () => (
		<>
			<div className="p-2 flex gap-2">
				<Link to="/" className="[&.active]:font-bold">
					Home
				</Link>{" "}
				<CurrentUser />
			</div>

			<hr />
			<Outlet />
			<TanStackRouterDevtools />
		</>
	),
});
