import {
	useEffect,
	useCallback,
	useRef,
	useState,
	forwardRef,
	useImperativeHandle,
} from "react";
import { useLayoutEffect } from "@tanstack/react-router";

import { type ButterchurnPreset, getPresets } from "butterchurn-presets";
import { getPresets as getExtraPresets } from "butterchurn-presets/lib/butterchurnPresetsExtra.min";
import Butterchurn, { type Visualizer } from "butterchurn";
import { usePlayerStore } from "@/context";
import { useStreamedAudioVisualizer } from "@/hooks/use-audio-visualizer";

export interface ButterchurnVisualizerHandle {
	triggerEffect: () => void;
}

export const ButterchurnVisualizer = forwardRef<ButterchurnVisualizerHandle>(
	(_, ref) => {
		const canvasRef = useRef<HTMLCanvasElement | null>(null);
		// Store the actual preset objects if needed, or just keys/map
		const presetsRef = useRef<Record<string, ButterchurnPreset> | null>(null);
		const presetKeysRef = useRef<string[] | null>(null);
		const presetIndex = useRef<number>(0);
		const butterchurn = useRef<Visualizer | null>(null);
		const animationFrameId = useRef<number | null>(null); // Ref for animation frame ID

		const trackId = usePlayerStore((state) => state.currentTrackId);

		// State to track if the visualizer is ready
		const [isVisualizerReady, setIsVisualizerReady] = useState(false);

		// Get audio context and analyser from your hook
		const {
			analyserRef: analyzer,
			audioContextRef: audioContext,
			playbackGainNodeRef: playbackGain,
			isReady: isMounted,
		} = useStreamedAudioVisualizer({
			initialPreAmpGain: 6.0,
			initialPlaybackGain: 2,
		});

		const connectToAudioAnalyzer = useCallback(() => {
			// Ensure both butterchurn and the analyser node are available
			if (!butterchurn.current || !playbackGain.current) {
				console.warn(
					"Cannot connect audio: Butterchurn or AnalyserNode not ready.",
				);
				return;
			}
			try {
				console.log("Connecting Butterchurn to AnalyserNode...");
				butterchurn.current.connectAudio(playbackGain.current);
				console.log("Butterchurn connected to audio.");
			} catch (error) {
				console.error("Error connecting Butterchurn to audio:", error);
			}
		}, [playbackGain]);

		const initButterchurn = useCallback(() => {
			// Ensure canvas, audio context are ready, and component is mounted
			if (
				!canvasRef.current ||
				!audioContext.current ||
				!isMounted ||
				butterchurn.current // Don't re-initialize if already done
			) {
				return;
			}

			try {
				// Get presets
				const presetMap = getPresets(); // Likely returns Record<string, ButterchurnPreset>
				const extra = getExtraPresets();
				const fullPresetMap = { ...presetMap, ...extra };

				const keys = Object.keys(fullPresetMap);

				if (keys.length === 0) {
					console.warn("No Butterchurn presets loaded.");
					// Handle error or default state if no presets
					return;
				}

				presetsRef.current = fullPresetMap; // Store the map
				presetKeysRef.current = keys; // Store the keys
				presetIndex.current = Math.floor(Math.random() * keys.length);

				console.log(
					`Loaded ${keys.length} presets. Initial preset: ${
						keys[presetIndex.current]
					}`,
				);

				// Get initial canvas dimensions
				const initialWidth = canvasRef.current.offsetWidth || 800;
				const initialHeight = canvasRef.current.offsetHeight || 600;
				canvasRef.current.width = initialWidth; // Set canvas attributes explicitly
				canvasRef.current.height = initialHeight;

				// Create the visualizer instance
				butterchurn.current = Butterchurn.createVisualizer(
					audioContext.current,
					canvasRef.current,
					{
						width: initialWidth,
						height: initialHeight,
						pixelRatio: window.devicePixelRatio || 1,
						textureRatio: 1, // Adjust if needed for performance
					},
				);

				// Load the initial preset
				const initialPresetKey = presetKeysRef.current[presetIndex.current];
				const initialPreset = presetsRef.current[initialPresetKey];
				if (initialPreset) {
					butterchurn.current.loadPreset(initialPreset, 0); // 0 blend time for initial load
				}

				// *** Connect audio AFTER visualizer is created ***
				connectToAudioAnalyzer();

				// *** Signal that the visualizer is ready to start rendering ***
				setIsVisualizerReady(true);
			} catch (error) {
				console.error("Failed to initialize Butterchurn:", error);
				// Handle initialization error (e.g., show message to user)
				setIsVisualizerReady(false); // Ensure it's marked as not ready
			}
		}, [audioContext, isMounted, connectToAudioAnalyzer]); // Dependencies

		useEffect(() => {
			// Initialize only when the component is mounted and audio context is ready
			if (isMounted && audioContext.current) {
				initButterchurn();
			}

			// Cleanup function (optional but good practice)
			return () => {
				// Stop animation loop (handled by the render effect cleanup)
				// Disconnect audio (Butterchurn might do this internally, or you might need an explicit disconnect)
				// butterchurn.current?.disconnectAudio?.(); // If such a method exists
				butterchurn.current = null; // Clear the ref
				setIsVisualizerReady(false); // Reset ready state
			};
		}, [isMounted, audioContext, initButterchurn]); // Dependencies

		useEffect(() => {
			// Start rendering only when the visualizer is ready
			if (!isVisualizerReady || !butterchurn.current) {
				return; // Exit if not ready
			}

			let isActive = true; // Flag to control the loop

			const renderLoop = () => {
				if (!isActive || !butterchurn.current) {
					console.log("Stopping render loop.");
					return; // Exit loop if component unmounted or visualizer gone
				}

				try {
					// Optional: Get frequency data if needed elsewhere, but Butterchurn handles this internally
					// if (analyser.current && dataArray.current) {
					//   analyser.current.getByteFrequencyData(dataArray.current);
					// }
					butterchurn.current.render(); // Render the visualization
				} catch (error) {
					console.error("Error during Butterchurn render:", error);
					isActive = false; // Stop loop on error
					// Optionally handle render error
				}

				// Continue the loop
				animationFrameId.current = requestAnimationFrame(renderLoop);
			};

			// Start the loop
			renderLoop();

			// Cleanup function for this effect
			return () => {
				console.log("Render loop cleanup: Cancelling animation frame.");
				isActive = false; // Signal the loop to stop
				if (animationFrameId.current) {
					cancelAnimationFrame(animationFrameId.current);
					animationFrameId.current = null;
				}
			};
		}, [isVisualizerReady]); // Dependency: Run when visualizer becomes ready

		const resizeCanvas = useCallback(() => {
			if (!canvasRef.current) return;

			const canvas = canvasRef.current;
			const newWidth = canvas.offsetWidth;
			const newHeight = canvas.offsetHeight;

			// Check if size actually changed to avoid unnecessary updates
			if (canvas.width !== newWidth || canvas.height !== newHeight) {
				canvas.width = newWidth;
				canvas.height = newHeight;

				// Inform Butterchurn about the resize if it has a method for it
				// Check Butterchurn documentation for the correct method name/signature
				if (butterchurn.current) {
					butterchurn.current.setRendererSize(newWidth, newHeight);
				}
			}
		}, []); // No dependencies needed if it only reads refs/DOM

		useLayoutEffect(() => {
			resizeCanvas(); // Initial resize

			// Optional: Add resize observer for more robust resizing
			const resizeObserver = new ResizeObserver(() => {
				resizeCanvas();
			});

			if (canvasRef.current?.parentElement) {
				resizeObserver.observe(canvasRef.current.parentElement);
			} else if (canvasRef.current) {
				// Fallback if parent isn't immediately available (less ideal)
				resizeObserver.observe(canvasRef.current);
			}

			// Add window resize listener as a fallback or primary method
			window.addEventListener("resize", resizeCanvas);

			return () => {
				window.removeEventListener("resize", resizeCanvas);
				resizeObserver.disconnect();
			};
		}, [resizeCanvas]);

		// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
		useEffect(() => {
			if (
				!presetKeysRef.current ||
				!presetsRef.current ||
				!butterchurn.current
			) {
				return;
			}

			const randomPreset =
				presetKeysRef.current[
					Math.floor(Math.random() * presetKeysRef.current.length)
				];

			butterchurn.current.loadPreset(presetsRef.current[randomPreset], 5.7);
		}, [trackId]);

		useImperativeHandle(
			ref,
			() => ({
				triggerEffect: () => {
					if (!presetsRef.current || !presetKeysRef.current) return;
					const current = presetIndex.current;

					delete presetsRef.current[current];
					presetKeysRef.current?.splice(current, 1);

					const randomPreset =
						presetKeysRef.current[
							Math.floor(Math.random() * presetKeysRef.current.length)
						];

					butterchurn.current?.loadPreset(
						presetsRef.current?.[randomPreset],
						5.7,
					);
				},
			}),
			[],
		);

		return (
			<div className="absolute left-0 top-0 w-full h-full -z-20">
				<canvas
					ref={canvasRef}
					width="600"
					height="150"
					className="block h-full w-full z-10"
				/>
				<div className="absolute left-0 top-0 h-full w-full bg-muted/20 z-0" />
			</div>
		);
	},
);
