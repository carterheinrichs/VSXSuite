import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { common, FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";

const simulation = `
precision highp float;
varying vec2 vUv;
uniform sampler2D state;
uniform vec2 grid;
uniform float states,threshold,seed,initialize;
float cell(vec2 p){return floor(texture2D(state,fract(p)).r*255.+.5);}
void main(){
 vec2 p=floor(vUv*grid);
 if(initialize>.5){
   float random=fract(sin(dot(p,vec2(127.1,311.7))+seed*74.7)*43758.5453);
   gl_FragColor=vec4(floor(random*states)/255.,0.,0.,1.);return;
 }
 float current=cell(vUv),next=mod(current+1.,states),count=0.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
   if(x==0&&y==0)continue;
   float neighbor=cell(vUv+vec2(float(x),float(y))/grid);
   count+=1.-step(.5,abs(neighbor-next));
 }
 gl_FragColor=vec4((count>=threshold?next:current)/255.,0.,0.,1.);
}`;
const display =
  common +
  `
uniform sampler2D state;
uniform vec2 grid;
uniform float states,uHue,uIntensity,uReactivity;
void main(){
 // Square cells, with a centered crop of a fixed simulation domain.
 vec2 uv=(vUv-.5)*uResolution/(min(uResolution.x,uResolution.y)*grid.x/grid.y)+.5;
 float phase=floor(texture2D(state,fract(uv)).r*255.+.5)/states;
 vec3 color=palette(phase+uHue);
 float light=.8+uReactivity*(uBass*.35+uBeat*.2);
 gl_FragColor=vec4(pow(color,vec3(1.4))*uIntensity*light,1.);
}`;

/** Discrete Moore-neighborhood CCA with toroidal boundaries and retained GPU state. */
export class CyclicAutomatonModule extends ShaderModule {
  readonly id = "cyclic-automaton";
  readonly name = "Cyclic Cellular Automaton";
  params = {
    speed: 1,
    intensity: 1.3,
    hue: 0,
    reactivity: 1,
    states: 12,
    threshold: 1,
    cells: 192,
    seed: 1,
  };
  controls = {
    speed: { min: 0, max: 3, step: 0.05 },
    reactivity: { min: 0, max: 2, step: 0.05 },
    states: { min: 3, max: 24, step: 1, label: "Color states" },
    threshold: { min: 1, max: 4, step: 1 },
    cells: { min: 64, max: 384, step: 16, label: "Cells across" },
    seed: { min: 1, max: 100, step: 1 },
  };
  private a!: T.WebGLRenderTarget;
  private b!: T.WebGLRenderTarget;
  private stepPass!: FullscreenPass;
  private pendingReset = true;
  private accumulator = 0;
  private cells = -1;
  private states = -1;
  private threshold = -1;
  private seed = -1;
  private readonly sim = {
    state: { value: null as T.Texture | null },
    grid: { value: new T.Vector2(192, 192) },
    states: { value: 12 },
    threshold: { value: 1 },
    seed: { value: 1 },
    initialize: { value: 0 },
  };
  private readonly look = {
    state: { value: null as T.Texture | null },
    grid: this.sim.grid,
    states: this.sim.states,
    uHue: { value: 0 },
    uIntensity: { value: 1.3 },
    uReactivity: { value: 1 },
  };
  init(_renderer: T.WebGLRenderer, w: number, h: number) {
    const options = {
      minFilter: T.NearestFilter,
      magFilter: T.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.a = new T.WebGLRenderTarget(192, 192, options);
    this.b = new T.WebGLRenderTarget(192, 192, options);
    this.stepPass = new FullscreenPass(simulation, this.sim);
    this.pass = new FullscreenPass(display, { ...this.uniforms, ...this.look });
    this.resize(w, h);
  }
  override async prepare(renderer: T.WebGLRenderer) {
    await Promise.all([
      super.prepare(renderer),
      renderer.compileAsync(this.stepPass.scene, this.stepPass.camera),
    ]);
  }
  protected override onReset() {
    this.pendingReset = true;
    this.accumulator = 0;
  }
  override update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    const p = this.params;
    if (
      p.cells !== this.cells ||
      p.states !== this.states ||
      p.threshold !== this.threshold ||
      p.seed !== this.seed
    ) {
      this.cells = p.cells;
      this.states = p.states;
      this.threshold = p.threshold;
      this.seed = p.seed;
      this.onReset();
      this.a.setSize(p.cells, p.cells);
      this.b.setSize(p.cells, p.cells);
      this.sim.grid.value.set(p.cells, p.cells);
    }
    this.sim.states.value = p.states;
    this.sim.threshold.value = p.threshold;
    this.sim.seed.value = p.seed;
    this.look.uHue.value = p.hue;
    this.look.uIntensity.value = p.intensity;
    this.look.uReactivity.value = p.reactivity;
    // Fixed generation rate; bounded catch-up avoids stalls after tab suspension.
    this.accumulator +=
      Math.max(0, Math.min(dt, 0.25)) *
      30 *
      p.speed *
      (1 + audio.bass * p.reactivity);
  }
  override render(renderer: T.WebGLRenderer, output: T.WebGLRenderTarget) {
    if (this.pendingReset) {
      this.sim.state.value = null;
      this.sim.initialize.value = 1;
      this.stepPass.render(renderer, this.a);
      this.sim.initialize.value = 0;
      this.pendingReset = false;
    }
    const steps = Math.min(24, Math.floor(this.accumulator));
    this.accumulator -= steps;
    for (let i = 0; i < steps; i++) {
      this.sim.state.value = this.a.texture;
      this.stepPass.render(renderer, this.b);
      const swap = this.a;
      this.a = this.b;
      this.b = swap;
    }
    this.look.state.value = this.a.texture;
    this.pass.render(renderer, output);
  }
  override dispose() {
    super.dispose();
    this.stepPass.dispose();
    this.a.dispose();
    this.b.dispose();
  }
}
