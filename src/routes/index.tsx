import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePlayerStore } from "@/context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
	component: Index,
});

function Index() {
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

		const reader = new FileReader();
		reader.onload = async (e) => {
			const dataUrl = e.target?.result as string;
			console.log("Image data URL:", dataUrl);
		};
		reader.readAsDataURL(file);
	};

	return (
		<div className="p-2 flex-1 max-w-md w-full m-auto flex flex-col justify-center mb-10 bg-background gap-4">
			<div>woop</div>

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
								accept="image/svg"
							/>
						</div>
						<div className="space-y-2 w-full">
							<p>Speaker name</p>
							<div className="flex gap-2 flex-1">
								<Input placeholder="SPEAKER" />
								<Button>Change</Button>
							</div>
						</div>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</div>
	);
}
