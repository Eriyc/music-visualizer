declare module "butterchurn" {
  export class Visualizer {
    constructor(
      audioCtx: AudioContext,
      canvas: HTMLCanvasElement,
      opts: Record<string, unknown>
    );
    connectAudio(audioNode: AudioNode): void;
    render(): void;
    loadPreset(preset: ButterchurnPreset, blendTime: number): void;
    setRendererSize(
      width: number,
      height: number,
      opts?: Record<string, unknown>
    ): void;
  }

  interface Butterchurn {
    createVisualizer(
      audioCtx: AudioContext,
      canvas: HTMLCanvasElement,
      opts?: Record<string, unknown>
    ): Visualizer;
  }

  const Butterchurn: Butterchurn;

  export default Butterchurn;
}

declare module "butterchurn-presets" {
  export function getPresets(): Record<string, ButterchurnPreset>;
  export type ButterchurnPreset = {
    baseVals: Record<string, number>;
    comp: string;
    frame_eqs_str: string;
    init_eqs_str: string;
    pixel_eqs_str: string;
    shapes: ButterchurnPreset[];
    waves: ButterchurnPreset[];
  };
}

declare module "butterchurn-presets/lib/butterchurnPresetsExtra.min" {
  export function getPresets(): Record<
    string,
    import("butterchurn-presets").ButterchurnPreset
  >;
}
