import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";
import { fragment } from "./HumanHeartShader";
import heartUrl from "../assets/human-heart.svg?url";

export class HumanHeartModule extends ShaderModule {
  readonly id = "human-heart";
  readonly name = "Human Heart";
  params = { speed: 1, intensity: 1.1, hue: 0, reactivity: 1, turn: 1 };
  private texture?: T.Texture;
  private loading?: Promise<void>;
  private disposed = false;
  private readonly extra = {
    uHeart: { value: null as T.Texture | null },
    uIntensity: { value: 1.1 },
    uHue: { value: 0 },
    uContraction: { value: 0 },
    uTurn: { value: 1 },
  };
  init(_renderer: T.WebGLRenderer, width: number, height: number) {
    this.pass = new FullscreenPass(fragment, {
      ...this.uniforms,
      ...this.extra,
    });
    this.resize(width, height);
  }
  override prepare(renderer: T.WebGLRenderer) {
    return (this.loading ??= new T.TextureLoader()
      .loadAsync(heartUrl)
      .then(async (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = T.SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = texture.magFilter = T.LinearFilter;
        this.texture = texture;
        this.extra.uHeart.value = texture;
        await super.prepare(renderer);
      }));
  }
  override update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    this.uniforms.uTime.value = time * this.params.speed;
    const synced =
      this.params.reactivity > 0 && Number.isFinite(audio.beatPhase);
    const phase = synced
      ? (audio.beatPhase! + 0.12) % 1
      : (time * this.params.speed * 1.12) % 1;
    const pulse =
      Math.exp(-(((phase - 0.12) / 0.065) ** 2)) +
      0.4 * Math.exp(-(((phase - 0.29) / 0.09) ** 2));
    const drive =
      this.params.reactivity * (0.42 * audio.beat + 0.18 * audio.bass);
    this.extra.uContraction.value = Math.min(
      1,
      synced ? pulse * (0.55 + drive) : pulse * 0.55 + drive,
    );
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uHue.value = this.params.hue;
    this.extra.uTurn.value = this.params.turn;
  }
  override dispose() {
    this.disposed = true;
    this.texture?.dispose();
    super.dispose();
  }
}
