import * as T from "three";
export const vertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
export const common = `precision highp float;
varying vec2 vUv;
uniform float uTime,uDelta,uBass,uSub,uMid,uTreble,uBeat,uRms;
uniform vec2 uResolution;
uniform sampler2D uAudioTexture,uAudioHistoryTexture,uPrevious;
const float PI=3.14159265359;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 palette(float t){return .55+.45*cos(6.28318*(vec3(0.0,.33,.67)+t));}
float fft(float x){float u=clamp(x,0.,1.);return texture2D(uAudioTexture,vec2(u*u*(.15+.85*u),.25)).r;}
float wave(float x){return texture2D(uAudioTexture,vec2(clamp(x,0.,1.),.75)).r*2.-1.;}
vec3 dither(vec2 pos){float n=fract(52.9829189*fract(dot(pos,vec2(.06711056,.00583715))));return vec3(n-.5)/255.;}
`;
export function target(w: number, h: number, depth = false) {
  return new T.WebGLRenderTarget(w, h, {
    type: T.HalfFloatType,
    minFilter: T.LinearFilter,
    magFilter: T.LinearFilter,
    depthBuffer: depth,
    stencilBuffer: false,
  });
}
export class FullscreenPass {
  readonly scene = new T.Scene();
  readonly camera = new T.Camera();
  // UVs extrapolate across one oversized triangle to cover the viewport.
  readonly geometry = new T.BufferGeometry()
    .setAttribute(
      "position",
      new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    )
    .setAttribute("uv", new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  readonly material: T.ShaderMaterial;
  constructor(fragment: string, uniforms: Record<string, T.IUniform>) {
    this.material = new T.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new T.Mesh(this.geometry, this.material));
  }
  render(renderer: T.WebGLRenderer, output: T.WebGLRenderTarget | null) {
    renderer.setRenderTarget(output);
    // The opaque pass overwrites every pixel and does not use depth.
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.autoClear = autoClear;
    }
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
export function audioUniforms() {
  return {
    uTime: { value: 0 },
    uDelta: { value: 0.016 },
    uBass: { value: 0 },
    uSub: { value: 0 },
    uMid: { value: 0 },
    uTreble: { value: 0 },
    uBeat: { value: 0 },
    uRms: { value: 0 },
    uResolution: { value: new T.Vector2(1, 1) },
    uAudioTexture: { value: null as T.Texture | null },
    uAudioHistoryTexture: { value: null as T.Texture | null },
    uPrevious: { value: null as T.Texture | null },
  };
}
