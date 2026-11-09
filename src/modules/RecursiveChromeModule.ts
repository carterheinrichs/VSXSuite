import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { ShaderModule } from "./ShaderModule";
import { common, FullscreenPass } from "../shaders/shared";

// Repeated sculpted rings form a continuous corridor, without external textures.
const fragment =
  common +
  `
uniform float uIntensity,uHue,uWarp,uDensity,uKick,uDrive;
vec2 sculpture(vec3 p){
 float slice=floor(p.z/2.4+.5);
 p.xy=rot(slice*.73+sin(p.z*.7+uTime*.8)*(.32+uMid*.55+uKick*.35)*uWarp)*p.xy;
 p.z=mod(p.z+1.2,2.4)-1.2;
 float a=atan(p.y,p.x),r=length(p.xy);
 float scallop=sin(a*6.+slice*.8+uTime*.65+uMid*1.2);
 float radius=2.35+scallop*(.22+uMid*.28)*uWarp;
 float ring=length(vec2(r-radius,p.z))-(.34+uBass*.26+uKick*.17);
 // Satellite beads and radial ribs break the rings into repeating organic machinery.
 float sector=2.*PI/uDensity;
 float folded=mod(a+sector*.5,sector)-sector*.5;
 vec3 q=vec3(cos(folded)*r-radius,sin(folded)*r,p.z);
 float bead=length(q/vec3(1.,1.25,1.5))-(.52+uSub*.24+uKick*.12);
 float rib=length(vec2(q.y,q.z))-.115;
 rib=max(rib,abs(q.x)-.85);
 return vec2(min(ring,min(bead,rib)),slice+floor(a/sector));
}
void main(){
 vec2 uv=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float radius=length(uv),angle=atan(uv.y,uv.x);
 float spectrum=fft(fract(angle/(2.*PI)+.5));
 uv=rot(sin(uTime*.31)*.24+uDrive*.2+uKick*.16)*uv;
 uv*=1.+sin(radius*9.-uTime*2.)*(uBass*.13+uKick*.1)*uWarp;
 vec3 ro=vec3((.3+uBass*.2)*sin(uTime*.53),(.26+uMid*.18)*cos(uTime*.41),uDrive*1.6);
 vec3 rd=normalize(vec3(uv,1.05+uBass*.18+uKick*.16));
 float travel=0.; vec2 hit=vec2(1.); vec3 p=ro;
 for(int i=0;i<72;i++){
  p=ro+rd*travel;
  hit=sculpture(p);
  if(hit.x<.003 || travel>26.)break;
  travel+=max(hit.x*.7,.002);
 }
 // A second, analytic tunnel fills misses and the vanishing point with moving detail.
 // Clamping radius avoids singularities at the center without a black end cap.
 float depth=1./max(radius,.045);
 float weave=sin(angle*uDensity+sin(depth*.7-uTime)*2.*uWarp);
 float lanes=.5+.5*sin(depth*2.6-uDrive*4.+weave*1.8);
 float filigree=pow(.5+.5*cos(angle*32.+depth*5.-uTime*3.),8.);
 vec3 backdrop=palette(uHue+depth*.09+weave*.16+uTime*.045)
   *(.18+lanes*.38+filigree*(.2+uTreble*.5)+spectrum*.35);
 vec3 col=backdrop;
 if(hit.x<.006 && travel<26.){
  vec2 e=vec2(.004,0.);
  vec3 n=normalize(vec3(sculpture(p+e.xyy).x-sculpture(p-e.xyy).x,
   sculpture(p+e.yxy).x-sculpture(p-e.yxy).x,
   sculpture(p+e.yyx).x-sculpture(p-e.yyx).x));
  vec3 reflected=reflect(rd,n);
  float bands=.5+.5*sin(reflected.y*13.+reflected.x*9.+p.z*1.8+uTreble*2.+uKick);
  float hue=uHue+hit.y*.071+p.z*.045+reflected.x*.28+reflected.y*.24+uMid*.2+uKick*.12;
  vec3 enamel=palette(hue);
  float diffuse=max(dot(n,normalize(vec3(-.5,.8,-.7))),0.);
  float spec=pow(max(dot(reflected,normalize(vec3(-.4,.7,-1.))),0.),38.);
  float fresnel=pow(1.-max(dot(n,-rd),0.),2.);
  float etching=.5+.5*sin(p.z*32.+atan(p.y,p.x)*24.+sin(p.x*12.)*2.);
  col=enamel*(.22+diffuse*.65+bands*.45)*( .8+.2*etching)
   +vec3(1.,.9,.7)*spec*2.5+palette(hue+.2)*fresnel*.7;
  col=mix(col,backdrop,1.-exp(-travel*.045));
 }
 col*=uIntensity*(.85+uRms*.55+uKick*.2);
 gl_FragColor=vec4(col,1.);
}`;

export class RecursiveChromeModule extends ShaderModule {
  readonly id = "recursive-chrome";
  readonly name = "Recursive Chrome";
  params = { speed: 0.7, intensity: 1.15, hue: 0.08, warp: 1, symmetry: 9 };
  private phase = 0;
  private drive = 0;
  private kick = 0;
  private readonly extra = {
    uIntensity: { value: 1.15 },
    uHue: { value: 0.08 },
    uWarp: { value: 1 },
    uDensity: { value: 9 },
    uKick: { value: 0 },
    uDrive: { value: 0 },
  };
  init(_renderer: T.WebGLRenderer, width: number, height: number) {
    this.pass = new FullscreenPass(fragment, {
      ...this.uniforms,
      ...this.extra,
    });
    this.resize(width, height);
  }
  protected override onReset() {
    this.phase = 0;
    this.drive = 0;
    this.kick = 0;
  }
  override update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    this.phase += dt * this.params.speed;
    this.kick *= Math.exp(-Math.max(0, dt) * 6);
    if (audio.kick) this.kick = Math.max(this.kick, 0.65 + audio.beat * 0.35);
    this.drive +=
      dt * this.params.speed * (1 + audio.bass * 1.8 + this.kick * 2.4);
    this.extra.uKick.value = this.kick;
    this.extra.uDrive.value = this.drive;
    this.uniforms.uTime.value = this.phase;
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uHue.value = this.params.hue;
    this.extra.uWarp.value = this.params.warp;
    this.extra.uDensity.value = Math.max(2, Math.floor(this.params.symmetry));
  }
}
