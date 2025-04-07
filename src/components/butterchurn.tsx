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
		const presetsRef = useRef<Record<string, ButterchurnPreset> | null>(null);
		const presetKeysRef = useRef<string[] | null>(null);
		const presetIndex = useRef<number>(0);
		const butterchurn = useRef<Visualizer | null>(null);
		const animationFrameId = useRef<number | null>(null);

		const trackId = usePlayerStore((state) => state.currentTrackId);
		const state = usePlayerStore((state) => state.playbackState);

		const [isVisualizerReady, setIsVisualizerReady] = useState(false);

		const {
			audioContextRef: audioContext,
			playbackGainNodeRef: playbackGain,
			isReady: isMounted,
		} = useStreamedAudioVisualizer({
			initialPreAmpGain: 6.0,
			initialPlaybackGain: 2,
		});

		const connectToAudioAnalyzer = useCallback(() => {
			if (!butterchurn.current || !playbackGain.current) {
				console.warn(
					"Cannot connect audio: Butterchurn or AnalyserNode not ready.",
				);
				return;
			}
			try {
				// console.log("Connecting Butterchurn to AnalyserNode...");
				butterchurn.current.connectAudio(playbackGain.current);
				// console.log("Butterchurn connected to audio.");
			} catch (error) {
				console.error("Error connecting Butterchurn to audio:", error);
			}
		}, [playbackGain]);

		const initButterchurn = useCallback(() => {
			if (
				!canvasRef.current ||
				!audioContext.current ||
				!isMounted ||
				butterchurn.current
			) {
				return;
			}

			try {
				const presetMap = getPresets();
				const extra = getExtraPresets();
				const fullPresetMap = { ...presetMap, ...extra };

				const keys = Object.keys(fullPresetMap);

				if (keys.length === 0) {
					console.warn("No Butterchurn presets loaded.");
					// Handle error or default state if no presets
					return;
				}

				presetsRef.current = fullPresetMap;
				presetKeysRef.current = keys;
				presetIndex.current = Math.floor(Math.random() * keys.length);

				console.log(
					`Loaded ${keys.length} presets. Initial preset: ${
						keys[presetIndex.current]
					}`,
				);

				const initialWidth = canvasRef.current.offsetWidth || 800;
				const initialHeight = canvasRef.current.offsetHeight || 600;
				canvasRef.current.width = initialWidth;
				canvasRef.current.height = initialHeight;

				butterchurn.current = Butterchurn.createVisualizer(
					audioContext.current,
					canvasRef.current,
					{
						width: initialWidth,
						height: initialHeight,
						pixelRatio: window.devicePixelRatio || 1,
						textureRatio: 1,
					},
				);

				const initialPresetKey = presetKeysRef.current[presetIndex.current];
				const initialPreset = presetsRef.current[initialPresetKey];
				if (initialPreset) {
					butterchurn.current.loadPreset(initialPreset, 0); // 0 blend time for initial load
				}

				connectToAudioAnalyzer();

				setIsVisualizerReady(true);
			} catch (error) {
				console.error("Failed to initialize Butterchurn:", error);
				setIsVisualizerReady(false);
			}
		}, [audioContext, isMounted, connectToAudioAnalyzer]);

		useEffect(() => {
			if (isMounted && audioContext.current) {
				initButterchurn();
			}

			return () => {
				butterchurn.current = null;
				setIsVisualizerReady(false);
			};
		}, [isMounted, audioContext, initButterchurn]);

		useEffect(() => {
			if (!isVisualizerReady || !butterchurn.current) {
				return;
			}

			let isActive = true;

			const renderLoop = () => {
				if (!isActive || !butterchurn.current || state === "stopped") {
					console.log("Stopping render loop.");
					return;
				}

				try {
					butterchurn.current.render();
				} catch (error) {
					console.error("Error during Butterchurn render:", error);
					isActive = false;
				}

				animationFrameId.current = requestAnimationFrame(renderLoop);
			};

			renderLoop();

			return () => {
				console.log("Render loop cleanup: Cancelling animation frame.");
				isActive = false; // Signal the loop to stop
				if (animationFrameId.current) {
					cancelAnimationFrame(animationFrameId.current);
					animationFrameId.current = null;
				}
			};
		}, [isVisualizerReady, state]);

		const resizeCanvas = useCallback(() => {
			if (!canvasRef.current) return;

			const canvas = canvasRef.current;
			const newWidth = canvas.offsetWidth;
			const newHeight = canvas.offsetHeight;

			if (canvas.width !== newWidth || canvas.height !== newHeight) {
				canvas.width = newWidth;
				canvas.height = newHeight;

				if (butterchurn.current) {
					butterchurn.current.setRendererSize(newWidth, newHeight);
				}
			}
		}, []);

		useLayoutEffect(() => {
			resizeCanvas();
			const resizeObserver = new ResizeObserver(() => {
				resizeCanvas();
			});

			if (canvasRef.current?.parentElement) {
				resizeObserver.observe(canvasRef.current.parentElement);
			} else if (canvasRef.current) {
				resizeObserver.observe(canvasRef.current);
			}

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
