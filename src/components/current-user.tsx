import { useEvent } from "@/hooks/use-events";
import { emit, emitTo } from "@tauri-apps/api/event";
import { useState } from "react";
import { Avatar, AvatarImage } from "./ui/avatar";

type Images = {
	height: number;
	url: string;
	width: number;
};

type Followers = {
	href: string;
	total: number;
};

type UserResponse = {
	country: string;
	display_name: string;
	email: string;
	followers: Followers[];
	href: string;
	id: string;
	images: Images[];
};
export const CurrentUser = () => {
	const [user, setUser] = useState<UserResponse | null>(null);

	useEvent<string>("spotify_new_connection", async (event) => {
		const response = await fetch("https://api.spotify.com/v1/me", {
			headers: {
				Authorization: `Bearer ${event.payload}`,
			},
		});

		if (!response.ok) {
			throw new Error("Network response was not ok");
		}

		const data: UserResponse = await response.json();
		emitTo({ kind: "App" }, "info", {
			message: `${data.display_name} connected`,
		});

		setUser(data);
	});

	if (!user) {
		return null;
	}

	return (
		<div className="flex gap-2 flex-row items-center">
			<div>
				<Avatar className="rounded-sm">
					<AvatarImage src={user.images[1].url} />
				</Avatar>
			</div>
			<div>{user.display_name}</div>
		</div>
	);
};
