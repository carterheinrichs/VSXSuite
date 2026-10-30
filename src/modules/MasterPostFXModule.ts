import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { ShaderModule } from "./ShaderModule";
import { common, FullscreenPass, target } from "../shaders/shared";
// Composite before thresholding and chromatic offsets, just as in the separate
// overlay pass. The feedback itself continues to contain neon only.
const composite = `uniform sampler2D uOverlay;uniform float uOverlayAmount;
vec3 compositeAt(sampler2D image,vec2 uv){vec3 c=texture2D(image,uv).rgb;if(uOverlayAmount>0.)c+=texture2D(uOverlay,uv).rgb*uOverlayAmount;return c;}`;
// 5-tap hardware-bilinear Gaussian covers a continuous 9-texel footprint with zero skipped texels.
const blur = `varying vec2 vUv;uniform sampler2D image;uniform vec2 direction;uniform float threshold;${composite}
vec3 sampleTap(vec2 uv){vec3 s=compositeAt(image,uv);return threshold>0.?max(s-vec3(threshold),vec3(0.)):s;}
void main(){
 vec2 d1=direction*1.41096,d2=direction*3.301535;
 vec3 c=sampleTap(vUv)*.20065
  +(sampleTap(vUv+d1)+sampleTap(vUv-d1))*.302119
  +(sampleTap(vUv+d2)+sampleTap(vUv-d2))*.097556;
 gl_FragColor=vec4(c,1.);
}`;
export class MasterPostFXModule extends ShaderModule {
  readonly id = "post";
  readonly name = "Master polish";
  params = {
    bloom: 0.35,
    threshold: 0.7,
    chromatic: 0.08,
    scanlines: false,
    exposure: 1.05,
  };
  private bloomA!: T.WebGLRenderTarget;
  private bloomB!: T.WebGLRenderTarget;
  private blur!: FullscreenPass;
  private readonly extra = {
    uOverlay: { value: null as T.Texture | null },
    uOverlayAmount: { value: 0 },
    uBloom: { value: null as T.Texture | null },
    uBloomAmount: { value: 0.65 },
    uChromatic: { value: 0.3 },
    uScanlines: { value: 0 },
    uExposure: { value: 1.2 },
  };
  init(_r: T.WebGLRenderer, w: number, h: number) {
    this.pass = new FullscreenPass(
      common +
        composite +
        `
uniform sampler2D uBloom;uniform float uBloomAmount,uChromatic,uScanlines,uExposure;
void main(){
 vec2 offset=(vUv-.5)*(.001+uBeat*.007)*uChromatic;
 vec3 center=compositeAt(uPrevious,vUv);
 vec3 c=uChromatic>1e-4?vec3(compositeAt(uPrevious,vUv+offset).r,center.g,compositeAt(uPrevious,vUv-offset).b):center;
 if(uBloomAmount>0.)c+=texture2D(uBloom,vUv).rgb*uBloomAmount;
 c*=uExposure;
 // ACES fitted display transform, applied only after HDR compositing.
 c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);
 c=pow(c,vec3(1./2.2));
 c*=1.-uScanlines*.07*(.5+.5*sin(vUv.y*uResolution.y*PI));
 c*=1.-.25*pow(length(vUv-.5),2.);
 c=clamp(c+dither(gl_FragCoord.xy),0.,1.);
 gl_FragColor=vec4(c,1.);
}`,
      { ...this.uniforms, ...this.extra },
    );
    this.blur = new FullscreenPass(blur, {
      image: { value: null },
      direction: { value: new T.Vector2() },
      threshold: { value: 0.7 },
      uOverlay: { value: null },
      uOverlayAmount: { value: 0 },
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
  renderToScreen(
    r: T.WebGLRenderer,
    read: T.WebGLRenderTarget,
    overlay: T.WebGLRenderTarget | null = null,
  ) {
    this.compose(r, null, read, overlay);
  }
  private compose(
    r: T.WebGLRenderer,
    w: T.WebGLRenderTarget | null,
    read: T.WebGLRenderTarget,
    overlay: T.WebGLRenderTarget | null = null,
  ) {
    this.extra.uOverlay.value = overlay?.texture ?? read.texture;
    this.extra.uOverlayAmount.value = overlay ? 0.22 : 0;
    if (this.params.bloom > 0) {
      const u = this.blur.material.uniforms;
      u.uOverlay.value = this.extra.uOverlay.value;
      u.uOverlayAmount.value = this.extra.uOverlayAmount.value;
      u.image.value = read.texture;
      u.direction.value.set(1 / this.bloomA.width, 0);
      u.threshold.value = this.params.threshold;
      this.blur.render(r, this.bloomA);
      u.image.value = this.bloomA.texture;
      // The horizontal pass has already composited and thresholded the image.
      u.uOverlayAmount.value = 0;
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
    this.bloomA?.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.bloomB?.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }
  override dispose() {
    super.dispose();
    this.bloomA.dispose();
    this.bloomB.dispose();
    this.blur.dispose();
  }
}
