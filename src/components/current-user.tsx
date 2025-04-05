import { useEvent } from "@/hooks/use-events";
import { useState } from "react";

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
		console.log("event", event);

		const response = await fetch("https://api.spotify.com/v1/me", {
			headers: {
				Authorization: `Bearer ${event.payload}`,
			},
		});

		if (!response.ok) {
			throw new Error("Network response was not ok");
		}

		const data: UserResponse = await response.json();
		console.log(data);

		setUser(data);
	});

	if (!user) {
		return <div>Loading...</div>;
	}

	return (
		<div className="flex gap-2 flex-row items-center">
			<div>
				<img
                    className="rounded-sm"
					src={user.images[1].url}
					alt={user.display_name}
					width={32}
					height={32}
				/>
			</div>
			<div>{user.display_name}</div>
		</div>
	);
};
