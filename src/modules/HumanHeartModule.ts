import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";
import { fragment } from "./HumanHeartShader";
import heartUrl from "../assets/human-heart.svg?url";
import cutawayUrl from "../assets/human-heart-cutaway.svg?url";

export class HumanHeartModule extends ShaderModule {
  readonly id = "human-heart";
  readonly name = "Human Heart";
  params = {
    speed: 1,
    intensity: 1.1,
    hue: 0,
    reactivity: 1,
    cutaway: true,
    valveMotion: 1,
    flow: 1,
  };
  private textures: T.Texture[] = [];
  private loading?: Promise<void>;
  private disposed = false;
  private readonly extra = {
    uHeart: { value: null as T.Texture | null },
    uIntensity: { value: 1.1 },
    uHue: { value: 0 },
    uCutawayHeart: { value: null as T.Texture | null },
    uCutaway: { value: 1 },
    uValveOpen: { value: new T.Vector2() },
    uChambers: { value: new T.Vector2() },
  };
  init(_renderer: T.WebGLRenderer, width: number, height: number) {
    this.pass = new FullscreenPass(fragment, {
      ...this.uniforms,
      ...this.extra,
    });
    this.resize(width, height);
  }
  override prepare(renderer: T.WebGLRenderer) {
    return (this.loading ??= Promise.all(
      [heartUrl, cutawayUrl].map((url) => new T.TextureLoader().loadAsync(url)),
    ).then(async (textures) => {
      if (this.disposed) {
        textures.forEach((texture) => texture.dispose());
        return;
      }
      for (const texture of textures) {
        texture.colorSpace = T.SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = texture.magFilter = T.LinearFilter;
      }
      this.textures = textures;
      this.extra.uHeart.value = textures[0];
      this.extra.uCutawayHeart.value = textures[1];
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
    // Deliberately staggered for the audio visualization, rather than moving
    // the entire organ. Each valve can also respond to its own frequency band.
    const opening = (offset: number, band: number) =>
      Math.min(
        1,
        Math.max(
          0,
          (0.5 + 0.5 * Math.cos((phase - offset) * Math.PI * 2)) * 0.85 +
            this.params.reactivity * band * 0.25,
        ) * this.params.valveMotion,
      );
    const right = opening(0.12, audio.bass);
    const left = opening(0.62, audio.mid);
    this.extra.uValveOpen.value.set(right, left);
    this.extra.uChambers.value.set(
      this.params.flow *
        (0.25 + right * 0.5 + audio.bass * this.params.reactivity * 0.5),
      this.params.flow *
        (0.25 + left * 0.5 + audio.treble * this.params.reactivity * 0.5),
    );
    this.extra.uCutaway.value = this.params.cutaway ? 1 : 0;
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uHue.value = this.params.hue;
  }
  override dispose() {
    this.disposed = true;
    this.textures.forEach((texture) => texture.dispose());
    super.dispose();
  }
}
