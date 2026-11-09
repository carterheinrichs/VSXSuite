import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { common, FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";

const fragment =
  common +
  `
uniform float uIntensity,uHue,uWarp,uEvolution,uParticles,uAmbient;
uniform vec4 uWaves[8];
float hash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
float glow(float d,float w){return exp(-abs(d)/max(w,1./uResolution.y));}
vec3 tint(float h){return palette(h+uHue+uTime*.008+sin(uTime*.027)*.12);}
void main(){
 float t=uTime,e=t*uEvolution;
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.)*2.;
 p-=vec2(sin(t*.071),cos(t*.057))*.065;
 p/=1.+uBass*.07+uBeat*.035;
 float r=length(p),a=atan(p.y,p.x);
 vec4 weights=.22+.78*(.5+.5*sin(vec4(.17,.13,.11,.19)*e+vec4(0.,1.9,3.4,5.2)));
 weights+=vec4(uMid*.3,uBass*.4,uRms*.25,uTreble*.3);
 weights/=dot(weights,vec4(1.));
 vec3 col=vec3(.002,.003,.009);
 // Soft plasma banks behind the sharp filaments.
 for(int i=0;i<4;i++){
  float k=float(i),angle=k*1.57+t*.045;
  vec2 c=vec2(cos(angle)*.65,sin(angle*1.3)*.35);
  vec2 q=(p-c)/vec2(.7,.4);
  col+=tint(k*.16)*exp(-dot(q,q)*2.)*weights.z*(.3+uRms*.6);
 }
 // Mirrored spectral ribbons, with fine luminous cores and broad halos.
 for(int i=0;i<6;i++){
  float k=float(i),s=mod(k,2.)*2.-1.;
  float y=s*(.18+sin(p.x*(1.7+k*.12)+t*(.27+k*.025)+k)*(.16+uMid*.15)*uWarp);
  y+=sin(p.x*4.-t*.4+k)*.045*uWarp;
  float d=p.y-y;
  col+=tint(k*.09+p.x*.08)*(glow(d,.005)*1.3+glow(d,.035)*.22)*weights.x;
 }
 // Elliptical rings drift through depth; petal folds emerge independently.
 float er=length(p*vec2(.65,1.3));
 for(int i=0;i<9;i++){
  float k=float(i),z=fract(k/9.+t*.035);
  col+=tint(k*.07)*glow(er-z*1.8,.006+z*.008)*z*weights.y*.8;
 }
 float folded=r-(.42+cos(a*6.+t*.15)*.12*uWarp+sin(t*.25)*.07);
 col+=tint(a*.08+.35)*(glow(folded,.009)+glow(folded,.045)*.22)*weights.w;
 float impulse=0.;
 for(int i=0;i<8;i++){
  vec4 sw=uWaves[i];
  col+=tint(sw.z)*glow(er-sw.x,.015)*sw.y*.8;
  impulse+=sw.y;
 }
 // Seeded analytic orbits retain identity at every timestamp, including exports.
 // Kick envelopes push their radii outward and treble lengthens tangential trails.
 for(int i=0;i<40;i++){
  float k=float(i),seed=hash(k+1.);
  float angle=seed*6.283+t*(.035+hash(k+8.)*.07);
  float radius=.15+hash(k+31.)*.95+sin(t*.17+k)*.06+impulse*.035;
  vec2 pos=vec2(cos(angle)*1.65,sin(angle)) * radius;
  vec2 q=rot(-angle)*(p-pos);
  q/=vec2(.012+uTreble*.03,.006+hash(k+17.)*.006);
  float spark=exp(-dot(q,q)*2.);
  col+=tint(seed)*spark*(.25+uTreble*1.6+impulse*.18)*uParticles;
 }
 // Silence stays quiet unless ambient motion is explicitly enabled.
 float energy=mix(clamp(uRms*5.+uBass*.5,0.,1.3),.65+uRms*.8,uAmbient);
 col*=uIntensity*energy*(1.-smoothstep(.5,1.85,r)*.9);
 gl_FragColor=vec4(col,1.);
}`;

export class EvolvingAtmosphereModule extends ShaderModule {
  readonly id = "evolving-atmosphere";
  readonly name = "Evolving Atmosphere";
  params = {
    speed: 1,
    intensity: 1.4,
    hue: 0.62,
    warp: 1,
    evolution: 1,
    particles: 1,
    ambient: false,
  };
  private nextWave = 0;
  private readonly waves = Array.from({ length: 8 }, () => new T.Vector4());
  private readonly extra = {
    uIntensity: { value: 1.4 },
    uHue: { value: 0.62 },
    uWarp: { value: 1 },
    uEvolution: { value: 1 },
    uParticles: { value: 1 },
    uAmbient: { value: 0 },
    uWaves: { value: this.waves },
  };
  init(_renderer: T.WebGLRenderer, width: number, height: number) {
    this.pass = new FullscreenPass(fragment, {
      ...this.uniforms,
      ...this.extra,
    });
    this.resize(width, height);
  }
  protected override onReset() {
    for (const sw of this.waves) sw.set(0, 0, 0, 0);
    this.nextWave = 0;
    this.uniforms.uBass.value =
      this.uniforms.uMid.value =
      this.uniforms.uTreble.value =
        0;
  }
  override update(audio: AudioFrameData, time: number, dt: number) {
    // Offline rendering starts at zero. Clear envelopes and events on a rewind.
    if (time <= this.lastTime || this.lastTime < 0) {
      this.onReset();
    }
    const bass = this.uniforms.uBass.value;
    const mid = this.uniforms.uMid.value;
    const treble = this.uniforms.uTreble.value;
    super.update(audio, time, dt);
    this.uniforms.uTime.value = time * this.params.speed;
    this.uniforms.uBass.value =
      bass +
      (audio.bass - bass) * (1 - Math.exp(-dt * (audio.bass > bass ? 24 : 4)));
    this.uniforms.uMid.value =
      mid +
      (audio.mid - mid) * (1 - Math.exp(-dt * (audio.mid > mid ? 18 : 3)));
    this.uniforms.uTreble.value =
      treble +
      (audio.treble - treble) *
        (1 - Math.exp(-dt * (audio.treble > treble ? 28 : 6)));
    const p = this.params,
      u = this.extra;
    u.uIntensity.value = p.intensity;
    u.uHue.value = p.hue;
    u.uWarp.value = p.warp;
    u.uEvolution.value = p.evolution;
    u.uParticles.value = p.particles;
    u.uAmbient.value = p.ambient ? 1 : 0;
    for (const sw of this.waves) {
      sw.x += dt * 0.9;
      sw.y = Math.max(0, sw.y - dt * 0.65);
    }
    if (audio.kick) {
      this.waves[this.nextWave].set(
        0.08,
        0.65 + audio.bass * 0.35,
        time * 0.025,
        0,
      );
      this.nextWave = (this.nextWave + 1) % this.waves.length;
    }
  }
}
