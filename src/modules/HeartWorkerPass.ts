import * as T from "three";
import { FullscreenPass } from "../shaders/shared";

export interface HeartWorkerFrame {
  width: number;
  height: number;
  uniforms: Record<string, number>;
  recycle?: ArrayBuffer;
}
export type HeartWorkerResult =
  { width: number; height: number; pixels: ArrayBuffer } | { error: string };

// Only the small texture-copy shader runs on the UI thread. The original heart
// shader, its first draw and GPU readback all run in a dedicated WebGL context.
export class HeartWorkerPass {
  private readonly worker = new Worker(
    new URL("./heart.worker.ts", import.meta.url),
    {
      type: "module",
    },
  );
  private readonly texture = new T.DataTexture(
    new Uint16Array(4),
    1,
    1,
    T.RGBAFormat,
    T.HalfFloatType,
  );
  private readonly copy = new FullscreenPass(
    `precision highp float;varying vec2 vUv;uniform sampler2D image;
     void main(){gl_FragColor=texture2D(image,vUv);}`,
    { image: { value: this.texture } },
  );
  private pending?: Exclude<HeartWorkerResult, { error: string }>;
  private inFlight = false;
  private failure?: Error;
  private readyResolve!: () => void;
  private readyReject!: (reason: Error) => void;
  readonly ready = new Promise<void>((resolve, reject) => {
    this.readyResolve = resolve;
    this.readyReject = reject;
  });

  constructor(frame: HeartWorkerFrame) {
    this.texture.minFilter = this.texture.magFilter = T.LinearFilter;
    this.texture.generateMipmaps = false;
    this.worker.onmessage = ({ data }: MessageEvent<HeartWorkerResult>) => {
      this.inFlight = false;
      if ("error" in data) this.fail(new Error(data.error));
      else {
        this.pending = data;
        this.readyResolve();
      }
    };
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.fail(new Error(event.message || "Heart rendering worker failed."));
    };
    this.request(frame);
  }

  private fail(error: Error) {
    this.failure = error;
    this.inFlight = false;
    this.readyReject(error);
  }

  private request(frame: HeartWorkerFrame) {
    this.inFlight = true;
    this.worker.postMessage(frame, frame.recycle ? [frame.recycle] : []);
  }

  render(
    renderer: T.WebGLRenderer,
    output: T.WebGLRenderTarget,
    frame: HeartWorkerFrame,
  ) {
    if (this.failure) throw this.failure;
    let recycle: ArrayBuffer | undefined;
    if (this.pending) {
      recycle = this.texture.image.data!.buffer as ArrayBuffer;
      // WebGL texture storage has immutable dimensions after its first upload.
      if (
        this.texture.image.width !== this.pending.width ||
        this.texture.image.height !== this.pending.height
      )
        this.texture.dispose();
      this.texture.image = {
        data: new Uint16Array(this.pending.pixels),
        width: this.pending.width,
        height: this.pending.height,
      };
      this.texture.needsUpdate = true;
      this.pending = undefined;
    }
    this.copy.render(renderer, output);
    // One request at a time: slow GPUs never accumulate stale animation frames.
    if (!this.inFlight) this.request({ ...frame, recycle });
  }

  dispose() {
    this.worker.terminate();
    this.readyReject(new Error("Heart rendering disposed."));
    this.pending = undefined;
    this.copy.dispose();
    this.texture.dispose();
  }
}
