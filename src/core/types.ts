import type * as THREE from "three";
import type { BindingParams } from "tweakpane";
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
  /** Fast spectral attacks, including percussion that is not a bass kick. */
  lowAttack?: number;
  midAttack?: number;
  highAttack?: number;
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
  controls?: Record<string, BindingParams>;
  init(renderer: THREE.WebGLRenderer, width: number, height: number): void;
  update(audioData: AudioFrameData, time: number, deltaTime: number): void;
  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void;
  resize(width: number, height: number): void;
  prepare?(renderer: THREE.WebGLRenderer): Promise<void>;
  /** Optional asynchronous rendering path for interactive playback. */
  renderRealtime?(
    renderer: THREE.WebGLRenderer,
    output: THREE.WebGLRenderTarget,
  ): void;
  reset?(): void;
  dispose(): void;
}
