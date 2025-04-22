import {
	createFileRoute,
	getRouteApi,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePlayerStore } from "@/context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { handleUpload } from "@/lib/handle-upload";
import { appDataDir, join } from "@tauri-apps/api/path";

export const Route = createFileRoute("/")({
	component: Index,
	loader: async () => {
		const name = await invoke<string | undefined>("read_string", {
			key: "name",
		});
		const logo = await invoke<string | undefined>("read_string", {
			key: "logo",
		});

		const appDataDirPath = await appDataDir();
		const filePath = await join(appDataDirPath, `logos/${logo}`);
		const assetUrl = convertFileSrc(filePath);

		return { name, logo: assetUrl };
	},
});

function Index() {
	const routeApi = getRouteApi("/");
	const data = routeApi.useLoaderData();

	const [newName, setNewName] = useState<string>(data.name ?? "SPEAKER");
	const [logo, setLogo] = useState<string>(data.logo);

	console.log(logo);

	const playerState = usePlayerStore((state) => state.playbackState);
	const navigate = useNavigate();

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		if (playerState !== "unavailable") {
			navigate({ to: "/player", viewTransition: true });
		}
	}, [playerState]);

	const handleUploadImage = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		console.log("Uploading image...");
		const file = event.target.files?.[0];
		if (!file) return;

		const result = await handleUpload(file);

		const appDataDirPath = await appDataDir();
		const filePath = await join(appDataDirPath, `logos/${result.file_path}`);
		const assetUrl = convertFileSrc(filePath);

		setLogo(assetUrl);
	};

	const handleNameChange = async () => {
		await invoke("store_string", { key: "name", value: newName });
		alert("restart the program for changes to take effect");
	};

	return (
		<div className="p-2 flex-1 max-w-md w-full m-auto flex flex-col justify-center mb-10 bg-background gap-4">
			<div>
				<img src={logo} className="h-32 w-auto aspect-square " alt="logo" />
			</div>
			<div>
				Visible as <span className="font-bold">{data.name}</span> in Spotify
				Connect
			</div>

			<Accordion type="multiple" className="w-full">
				<AccordionItem value="settings" className="w-full">
					<AccordionTrigger className="w-full">
						<p className="w-full">Settings</p>
					</AccordionTrigger>
					<AccordionContent>
						<div className="space-y-2">
							<p>Select image to display?</p>
							<Input
								onChange={handleUploadImage}
								type="file"
								accept="image/*"
							/>
						</div>
						<div className="space-y-2 w-full">
							<p>Speaker name (needs restart to take effect)</p>
							<div className="flex gap-2 flex-1">
								<Input
									value={newName}
									placeholder="SPEAKER"
									onChange={(e) => setNewName(e.target.value)}
								/>
								<Button onClick={handleNameChange}>Change</Button>
							</div>
						</div>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</div>
	);
}
