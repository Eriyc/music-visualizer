import type React from "react";
import {
	useEffect,
	useRef,
	useState,
	useCallback,
	type FC, // Use FC for component type
} from "react";

// --- Standard ES Module Imports ---
// NOTE: This assumes 'butterchurn' and 'butterchurn-presets' are installed
// via npm/yarn and that your build tool (Vite, Webpack, etc.) can correctly
// resolve and handle their module format (ESM, CommonJS, UMD).
// If these imports fail, it might indicate issues with the library packaging
// or your build configuration.
import Butterchurn, { type Visualizer } from "butterchurn";
import { getPresets } from "butterchurn-presets"; // Use namespace import if getPresets isn't a direct export
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/test")({
	component: MinimalButterchurnTestWithFile,
});

function MinimalButterchurnTestWithFile() {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const visualizerRef = useRef<Visualizer | null>(null); // Use imported Visualizer type
	const audioContextRef = useRef<AudioContext | null>(null);
	const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
	const animationFrameIdRef = useRef<number | null>(null);

	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isInitialized, setIsInitialized] = useState<boolean>(false);
	const [fileName, setFileName] = useState<string | null>(null);

	// --- Cleanup Function ---
	const cleanup = useCallback(() => {
		console.log("MVP File Test: Cleaning up...");
		if (animationFrameIdRef.current) {
			cancelAnimationFrame(animationFrameIdRef.current);
			animationFrameIdRef.current = null;
		}
		if (sourceNodeRef.current) {
			try {
				sourceNodeRef.current.stop();
				sourceNodeRef.current.disconnect();
			} catch (e) {
				/* ignore */
			}
			sourceNodeRef.current = null;
		}
		// visualizerRef.current?.destroy?.(); // If destroy exists
		visualizerRef.current = null;
		if (audioContextRef.current?.state !== "closed") {
			audioContextRef.current?.close().catch(console.warn);
		}
		audioContextRef.current = null;
		setIsInitialized(false);
		setFileName(null);
	}, []);

	// --- Effect for component unmount cleanup ---
	useEffect(() => {
		return cleanup;
	}, [cleanup]);

	// --- File Loading and Initialization Logic ---
	const handleFileChange = useCallback(
		async (event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (!file) return;

			cleanup(); // Start fresh

			setIsLoading(true);
			setError(null);
			setFileName(file.name);
			console.log(`MVP File Test: Loading file "${file.name}"...`);

			try {
				// 1. Initialize AudioContext
				const audioContext = new AudioContext();
				audioContextRef.current = audioContext;
				console.log("MVP File Test: AudioContext created.");

				if (!canvasRef.current) {
					throw new Error("Canvas element not found.");
				}
				const canvas = canvasRef.current;

				const arrayBuffer = await file.arrayBuffer();
				console.log("MVP File Test: File read.");
				const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
				console.log("MVP File Test: Audio decoded.");

				// 2. Create AudioBufferSourceNode
				const sourceNode = audioContext.createBufferSource();
				sourceNode.buffer = decodedBuffer;
				sourceNodeRef.current = sourceNode;

				sourceNode.connect(audioContext.destination); // Connect to speakers
				console.log("MVP File Test: SourceNode connected to destination.");

				// 3. Create Visualizer
				const initialWidth = 800;
				const initialHeight = 600;
				canvas.width = initialWidth;
				canvas.height = initialHeight;

				// Use the imported Butterchurn object directly
				const visualizer = Butterchurn.createVisualizer(audioContext, canvas, {
					width: initialWidth,
					height: initialHeight,
				});
				visualizerRef.current = visualizer;
				console.log("MVP File Test: Visualizer created.");

				// 4. Connect Audio Source to Visualizer
				visualizer.connectAudio(sourceNode);
				console.log("MVP File Test: connectAudio called with sourceNode.");

				// 5. Load Preset
				const presets = getPresets(); // Use helper function
				const presetName =
					"Flexi, martin + geiss - dedicated to the sherwin maxawow";
				const preset = presets?.[presetName];

				if (preset) {
					visualizer.loadPreset(preset, 0.0);
					console.log(`MVP File Test: Preset "${presetName}" loaded.`);
				} else {
					console.warn(`MVP File Test: Preset "${presetName}" not found!`);
				}

				// 6. Resize Visualizer (Optional)
				// visualizer.setRendererSize(1600, 1200);
				// console.log(`MVP Test: setRendererSize called.`);

				// --- Start Playback and Rendering ---
				sourceNode.start(0);
				console.log("MVP File Test: sourceNode started.");
				setIsInitialized(true);

				sourceNode.onended = () => {
					console.log("MVP File Test: Audio file finished.");
					sourceNodeRef.current = null;
				};
			} catch (err) {
				console.error("MVP File Test: Error during file processing:", err);
				setError(
					`Failed to load/process file: ${
						err instanceof Error ? err.message : String(err)
					}`,
				);
				cleanup();
			} finally {
				setIsLoading(false);
				event.target.value = ""; // Reset file input
			}
		},
		[cleanup],
	);

	// --- Effect for Render Loop ---
	useEffect(() => {
		if (!isInitialized || !visualizerRef.current) return;

		console.log("MVP File Test: Starting render loop...");
		let isActive = true;

		const renderLoop = () => {
			if (!isActive || !visualizerRef.current) return;
			try {
				visualizerRef.current.render();
			} catch (err) {
				console.error("MVP File Test: Render error:", err);
				isActive = false;
				setError(
					`Render error: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
			if (isActive) {
				animationFrameIdRef.current = requestAnimationFrame(renderLoop);
			}
		};
		renderLoop();

		return () => {
			console.log("MVP File Test: Stopping render loop...");
			isActive = false;
			if (animationFrameIdRef.current) {
				cancelAnimationFrame(animationFrameIdRef.current);
				animationFrameIdRef.current = null;
			}
		};
	}, [isInitialized]);

	// --- Render Component ---
	return (
		<div style={{ padding: "10px", border: "1px solid #ccc" }}>
			<h3>Minimal Butterchurn Test (File Input - ESM Imports)</h3>
			<input
				type="file"
				accept="audio/*"
				onChange={handleFileChange}
				disabled={isLoading}
				style={{ display: "block", marginBottom: "10px" }}
			/>
			{isLoading && <div>Loading audio file...</div>}
			{error && <div style={{ color: "red" }}>Error: {error}</div>}
			{fileName && !isLoading && !error && <div>Playing: {fileName}</div>}

			<div
				style={{
					width: "800px",
					height: "600px",
					border: "1px solid grey",
					position: "relative",
					marginTop: "10px",
					background: "#000",
				}}
			>
				<canvas
					ref={canvasRef}
					style={{ display: "block", width: "100%", height: "100%" }}
				/>
				{!isInitialized && !isLoading && !error && (
					<div
						style={{
							position: "absolute",
							top: "50%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							color: "white",
							background: "rgba(0,0,0,0.7)",
							padding: "15px",
							borderRadius: "5px",
						}}
					>
						Select an audio file to start.
					</div>
				)}
			</div>
		</div>
	);
}
