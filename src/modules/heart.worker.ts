import * as T from "three";
import { audioUniforms, FullscreenPass, target } from "../shaders/shared";
import { fragment } from "./HumanHeartShader";
import type { HeartWorkerFrame, HeartWorkerResult } from "./HeartWorkerPass";

const scope = self as unknown as {
  onmessage: (event: MessageEvent<HeartWorkerFrame>) => void;
  postMessage: (data: HeartWorkerResult, transfer?: Transferable[]) => void;
};
let renderer: T.WebGLRenderer;
let pass: FullscreenPass;
let output: T.WebGLRenderTarget;

scope.onmessage = ({ data }) => {
  try {
    if (!renderer) {
      const canvas = new OffscreenCanvas(1, 1);
      const context = canvas.getContext("webgl2", {
        antialias: false,
        alpha: false,
      });
      if (!context || !context.getExtension("EXT_color_buffer_float")) {
        throw new Error(
          "Heart rendering requires WebGL2 HDR support in workers.",
        );
      }
      renderer = new T.WebGLRenderer({ canvas, context, antialias: false });
      renderer.toneMapping = T.NoToneMapping;
      const uniforms: Record<string, T.IUniform> = audioUniforms();
      for (const [name, value] of Object.entries(data.uniforms))
        uniforms[name] = { value };
      pass = new FullscreenPass(fragment, uniforms);
      output = target(data.width, data.height);
    }
    output.setSize(data.width, data.height);
    pass.material.uniforms.uResolution.value.set(data.width, data.height);
    for (const [name, value] of Object.entries(data.uniforms)) {
      pass.material.uniforms[name].value = value;
    }
    pass.render(renderer, output);
    const length = data.width * data.height * 4;
    const pixels =
      data.recycle?.byteLength === length * 2
        ? new Uint16Array(data.recycle)
        : new Uint16Array(length);
    // Keep half-float HDR values intact for the existing overlay and post FX.
    // The readback waits for the first draw here, never on the browser UI thread.
    renderer.readRenderTargetPixels(
      output,
      0,
      0,
      data.width,
      data.height,
      pixels,
    );
    scope.postMessage(
      { width: data.width, height: data.height, pixels: pixels.buffer },
      [pixels.buffer],
    );
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
