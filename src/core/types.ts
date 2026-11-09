import type * as THREE from "three";
export interface AudioFrameData {
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  rms: number;
  centroid: number;
  beat: number;
  kick: boolean;
  /** Detected tempo and song-aligned cycle; absent when tempo is unavailable. */
  bpm?: number;
  beatPhase?: number;
  uAudioTexture: THREE.DataTexture;
  uAudioHistoryTexture: THREE.DataTexture;
}
export interface IVisualModule {
  readonly id: string;
  readonly name: string;
  params: Record<string, any>;
  init(renderer: THREE.WebGLRenderer, width: number, height: number): void;
  update(audioData: AudioFrameData, time: number, deltaTime: number): void;
  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void;
  resize(width: number, height: number): void;
  prepare?(renderer: THREE.WebGLRenderer): Promise<void>;
  reset?(): void;
  dispose(): void;
}
