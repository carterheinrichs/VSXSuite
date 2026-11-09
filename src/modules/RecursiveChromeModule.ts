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
 float sector=2.*PI/uDensity;
 float folded=mod(a+sector*.5,sector)-sector*.5;
 // One spectrum value per tooth keeps its end face planar. Sampling FFT
 // continuously across a face creates tiny, steep steps that tear under motion.
 float toothIndex=floor((a+sector*.5)/sector);
 float band=fft(.5+.45*sin(toothIndex*sector));
 // Flat-sided gear frames and beveled rectangular teeth avoid rounded lobes.
 float radius=2.25-uBass*.3-uKick*.22;
 float polygon=r*cos(folded);
 float ring=max(abs(polygon-radius)-(.12+uBass*.12),abs(p.z)-.16);
 vec3 q=vec3(cos(folded)*r-radius,sin(folded)*r,p.z);
 q.xz=rot(sin(uTime+slice)*.25+uKick*.55+band*.5)*q.xz;
 vec3 box=abs(q)-vec3(.38+band*.38,.14+uTreble*.12,.32+uKick*.23);
 float tooth=length(max(box,0.))+min(max(box.x,max(box.y,box.z)),0.)-.035;
 return vec2(min(ring,tooth),slice+toothIndex);
}
void main(){
 vec2 uv=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float radius=length(uv),angle=atan(uv.y,uv.x);
 float spectrum=fft(fract(angle/(2.*PI)+.5));
 uv=rot(sin(uTime*.31)*.24+uDrive*.09+uKick*.3)*uv;
 uv*=1.+sin(radius*9.-uTime*2.)*(uBass*.23+uKick*.2)*uWarp;
 vec3 ro=vec3((.3+uBass*.2)*sin(uTime*.53),(.26+uMid*.18)*cos(uTime*.41),uDrive*1.6);
 vec3 rd=normalize(vec3(uv,1.05+uBass*.18+uKick*.16));
 float travel=0.; vec2 hit=vec2(1.); vec3 p=ro;
 float tolerance=.002;
 for(int i=0;i<112;i++){
  p=ro+rd*travel;
  hit=sculpture(p);
  tolerance=max(.002,travel*.35/uResolution.y);
  if(hit.x<tolerance || travel>26.)break;
  // The repeated slice changes orientation at its boundary. Never step past
  // that boundary using the previous slice's distance estimate.
  float localZ=mod(p.z+1.2,2.4)-1.2;
  float boundary=(1.2-localZ)/max(rd.z,.001);
  float conservative=hit.x/(2.+uWarp*(1.+uMid+uKick));
  travel+=max(min(conservative,boundary+.001),.0005);
 }
 // A second, analytic tunnel fills misses and the vanishing point with moving detail.
 // Clamping radius avoids singularities at the center without a black end cap.
 float depth=(1.+uBass*.25+uKick*.35)/max(radius,.045);
 float weave=sin(angle*uDensity+sin(depth*.7-uTime)*(1.+uMid*2.)*uWarp+uKick*2.);
 float lanes=.5+.5*sin(depth*2.6-uDrive*4.+weave*1.8);
 float filigree=pow(.5+.5*cos(angle*32.+depth*5.-uTime*3.),8.);
 vec3 backdrop=palette(uHue+depth*.09+weave*.16+uTime*.045)
   *(.18+lanes*.28+filigree*(.12+uTreble*.65)+spectrum*.65);
 vec3 col=backdrop;
 if(hit.x<tolerance && travel<26.){
  vec2 e=vec2(.004,0.);
  vec3 n=normalize(vec3(sculpture(p+e.xyy).x-sculpture(p-e.xyy).x,
   sculpture(p+e.yxy).x-sculpture(p-e.yxy).x,
   sculpture(p+e.yyx).x-sculpture(p-e.yyx).x));
  vec3 reflected=reflect(rd,n);
  float bands=.5+.5*sin(reflected.y*13.+reflected.x*9.+p.z*1.8+uTreble*2.+uKick);
  float hue=uHue+hit.y*.071+p.z*.045+reflected.x*.28+reflected.y*.24+uMid*.2+uKick*.12;
  vec3 enamel=pow(palette(hue),vec3(2.6));
  float diffuse=max(dot(n,normalize(vec3(-.5,.8,-.7))),0.);
  float spec=pow(max(dot(reflected,normalize(vec3(-.4,.7,-1.))),0.),38.);
  float fresnel=pow(1.-max(dot(n,-rd),0.),2.);
  float engrave=p.z*32.+atan(p.y,p.x)*24.+sin(p.x*12.)*2.;
  float etching=.5+.5*sin(engrave)*exp(-fwidth(engrave)*.7);
  col=enamel*(.28+diffuse*.8+bands*.55)*( .65+.35*etching)
   +vec3(1.,.9,.7)*spec*1.4+pow(palette(hue+.2),vec3(2.))*fresnel*.3;
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
      dt * this.params.speed * (1 + audio.bass * 2.5 + this.kick * 3.5);
    this.extra.uKick.value = this.kick;
    this.extra.uDrive.value = this.drive;
    this.uniforms.uTime.value = this.phase;
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uHue.value = this.params.hue;
    this.extra.uWarp.value = this.params.warp;
    this.extra.uDensity.value = Math.max(2, Math.floor(this.params.symmetry));
  }
}
