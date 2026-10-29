import type * as T from "three";
import type { AudioFrameData } from "../core/types";
import { ShaderModule } from "./ShaderModule";
import { common, FullscreenPass } from "../shaders/shared";
const fragment =
  common +
  `
uniform float uSpeed,uDetail,uMetal,uHue;
uniform mat2 uFoldRotation;
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float map(vec3 p){
 p.xy=rot(sin(p.z*.25+uTime*.15)*(.4+uSub*.8))*p.xy;
 vec3 q=p;float scale=1.;
 // Three space folds create a bounded-distance liquid lattice.
 for(int i=0;i<3;i++){q=abs(q)-vec3(.8,.65,.7);q.xy=uFoldRotation*q.xy;q=q*1.35;scale*=1.35;}
 float folded=(length(q)-.85)/scale;
 vec3 g=p*1.65;float gyroid=abs(dot(sin(g),cos(g.zxy)))/2.86-.095-uBass*.08;
 return smin(gyroid,folded,.22);
}
vec3 normalAt(vec3 p){vec2 e=vec2(.0015,0.);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
void main(){vec2 uv=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);vec3 ro=vec3(.3*sin(uTime*.13),.3*cos(uTime*.11),uTime*uSpeed*.35);vec3 rd=normalize(vec3(uv,1.3));rd.xy=rot(uTime*.025)*rd.xy;
 float distance=0.;float d=0.;vec3 p=ro;bool hit=false;
 for(int i=0;i<112;i++){if(float(i)>uDetail)break;p=ro+rd*distance;d=map(p);if(abs(d)<.002){hit=true;break;}distance+=max(abs(d)*.55,.002);if(distance>18.)break;}
 vec3 col=vec3(.012,.017,.035);
 if(hit){vec3 n=normalAt(p);vec3 l=normalize(vec3(1.,2.,-2.));float diffuse=max(dot(n,l),0.);float fresnel=pow(1.-max(dot(n,-rd),0.),3.);vec3 reflected=reflect(rd,n);float spec=pow(max(dot(reflected,l),0.),38.);vec3 metal=palette(dot(n,vec3(.2,.4,.3))+uTime*.025+uHue+uTreble*.45);col=metal*(.18+diffuse*.5)+vec3(spec*3.)+palette(reflected.y*.3+uHue)*fresnel*uMetal;col*=exp(-distance*.075);col+=vec3(.1,.03,.19)*(1.-exp(-distance*.1));}
 col*=smoothstep(1.3,.15,length(uv));gl_FragColor=vec4(col,1.);
}`;
export class RaymarchedFractalModule extends ShaderModule {
  readonly id = "fractal";
  readonly name = "Liquid infinity";
  params = { speed: 0.65, detail: 90, metal: 1.4, hue: 0.12 };
  private flight = 0;
  private readonly extra = {
    uSpeed: { value: 0.65 },
    uDetail: { value: 90 },
    uMetal: { value: 1.4 },
    uHue: { value: 0.12 },
    uFoldRotation: { value: new Float32Array(4) },
  };
  init(_r: T.WebGLRenderer, w: number, h: number) {
    this.pass = new FullscreenPass(fragment, {
      ...this.uniforms,
      ...this.extra,
    });
    this.resize(w, h);
  }
  override update(a: AudioFrameData, t: number, dt: number) {
    super.update(a, t, dt);
    const angle = 0.65 + a.subBass * 0.3;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const rotation = this.extra.uFoldRotation.value;
    rotation[0] = c;
    rotation[1] = -s;
    rotation[2] = s;
    rotation[3] = c;
    this.flight += dt * (this.params.speed + a.mid * 0.65);
    this.extra.uSpeed.value = 1;
    this.uniforms.uTime.value = this.flight;
    this.extra.uDetail.value = this.params.detail;
    this.extra.uMetal.value = this.params.metal;
    this.extra.uHue.value = this.params.hue;
  }
}
