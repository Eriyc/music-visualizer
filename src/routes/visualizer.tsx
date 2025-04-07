import { createFileRoute } from "@tanstack/react-router";
import type React from "react";
import { useEffect, useRef, useCallback, useState } from "react";
import {
	DEFAULT_PRE_AMP_GAIN,
	useStreamedAudioVisualizer,
} from "@/hooks/use-audio-visualizer"; // Adjust path

export const Route = createFileRoute("/visualizer")({
	component: ButterchurnVisualizerWithNewHook,
});

// Import Butterchurn and presets using standard imports
import Butterchurn, { type Visualizer } from "butterchurn";
import { getPresets } from "butterchurn-presets";

// Helper to get presets (same as before)

export function ButterchurnVisualizerWithNewHook() {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const visualizerRef = useRef<Visualizer | null>(null);
	const animationFrameIdRef = useRef<number | null>(null);
	const [initError, setInitError] = useState<string | null>(null); // Separate init error

	// *** Use the new hook ***
	const {
		analyserRef, // Use the ref directly
		audioContextRef, // Use the ref directly
		preAmpGainNodeRef, // Ref for controlling intensity
		playbackGainNodeRef, // Ref for controlling volume
		isReady: isAudioReady, // Renamed for clarity
		error: audioHookError,
		resumeContext,
	} = useStreamedAudioVisualizer({
		// Optional configuration:
		// initialPreAmpGain: 3.0,
		// fftSize: 1024,
	});

	const [isVisualizerInitialized, setIsVisualizerInitialized] = useState(false);

	// --- Connect Butterchurn ---
	const connectVisualizer = useCallback(() => {
		if (!visualizerRef.current || !analyserRef.current) {
			console.warn("Connect Error: Visualizer or Analyser not ready.");
			return false;
		}
		try {
			console.log("Connecting visualizer to analyser node...");
			visualizerRef.current.connectAudio(analyserRef.current);
			console.log("Visualizer connected successfully.");
			return true;
		} catch (e) {
			console.error("Failed to connect visualizer:", e);
			setInitError(
				`Visualizer connect failed: ${e instanceof Error ? e.message : String(e)}`,
			);
			return false;
		}
	}, [analyserRef]); // Depend on analyserRef object

	// --- Initialize Butterchurn ---
	useEffect(() => {
		// Wait for audio hook to be ready and canvas to exist
		if (
			!isAudioReady ||
			!canvasRef.current ||
			visualizerRef.current ||
			!audioContextRef.current
		) {
			return;
		}

		// Handle errors from the audio hook
		if (audioHookError) {
			setInitError(`Audio Hook Error: ${audioHookError}`);
			return;
		}

		console.log("Initializing Butterchurn Visualizer...");
		const canvas = canvasRef.current;

		try {
			const initialWidth = canvas.offsetWidth || 800;
			const initialHeight = canvas.offsetHeight || 600;
			canvas.width = initialWidth;
			canvas.height = initialHeight;

			const visualizer = Butterchurn.createVisualizer(
				audioContextRef.current, // Use context from hook's ref
				canvas,
				{ width: initialWidth, height: initialHeight },
			);
			visualizerRef.current = visualizer; // Store ref immediately
			console.log("Butterchurn visualizer instance created.");

			// Connect audio
			if (!connectVisualizer()) {
				visualizerRef.current = null; // Clear ref if connection failed
				return; // Stop initialization
			}

			// Load preset
			const presets = getPresets();
			const presetName =
				"Flexi, martin + geiss - dedicated to the sherwin maxawow";
			const preset = presets?.[presetName];
			if (preset) {
				visualizer.loadPreset(preset, 0.0);
				console.log(`Preset "${presetName}" loaded.`);
			} else {
				console.warn(`Preset "${presetName}" not found.`);
			}

			setIsVisualizerInitialized(true); // Signal success
			setInitError(null); // Clear previous errors
			console.log("Butterchurn visualizer initialized successfully.");
		} catch (e) {
			console.error("Butterchurn initialization failed:", e);
			setInitError(
				`Visualizer init failed: ${e instanceof Error ? e.message : String(e)}`,
			);
			visualizerRef.current = null;
			setIsVisualizerInitialized(false);
		}

		// Cleanup visualizer instance on effect re-run or unmount
		return () => {
			console.log("Cleaning up visualizer instance...");
			// Stop render loop (handled by other effect)
			visualizerRef.current = null;
			setIsVisualizerInitialized(false);
		};
	}, [isAudioReady, audioContextRef, audioHookError, connectVisualizer]); // Dependencies

	// --- Render Loop ---
	useEffect(() => {
		if (!isVisualizerInitialized || !visualizerRef.current) {
			return; // Don't run if not ready
		}

		console.log("Starting render loop...");
		let isActive = true;
		const renderLoop = () => {
			if (!isActive || !visualizerRef.current) return;
			try {
				visualizerRef.current.render();
			} catch (e) {
				console.error("Render loop error:", e);
				setInitError(
					`Render error: ${e instanceof Error ? e.message : String(e)}`,
				);
				isActive = false; // Stop loop on error
			}
			if (isActive) {
				animationFrameIdRef.current = requestAnimationFrame(renderLoop);
			}
		};
		renderLoop();

		return () => {
			console.log("Stopping render loop...");
			isActive = false;
			if (animationFrameIdRef.current) {
				cancelAnimationFrame(animationFrameIdRef.current);
				animationFrameIdRef.current = null;
			}
		};
	}, [isVisualizerInitialized]); // Dependency

	// --- Example Controls ---
	const handleGainChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		if (preAmpGainNodeRef.current) {
			const gainValue = Number.parseFloat(event.target.value);
			if (!Number.isNaN(gainValue)) {
				preAmpGainNodeRef.current.gain.value = gainValue;
			}
		}
	};

	const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		if (playbackGainNodeRef.current) {
			const volumeValue = Number.parseFloat(event.target.value);
			if (!Number.isNaN(volumeValue)) {
				playbackGainNodeRef.current.gain.value = volumeValue;
			}
		}
	};

	return (
		<div style={{ padding: "10px" }}>
			<h3>Butterchurn Visualizer (New Hook), isReady: {isAudioReady ? "true" : "false"}</h3>
			{/* Button to handle audio context resume */}
			{audioContextRef.current?.state === "suspended" && (
				<button
					type="button"
					className="p-2 bg-accent"
					onClick={resumeContext}
					style={{ marginBottom: "10px" }}
				>
					Click to Resume Audio Context
				</button>
			)}

			{/* Example Controls */}
			<div
				style={{
					marginBottom: "10px",
					display: "flex",
					gap: "10px",
					alignItems: "center",
				}}
			>
				<label>
					Visualizer Intensity (Pre-Amp Gain):
					<input
						type="range"
						min="0.1"
						max="10" // Adjust max as needed
						step="0.1"
						defaultValue={DEFAULT_PRE_AMP_GAIN}
						onChange={handleGainChange}
						disabled={!isAudioReady}
					/>
				</label>
				<label>
					Playback Volume:
					<input
						type="range"
						min="0"
						max="1.5" // Adjust max as needed
						step="0.05"
						defaultValue="1.0"
						onChange={handleVolumeChange}
						disabled={!isAudioReady}
					/>
				</label>
			</div>

			{(audioHookError || initError) && (
				<div style={{ color: "red", marginBottom: "10px" }}>
					Error: {audioHookError || initError}
				</div>
			)}

			<div
				style={{
					width: "800px",
					height: "600px",
					border: "1px solid grey",
					position: "relative",
					background: "#000",
				}}
			>
				<canvas
					ref={canvasRef}
					style={{ display: "block", width: "100%", height: "100%" }}
				/>
				{!isAudioReady && !audioHookError && (
					<div style={overlayStyle}>Waiting for Audio Hook...</div>
				)}
				{isAudioReady && !isVisualizerInitialized && !initError && (
					<div style={overlayStyle}>Initializing Visualizer...</div>
				)}
			</div>
		</div>
	);
}

// Simple overlay style
const overlayStyle: React.CSSProperties = {
	position: "absolute",
	top: "50%",
	left: "50%",
	transform: "translate(-50%, -50%)",
	color: "white",
	background: "rgba(0,0,0,0.7)",
	padding: "15px",
	borderRadius: "5px",
	textAlign: "center",
};
