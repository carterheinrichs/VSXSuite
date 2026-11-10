import * as T from "three";
import { audioUniforms, FullscreenPass, target } from "../shaders/shared";
import { fragment, heartLoopUniforms } from "./HumanHeartShader";
import type { HeartWorkerFrame, HeartWorkerResult } from "./HeartWorkerPass";

const scope = self as unknown as {
  onmessage: (event: MessageEvent<HeartWorkerFrame>) => void;
  postMessage: (data: HeartWorkerResult, transfer?: Transferable[]) => void;
};
let renderer: T.WebGLRenderer;
let pass: FullscreenPass;
let output: T.WebGLRenderTarget;

scope.onmessage = async ({ data }) => {
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
      const uniforms: Record<string, T.IUniform> = {
        ...audioUniforms(),
        ...heartLoopUniforms(),
      };
      for (const [name, value] of Object.entries(data.uniforms))
        uniforms[name] = { value };
      pass = new FullscreenPass(fragment, uniforms);
      output = target(data.width, data.height);
      await renderer.compileAsync(pass.scene, pass.camera);
    }
    output.setSize(data.width, data.height);
    pass.material.uniforms.uResolution.value.set(data.width, data.height);
    for (const [name, value] of Object.entries(data.uniforms)) {
      pass.material.uniforms[name].value = value;
    }
    const length = data.width * data.height * 4;
    const pixels =
      data.recycle?.byteLength === length * 2
        ? new Uint16Array(data.recycle)
        : new Uint16Array(length);
    // Workers share the browser GPU. Wait for each small batch before
    // submitting more so the compositor can run between tiles. Scissoring
    // retains full-frame UVs and the original shader detail and HDR values.
    const tileSize = 32;
    output.scissorTest = true;
    for (let y = 0; y < data.height; y += tileSize) {
      for (let x = 0; x < data.width; x += tileSize) {
        const width = Math.min(tileSize, data.width - x);
        const height = Math.min(tileSize, data.height - y);
        output.scissor.set(x, y, width, height);
        pass.render(renderer, output);
        const tile = new Uint16Array(width * height * 4);
        await renderer.readRenderTargetPixelsAsync(
          output,
          x,
          y,
          width,
          height,
          tile,
        );
        for (let row = 0; row < height; row++) {
          pixels.set(
            tile.subarray(row * width * 4, (row + 1) * width * 4),
            ((y + row) * data.width + x) * 4,
          );
        }
      }
    }
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
