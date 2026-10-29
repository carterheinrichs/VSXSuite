import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { ShaderModule } from "./ShaderModule";
import { common, FullscreenPass, target } from "../shaders/shared";
const blur = `varying vec2 vUv;uniform sampler2D image;uniform vec2 direction;uniform float threshold;void main(){vec3 c=vec3(0.);for(int i=-4;i<=4;i++){vec3 s=texture2D(image,vUv+direction*float(i)*2.).rgb;s=max(s-vec3(threshold),vec3(0.));c+=s*exp(-float(i*i)*.12)*.20236;}gl_FragColor=vec4(c,1.);}`;
export class MasterPostFXModule extends ShaderModule {
  readonly id = "post";
  readonly name = "Master polish";
  params = {
    bloom: 0.65,
    threshold: 0.7,
    chromatic: 0.3,
    scanlines: false,
    exposure: 1.2,
  };
  private bloomA!: T.WebGLRenderTarget;
  private bloomB!: T.WebGLRenderTarget;
  private blur!: FullscreenPass;
  private readonly extra = {
    uBloom: { value: null as T.Texture | null },
    uBloomAmount: { value: 0.65 },
    uChromatic: { value: 0.3 },
    uScanlines: { value: 0 },
    uExposure: { value: 1.2 },
  };
  init(_r: T.WebGLRenderer, w: number, h: number) {
    this.pass = new FullscreenPass(
      common +
        `
uniform sampler2D uBloom;uniform float uBloomAmount,uChromatic,uScanlines,uExposure;
void main(){vec2 offset=(vUv-.5)*(.001+uBeat*.007)*uChromatic;vec3 c=vec3(texture2D(uPrevious,vUv+offset).r,texture2D(uPrevious,vUv).g,texture2D(uPrevious,vUv-offset).b);c+=texture2D(uBloom,vUv).rgb*uBloomAmount;c*=uExposure;
// ACES fitted display transform, applied only after HDR compositing.
c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);c=pow(c,vec3(1./2.2));c*=1.-uScanlines*.07*(.5+.5*sin(vUv.y*uResolution.y*PI));c*=1.-.25*pow(length(vUv-.5),2.);gl_FragColor=vec4(c,1.);}`,
      { ...this.uniforms, ...this.extra },
    );
    this.blur = new FullscreenPass(blur, {
      image: { value: null },
      direction: { value: new T.Vector2() },
      threshold: { value: 0.7 },
    });
    this.bloomA = target(1, 1);
    this.bloomB = target(1, 1);
    this.resize(w, h);
  }
  override update(a: AudioFrameData, t: number, dt: number) {
    super.update(a, t, dt);
    this.extra.uBloomAmount.value = this.params.bloom;
    this.extra.uChromatic.value = this.params.chromatic;
    this.extra.uScanlines.value = this.params.scanlines ? 1 : 0;
    this.extra.uExposure.value = this.params.exposure;
  }
  override render(
    r: T.WebGLRenderer,
    w: T.WebGLRenderTarget,
    read: T.WebGLRenderTarget,
  ) {
    this.compose(r, w, read);
  }
  renderToScreen(r: T.WebGLRenderer, read: T.WebGLRenderTarget) {
    this.compose(r, null, read);
  }
  private compose(
    r: T.WebGLRenderer,
    w: T.WebGLRenderTarget | null,
    read: T.WebGLRenderTarget,
  ) {
    if (this.params.bloom > 0) {
      const u = this.blur.material.uniforms;
      u.image.value = read.texture;
      u.direction.value.set(1 / this.bloomA.width, 0);
      u.threshold.value = this.params.threshold;
      this.blur.render(r, this.bloomA);
      u.image.value = this.bloomA.texture;
      u.direction.value.set(0, 1 / this.bloomA.height);
      u.threshold.value = 0;
      this.blur.render(r, this.bloomB);
      this.extra.uBloom.value = this.bloomB.texture;
    }
    this.uniforms.uPrevious.value = read.texture;
    this.pass.render(r, w);
  }
  override resize(w: number, h: number) {
    super.resize(w, h);
    this.bloomA?.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.bloomB?.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
  }
  override dispose() {
    super.dispose();
    this.bloomA.dispose();
    this.bloomB.dispose();
    this.blur.dispose();
  }
}
