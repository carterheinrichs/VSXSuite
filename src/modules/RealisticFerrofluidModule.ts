import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { AudioFrameData, IVisualModule } from "../core/types";
import { simplex } from "../shaders/simplex";
function createIndexedSphere(radius: number, detail: number) {
  const raw = new T.IcosahedronGeometry(radius, detail);
  raw.deleteAttribute("uv");
  const indexed = mergeVertices(raw, 1e-4);
  raw.dispose();
  return indexed;
}
export class RealisticFerrofluidModule implements IVisualModule {
  readonly id = "ferrofluid";
  readonly name = "Magnetic matter";
  params = { spikes: 0.65, roughness: 0.16, rotation: 0.18, light: 16 };
  private readonly scene = new T.Scene();
  private readonly camera = new T.PerspectiveCamera(42, 1, 0.1, 80);
  private readonly material = new T.MeshPhysicalMaterial({
    color: 0x9ca9b9,
    metalness: 1,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  private readonly blob = new T.Mesh(createIndexedSphere(1, 5), this.material);
  private readonly cyan = new T.PointLight(0x4cffff, 16, 15, 2);
  private readonly pink = new T.PointLight(0xff368f, 20, 15, 2);
  private reflector!: Reflector;
  private environment!: T.WebGLRenderTarget;
  private readonly uniforms = {
    uTime: { value: 0 },
    uBass: { value: 0 },
    uSub: { value: 0 },
    uMid: { value: 0 },
    uTreble: { value: 0 },
    uBeat: { value: 0 },
    uRms: { value: 0 },
    uPulse: { value: 0 },
    uSpikes: { value: 0.65 },
    uAudioTexture: { value: null as T.Texture | null },
  };
  private phase = 0;
  private pulse = 0;
  private lastTime = -1;
  init(renderer: T.WebGLRenderer, w: number, h: number) {
    const pmrem = new T.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.environment.texture;
    this.scene.background = new T.Color(0x070b12);
    this.scene.fog = new T.FogExp2(0x080b15, 0.085);
    this.camera.position.set(0, 1.3, 5.3);
    this.camera.lookAt(0, 0, 0);
    this.blob.position.y = 0.18;
    this.scene.add(this.blob);
    this.cyan.position.set(-2, 2, 1);
    this.pink.position.set(2, 1, -1);
    this.scene.add(
      this.cyan,
      this.pink,
      new T.HemisphereLight(0xaaaaff, 0x04050a, 0.5),
    );
    this.reflector = new Reflector(new T.PlaneGeometry(50, 50), {
      color: 0x242934,
      textureWidth: Math.max(1, w >> 1),
      textureHeight: Math.max(1, h >> 1),
      clipBias: 0.003,
      multisample: 0,
    });
    const rt = this.reflector.getRenderTarget();
    rt.texture.type = T.HalfFloatType;
    rt.texture.minFilter = T.LinearFilter;
    rt.texture.magFilter = T.LinearFilter;
    this.reflector.rotation.x = -Math.PI / 2;
    this.reflector.position.y = -1.35;
    this.scene.add(this.reflector);
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
uniform float uTime,uBass,uSub,uMid,uTreble,uBeat,uRms,uPulse,uSpikes;
uniform sampler2D uAudioTexture;
varying vec2 vFerro;
${simplex}
`,
        )
        .replace(
          "#include <beginnormal_vertex>",
          `// Two-octave analytic simplex gradients and harmonic standing waves keep displaced spikes smooth and reactive.
vec3 n=normalize(position);
float freq1=4.4+uBass*1.2;
vec4 ng1=snoiseGrad(n*freq1+vec3(0.,uTime*.48,uTime*.2));
float b1=max(0.,ng1.w*.55+.48);
float b1_2=b1*b1;
float amp1=uSpikes*(.18+uBass*1.85+uSub*.75+uBeat*.95+uPulse*.7);
float disp1=b1_2*b1*amp1;
vec3 grad1=ng1.xyz*(freq1*1.65*b1_2*amp1);
float freq2=9.5+uTreble*3.5;
vec4 ng2=snoiseGrad(n*freq2-vec3(uTime*.35,uTime*.65,0.));
float b2=max(0.,ng2.w*.55+.45);
float b2_2=b2*b2;
float amp2=uSpikes*(.04+uMid*.75+uTreble*.85+uBeat*.45)*(.35+b1*.95);
float disp2=b2_2*b2*amp2;
vec3 grad2=ng2.xyz*(freq2*1.65*b2_2*amp2);
float u=clamp(n.y*.45+.5,0.,1.);
float spectrum=texture2D(uAudioTexture,vec2(u*u*(.15+.85*u),.25)).r;
float waveform=texture2D(uAudioTexture,vec2(u,.75)).r*2.-1.;
float wavePhase=n.y*13.-uTime*3.2;
float ringAmp=(.02+uBass*.09+uMid*.08+uBeat*.11+spectrum*.16)*uSpikes;
float dispRing=sin(wavePhase)*ringAmp+spectrum*(.18+uBass*.15)+waveform*(.06+uMid*.1);
vec3 gradRing=vec3(0.,cos(wavePhase)*13.*ringAmp,0.);
float core=.96+uSub*.12+uBass*.08+uPulse*.1;
float disp=core-1.+disp1+disp2+dispRing;
vec3 dDisp=grad1+grad2+gradRing;
vec3 surfGrad=dDisp-n*dot(n,dDisp);
vec3 center=n*(1.+disp);
vec3 objectNormal=normalize(center-surfGrad);
vFerro=vec2(clamp(disp1*1.1+disp2*1.6+spectrum*.5,0.,1.5),uBeat+uPulse*.8+uTreble*.6);`,
        )
        .replace("#include <begin_vertex>", "vec3 transformed=center;");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform float uBass,uMid,uTreble,uBeat,uPulse;
varying vec2 vFerro;`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
float tipGlow=smoothstep(.22,.95,vFerro.x);
vec3 cyanGlow=vec3(.12,.95,1.)*(uBeat*.45+uTreble*.55+uPulse*.4);
vec3 pinkGlow=vec3(1.,.14,.55)*(uBass*.5+uMid*.4+uPulse*.35);
totalEmissiveRadiance+=mix(pinkGlow,cyanGlow,clamp(vFerro.x*.7,0.,1.))*tipGlow*(.35+vFerro.y*.45);`,
        );
    };
    this.resize(w, h);
  }
  reset() {
    this.lastTime = -1;
    this.phase = 0;
    this.pulse = 0;
    this.blob.rotation.set(0, 0, 0);
  }
  update(a: AudioFrameData, t: number, dt: number) {
    if (t <= this.lastTime || this.lastTime < 0) {
      this.phase = t;
      this.pulse = 0;
      if (t === 0) this.blob.rotation.set(0, 0, 0);
    }
    this.lastTime = t;
    if (a.kick) this.pulse = 1;
    else this.pulse *= Math.exp(-dt * 9);
    const drive =
      1 + a.bass * 2.4 + a.mid * 1.4 + a.beat * 1.8 + this.pulse * 1.2;
    this.phase += (dt > 0 ? dt : 0) * drive;
    const u = this.uniforms;
    u.uTime.value = dt > 0 ? this.phase : t * drive;
    u.uBass.value = a.bass;
    u.uSub.value = a.subBass;
    u.uMid.value = a.mid;
    u.uTreble.value = a.treble;
    u.uBeat.value = a.beat;
    u.uRms.value = a.rms;
    u.uPulse.value = this.pulse;
    u.uSpikes.value = this.params.spikes;
    u.uAudioTexture.value = a.uAudioTexture;
    if (this.material.roughness !== this.params.roughness)
      this.material.roughness = this.params.roughness;
    this.material.clearcoatRoughness = Math.max(
      0.02,
      0.1 - a.treble * 0.06 - a.beat * 0.03,
    );
    this.blob.rotation.y +=
      dt *
      this.params.rotation *
      (1 + a.bass * 2.2 + a.beat * 1.8 + a.rms * 1.2);
    this.blob.rotation.x =
      Math.sin(this.phase * 0.35) * (0.08 + a.mid * 0.16) + this.pulse * 0.08;
    this.blob.rotation.z = Math.cos(this.phase * 0.28) * (0.12 + a.bass * 0.18);
    this.blob.position.y =
      0.18 +
      Math.sin(t * 0.9 + this.phase * 0.3) * 0.05 +
      (a.subBass * 0.09 + this.pulse * 0.07);
    this.cyan.intensity =
      this.params.light *
      (0.8 + a.beat * 1.5 + a.treble * 1.1 + this.pulse * 1.1);
    this.pink.intensity =
      this.params.light *
      1.2 *
      (0.8 + a.bass * 1.4 + a.subBass * 0.8 + this.pulse * 0.9);
    this.cyan.position.x = -2 * Math.cos(this.phase * 0.35);
    this.cyan.position.z = 1.4 * Math.sin(this.phase * 0.35);
    this.cyan.position.y = 1.8 + a.treble * 0.7 + this.pulse * 0.4;
    this.pink.position.x = 2.2 * Math.cos(this.phase * 0.28);
    this.pink.position.z = -1.4 * Math.sin(this.phase * 0.28);
    this.pink.position.y = 0.9 + a.bass * 0.8;
  }
  render(
    r: T.WebGLRenderer,
    w: T.WebGLRenderTarget,
    _read: T.WebGLRenderTarget,
  ) {
    r.setRenderTarget(w);
    r.render(this.scene, this.camera);
  }
  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.reflector
      ?.getRenderTarget()
      .setSize(
        Math.max(1, Math.min(2048, w >> 1)),
        Math.max(1, Math.min(2048, h >> 1)),
      );
  }
  dispose() {
    this.blob.geometry.dispose();
    this.material.dispose();
    this.reflector.geometry.dispose();
    this.reflector.dispose();
    this.environment.dispose();
  }
}
