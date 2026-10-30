import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { ShaderModule } from "./ShaderModule";
import { common, FullscreenPass } from "../shaders/shared";

// Original console-era inspired scenes: layered light, saturated color and high-energy flight.
const ribbons =
  common +
  `
uniform float uIntensity,uSpread,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 p=rot(.15*sin(t*.16)+uBeat*.04)*p;
 vec3 col=vec3(.004,.007,.018);
 float edgeSharp=min(190.,.88*uResolution.y);
 float baseEnergy=(.52+uRms*1.05+uBeat*.45)*uIntensity;
 // Back-to-front translucent curtains with high-energy beat ripples and electric crests.
 for(int i=0;i<9;i++){
  float k=float(i), depth=k*.125;
  float x=p.x*(1.+depth*.38);
  float spec=fft(depth*.65);
  float center=sin(x*2.2+t*.28+k*.54)*(.2+uSpread*.14+uBass*.06)
    +sin(x*4.6-t*.22+k*.7)*(.065+uBeat*.03)+(depth-.5)*.32;
  center+=wave(clamp(x*.26+.5,0.,1.))*(.035+uBass*.085+uBeat*.04);
  float d=p.y-center;
  float width=.02+depth*.02+uMid*.018+spec*.018;
  float body=exp(-d*d/(width*width));
  float edge=exp(-abs(d-width*.6)*edgeSharp);
  float crest=exp(-abs(d+width*.45)*edgeSharp*.75)*(.4+uBeat*.8);
  float halo=exp(-abs(d)*10.);
  float pleats=.55+.45*sin(x*21.+k*2.+t*.45+sin(x*5.5+t*.25)*2.4);
  vec3 color=palette(depth*.28+x*.14+t*.015+uHue);
  col+=color*(body*(.3+pleats*.7)+edge*.75+crest*.45+halo*.065)
    *(baseEnergy+spec*.65*uIntensity);
 }
 float shock=exp(-abs(length(p)-fract(t*.35)*1.1)*28.)*uBeat*.35;
 col+=palette(uHue+.22)*shock*uIntensity;
 col+=palette(uHue+.18)*(.032+uBass*.025)/(.1+length(p-vec2(.45*sin(t*.12),0.)));
 col*=1.-smoothstep(.38,1.45,length(p))*.78;
 gl_FragColor=vec4(col,1.);
}`;

const drift =
  common +
  `
uniform float uIntensity,uTwist,uHue;
uniform vec4 uHoops[28];
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 vec3 col=vec3(.003,.005,.015);
 float t=uTime;
 float px=1.3/uResolution.y;
 float energy=uIntensity*(.58+uRms*1.15+uBeat*.55);
 float bassScale=1.+uBass*.14+uBeat*.08;
 // Nested perspective hoops travel toward the camera; per-hoop transforms are precomputed on CPU.
 for(int i=0;i<28;i++){
  float z=fract(float(i)*(1./28.)-t*.065);
  float size=.035+z*z*1.7;
  vec4 h=uHoops[i];
  vec2 d0=p-h.xy;
  float r=length(d0);
  // Skip hoops whose glow footprint cannot reach this pixel.
  if(abs(r-size)<.18+size*.5){
   vec2 q=vec2(h.z*d0.x-h.w*d0.y,h.w*d0.x+h.z*d0.y);
   float angle=atan(q.y,q.x);
   float shape=1.+.16*cos(angle*5.+(1.-z)*5.+t*.25)+.06*sin(angle*10.-t*.6);
   float spectrum=fft(abs(angle)*(1./PI));
   float d=r-size*shape*bassScale-spectrum*.042*z;
   float ad=abs(d);
   float line=1.-smoothstep(px,px*2.6,ad);
   float spark=exp(-abs(d+spectrum*.018*z)*95.)*spectrum*.85;
   float glow=exp(-ad/(.009+size*.022));
   float fade=smoothstep(0.,.1,z)*(1.-smoothstep(.82,1.,z));
   vec3 color=palette(float(i)*(.65/28.)+sin(angle)*.1+t*.022+uHue);
   col+=color*(line*.85+spark+glow*.36)*fade*energy;
  }
 }
 // Reactive vanishing core and radial beat burst.
 float r0=length(p);
 col+=palette(t*.022+uHue+.3)*(.024+uBeat*.03)/(.065+r0);
 col*=1.-smoothstep(.45,1.5,r0)*.75;
 gl_FragColor=vec4(col,1.);
}`;

const blades =
  common +
  `
uniform float uIntensity,uSpread,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 p=rot(.1*sin(t*.18)+uBeat*.035)*p;
 vec3 col=vec3(.003,.007,.014);
 float px=1.3/uResolution.y;
 float energy=(.56+uRms*1.1+uBeat*.5)*uIntensity;
 // Sweeping concave Xenon blades arranged in mirrored depth pairs with electric arcs.
 for(int i=0;i<8;i++){
  float k=float(i), side=mod(k,2.)*2.-1., tier=floor(k*.5)*.333;
  float span=.13+tier*(.22+uSpread*.14)+uBass*.055;
  float bend=.58+tier*.48+.18*sin(t*.35+k);
  float waveMod=wave(clamp(p.y*.65+.5,0.,1.))*(.032+uMid*.065+uBeat*.03);
  float curve=side*(span+bend*p.y*p.y)+sin(p.y*4.2-t*.55+k*.9)*.042+waveMod;
  float d=(p.x-curve)*side;
  float spec=fft(.1+tier*.72);
  float width=.028+tier*.024+spec*.035;
  float rim=1.-smoothstep(px,px*2.6,abs(d));
  float sheen=exp(-max(0.,d)/width)*smoothstep(-.014,px,d);
  float glow=exp(-abs(d)/(.012+width*.5));
  float ribs=.55+.45*sin(p.y*30.-t*1.8+k*1.7);
  vec3 color=palette(tier*.24+uHue+p.y*.1+t*.014);
  col+=color*(rim*1.05+sheen*(.42+ribs*.58)+glow*.24)*(energy+spec*.65*uIntensity);
 }
 // Segmented four-quadrant Ring of Light core launching concentric shockwaves on beats.
 float r=length(p), a=atan(p.y,p.x);
 float gap=smoothstep(.08,.17,abs(sin(a*2.+t*.3)));
 float specA=fft(abs(a)*(1./PI));
 float ringR=.16+uBass*.045+specA*.038;
 float ringD=abs(r-ringR);
 float ring=(1.-smoothstep(px,px*3.,ringD)+exp(-ringD*48.)*.48)*gap;
 float pulseR=fract(t*.45)*(.55+uSpread*.2);
 float shock=exp(-abs(r-pulseR)*36.)*(1.-pulseR)*(.35+uBeat*.9)*gap;
 col+=palette(uHue+.12+r*.45)*(ring*1.35+shock)*energy;
 col+=palette(uHue)*(.03+uBeat*.03)/(.075+r);
 col*=1.-smoothstep(.44,1.45,r)*.76;
 gl_FragColor=vec4(col,1.);
}`;

const lattice =
  common +
  `
uniform float uIntensity,uWarp,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 p=rot(.12*sin(t*.2)+wave(.5)*.06)*p;
 vec3 col=vec3(.003,.005,.016);
 float px=1.3/uResolution.y;
 float energy=(.58+uRms*1.1+uBeat*.5)*uIntensity;
 // Gravity-well shockwave warps space from the center on bass hits.
 float r=length(p);
 float ripple=sin(r*15.-t*3.2)*exp(-r*2.1)*(.04+uBass*.11+uBeat*.06)*uWarp;
 vec2 wp=p+normalize(p+1e-4)*ripple;
 float ay=abs(wp.y)+.032;
 float z=clamp(.28/ay,0.,18.);
 float fade=smoothstep(.032,.2,ay)*exp(-z*.13);
 // Dual perspective vector planes with high-speed neon pulse lanes.
 vec2 g=vec2(wp.x*z*1.35,z-t*2.8);
 g.x+=sin(g.y*.45+t*.75)*(.22+uMid*.32)*uWarp;
 g.y+=wave(clamp(wp.x*.4+.5,0.,1.))*uWarp*.45;
 vec2 cell=abs(fract(g)-.5);
 vec2 gw=clamp(fwidth(g),vec2(.02),vec2(.35));
 vec2 lines=1.-smoothstep(gw*.55,gw*1.9,cell);
 float grid=max(lines.x,lines.y);
 float pulse=pow(max(0.,sin(g.y*1.2-t*3.5+abs(g.x)*.8)),8.)*(.45+uBeat*.9);
 float crossGlow=exp(-(cell.x+cell.y)*8.5)*(1.5+pulse);
 float spec=fft(clamp(abs(wp.x)*.75,0.,1.));
 vec3 gridCol=palette(z*.05+abs(wp.x)*.28+t*.025+uHue);
 col+=gridCol*(grid*.9+crossGlow*.42)*fade*(energy+spec*.65*uIntensity);
 // Horizon laser beacons and diamond nodes pulsing to frequency bands.
 for(int i=0;i<7;i++){
  float k=float(i)-3.;
  float bx=k*.24+sin(t*.4+k*1.3)*.04;
  float band=fft(.08+abs(k)*.26);
  float h=.06+band*.28+uBass*.07+uBeat*.05;
  float dx=abs(wp.x-bx), dy=abs(wp.y);
  float diamond=dx*1.35+dy-h*.48;
  float node=1.-smoothstep(px,px*2.6,abs(diamond));
  float pillar=exp(-dx*65.)*smoothstep(h*1.85,0.,dy)*(.35+band*1.1);
  float flare=exp(-dy*85.)*exp(-dx*18.)*(.2+uBeat*.55);
  float halo=exp(-length(vec2(dx,max(0.,dy-h*.3)))*22.)*.28;
  vec3 bCol=palette(k*.09+uHue+.22+t*.018);
  col+=bCol*(node*.95+pillar+flare+halo)*energy;
 }
 // Glowing horizon seam and soft vignette.
 col+=palette(uHue+.45+wp.x*.22)*exp(-abs(wp.y)*36.)*(.24+uBass*.32+uBeat*.25)*energy;
 col*=1.-smoothstep(.45,1.45,r)*.74;
 gl_FragColor=vec4(col,1.);
}`;

const mandala =
  common +
  `
uniform float uIntensity,uSymmetry,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 float r=length(p);
 float a=atan(p.y,p.x)+t*.14*sin(t*.11);
 float sector=PI/uSymmetry;
 float fa=abs(mod(a+sector,2.*sector)-sector);
 vec2 q=vec2(cos(fa),sin(fa))*r;
 vec3 col=vec3(.004,.005,.016);
 float px=1.3/uResolution.y;
 float energy=(.56+uRms*1.1+uBeat*.5)*uIntensity;
 // Kaleidoscopic Lissajous petals and orbiting plasma nodes in folded polar space.
 for(int i=0;i<6;i++){
  float k=float(i), phase=k*.52+t*(.34+k*.05);
  float spec=fft(k*.16+.05);
  float rad=.1+k*.068+spec*.075+uBass*.05;
  float petal=rad*(.76+.32*cos(fa*uSymmetry*(1.+mod(k,2.))+phase))
    +wave(clamp(fa/sector,0.,1.))*(.025+uMid*.05+uBeat*.03);
  float d=abs(r-petal);
  float filament=1.-smoothstep(px,px*2.6,d);
  float halo=exp(-d/(.0075+k*.0035));
  vec2 orbPos=vec2(rad*cos(fa*.6+.22*sin(phase)),rad*sin(phase)*.45);
  float orbD=length(q-orbPos);
  float orb=(.0024+spec*.0035+uBeat*.002)/(.001+orbD*orbD*16.);
  vec3 color=palette(k*.15+fa*.28+r*.38-t*.024+uHue);
  col+=color*(filament*.9+halo*.32+orb*.7)*(energy+spec*.55*uIntensity);
 }
 // Spectral history interference waves radiating from the core.
 float hist=texture2D(uAudioHistoryTexture,vec2(clamp(fa/sector,0.,1.),clamp(r*1.15,0.,1.))).r;
 float corona=pow(max(0.,cos(r*36.-t*2.+hist*4.5)),10.)*(.06+hist*.26+uBeat*.14)*exp(-r*1.6);
 col+=palette(uHue+.32+r*.5)*corona*energy;
 col+=palette(uHue+.15)*(.032+uBeat*.03)/(.06+r);
 col*=1.-smoothstep(.45,1.45,r)*.76;
 gl_FragColor=vec4(col,1.);
}`;

const hypernova =
  common +
  `
uniform float uIntensity,uTwist,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 float r=length(p), a=atan(p.y,p.x);
 vec3 col=vec3(.004,.004,.015);
 float px=1.3/uResolution.y;
 float energy=(.58+uRms*1.15+uBeat*.6)*uIntensity;
 // Relativistic logarithmic spiral arms tearing into a beat-driven singularity.
 float logR=log(r+.045);
 float waveMod=wave(clamp(abs(a)*(1./PI),0.,1.))*(.12+uBass*.22);
 for(int i=0;i<5;i++){
  float k=float(i);
  float spec=fft(k*.2+.06);
  float dir=mod(k,2.)*2.-1.;
  float spiral=a*3.+logR*(3.2+uTwist*2.4)*dir-t*(1.4+k*.25)*dir+k*1.25+waveMod;
  float arm=abs(fract(spiral*(1./(2.*PI)))-.5)*r*.55;
  float line=1.-smoothstep(px,px*2.8,arm);
  float plasma=exp(-arm/(.008+r*.035+spec*.02));
  vec3 color=palette(k*.17+logR*.22-t*.03+uHue);
  col+=color*(line*.85+plasma*.38)*smoothstep(.02,.12,r)*(energy+spec*.65*uIntensity);
 }
 // Radial FFT star-streaks and expanding accretion shockwave rings.
 float rays=fft(abs(sin(a*6.+t*.2)))*pow(max(0.,cos(a*16.-t*1.2+logR*4.)),14.);
 col+=palette(uHue+.4+r*.5)*rays*(.45+uBeat*.9)*exp(-r*1.4)*energy;
 float coreR=.1+uBass*.055+uBeat*.045;
 float ringD=abs(r-coreR);
 float horizon=1.-smoothstep(px,px*3.,ringD)+exp(-ringD*55.)*.65;
 float blastR=fract(t*.55)*.95;
 float blast=exp(-abs(r-blastR)*32.)*(1.-blastR)*(.4+uBeat*1.1);
 col+=palette(uHue+.18)*(horizon*1.3+blast)*energy;
 col+=palette(uHue)*(.035+uBeat*.04)/(.055+r*r*6.);
 col*=1.-smoothstep(.45,1.45,r)*.76;
 gl_FragColor=vec4(col,1.);
}`;

const nexus =
  common +
  `
uniform float uIntensity,uSpread,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 p=rot(.09*sin(t*.14))*p;
 float r=length(p), a=atan(p.y,p.x);
 vec3 col=vec3(.003,.006,.016);
 float px=1.3/uResolution.y;
 float energy=(.56+uRms*1.1+uBeat*.55)*uIntensity;
 // 48-band radial 360 spectrum analyzer with segmented cells and peak-hold caps.
 float bands=48.;
 float idx=floor((a+PI)*(bands/(2.*PI)));
 float cellA=(fract((a+PI)*(bands/(2.*PI)))-.5)*(2.*PI/bands)*r;
 float freq=abs(idx-bands*.5)/(bands*.5);
 float spec=fft(freq*.88+.04);
 float barLen=.15+spec*(.24+uSpread*.14)+uBass*.05;
 float innerR=.13+uBass*.025;
 float inBar=smoothstep(px*1.8,px*.4,abs(cellA)-.0045*r)
   *smoothstep(innerR-px,innerR+px,r)*smoothstep(innerR+barLen+px,innerR+barLen-px,r);
 float segs=.65+.35*sin((r-innerR)*140.-t*2.);
 float capR=innerR+barLen+.022+uBeat*.028+spec*.02;
 float cap=exp(-length(vec2(cellA,r-capR))*95.)*(.65+spec*.9);
 float ray=exp(-abs(cellA)*110.)*smoothstep(innerR,innerR+barLen*1.45,r)*exp(-max(0.,r-innerR)*3.2)*spec*.55;
 vec3 barCol=palette(freq*.55+(r-innerR)*1.2-t*.02+uHue);
 col+=barCol*(inBar*segs*1.15+cap*1.25+ray)*energy;
 // Counter-rotating inner oscilloscope turbine ring.
 float waveR=innerR*.78+wave(freq)*(.022+uMid*.04)+.012*sin(a*8.-t*2.4);
 float wd=abs(r-waveR);
 float scope=1.-smoothstep(px,px*2.6,wd)+exp(-wd*65.)*.45;
 col+=palette(uHue+.32+freq*.3)*scope*energy*1.15;
 col+=palette(uHue+.15)*(.028+uBass*.03)/(.07+r);
 col*=1.-smoothstep(.45,1.45,r)*.76;
 gl_FragColor=vec4(col,1.);
}`;

const tesla =
  common +
  `
uniform float uIntensity,uWarp,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 float r=length(p), a=atan(p.y,p.x);
 vec3 col=vec3(.003,.004,.016);
 float px=1.3/uResolution.y;
 float energy=(.58+uRms*1.15+uBeat*.65)*uIntensity;
 // High-voltage plasma electrodes connected by branching waveform lightning bolts.
 for(int i=0;i<7;i++){
  float k=float(i);
  float spec=fft(k*.14+.05);
  float ang=k*(2.*PI/7.)+t*(.28+.04*mod(k,2.)*2.-.04)+.25*sin(t*.4+k);
  float orbR=.28+.06*sin(t*.5+k*1.7)+uBass*.05;
  vec2 dir=vec2(cos(ang),sin(ang));
  vec2 perp=vec2(-dir.y,dir.x);
  float proj=clamp(dot(p,dir)/orbR,0.,1.);
  float env=proj*(1.-proj)*4.;
  float jag=(sin(proj*18.-t*6.+k*2.)*.028+sin(proj*43.+t*9.5-k*3.7)*.012
    +wave(proj)*(.035+uTreble*.05))*env*uWarp;
  float boltD=abs(dot(p,perp)-jag);
  float mask=smoothstep(-.02,.04,dot(p,dir))*smoothstep(orbR+.03,orbR-.02,dot(p,dir));
  float core=1.-smoothstep(px,px*2.5,boltD);
  float arcGlow=exp(-boltD/(.006+spec*.014+.006*env));
  vec2 node=dir*orbR;
  float nodeD=length(p-node);
  float electrode=(.0028+spec*.004+uBeat*.0025)/(.001+nodeD*nodeD*20.);
  vec3 color=palette(k*.12+proj*.28-t*.025+uHue);
  col+=color*((core*1.15+arcGlow*.45)*mask+electrode*.8)*(energy+spec*.6*uIntensity);
 }
 // Overcharged central plasma globe and outer containment shell.
 float shellD=abs(r-(.36+uBass*.04+wave(abs(a)*(1./PI))*.02*uWarp));
 float shell=1.-smoothstep(px,px*2.8,shellD)+exp(-shellD*45.)*.32;
 col+=palette(uHue+.42+a*.1)*shell*energy*.85;
 col+=palette(uHue+.18)*(.036+uBeat*.04)/(.05+r*r*8.);
 col*=1.-smoothstep(.45,1.45,r)*.76;
 gl_FragColor=vec4(col,1.);
}`;

const cathedral =
  common +
  `
uniform float uIntensity,uSymmetry,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 float r=length(p), a=atan(p.y,p.x);
 vec3 col=vec3(.003,.005,.016);
 float px=1.3/uResolution.y;
 float energy=(.56+uRms*1.12+uBeat*.55)*uIntensity;
 // Dual upper and lower laser emitter arrays sweeping volumetric fan beams.
 for(int i=0;i<6;i++){
  float k=float(i), side=mod(k,2.)*2.-1., pair=floor(k*.5);
  float spec=fft(pair*.3+.08);
  vec2 orig=vec2((pair-1.)*.28*sin(t*.22+k),side*.46);
  vec2 d=p-orig;
  float la=atan(d.y,d.x);
  float fan=cos(la*(5.+uSymmetry)+t*(.8+pair*.25)*side+k);
  float beam=pow(max(0.,fan),14.)*exp(-length(d)*1.45)*(.45+spec*.95+uBeat*.45);
  float scan=1.-smoothstep(px,px*2.6,abs(fan-.96)*length(d)*.35);
  vec3 lCol=palette(k*.15+uHue+length(d)*.25-t*.02);
  col+=lCol*(beam*.65+scan*.45*exp(-length(d)*1.8))*energy;
 }
 // Central spinning polygonal prism splitting beats into RGB-shifted caustic rings.
 float polyA=a+t*.24;
 float sector=2.*PI/uSymmetry;
 float prismR=cos(PI/uSymmetry)/cos(mod(polyA+sector*.5,sector)-sector*.5);
 float size=.15+uBass*.045+wave(abs(a)*(1./PI))*.02;
 for(int c=0;c<3;c++){
  float ch=float(c);
  float pd=abs(r*prismR-size*(1.+ch*(.045+uBeat*.04)));
  float edge=1.-smoothstep(px,px*2.8,pd)+exp(-pd*52.)*.42;
  vec3 cCol=palette(uHue+ch*.28+r*.4+t*.02);
  col+=cCol*edge*energy*.75;
 }
 col+=palette(uHue+.2)*(.028+uBeat*.03)/(.065+r);
 col*=1.-smoothstep(.45,1.45,r)*.76;
 gl_FragColor=vec4(col,1.);
}`;

const triangles =
  common +
  `
uniform float uIntensity,uTwist,uHue;
float sdTri(vec2 p,float r){
 const float k=1.7320508;
 p.x=abs(p.x)-r;
 p.y=p.y+r/k;
 if(p.x+k*p.y>0.)p=vec2(p.x-k*p.y,-k*p.x-p.y)*.5;
 p.x-=clamp(p.x,-2.*r,0.);
 return -length(p)*sign(p.y);
}
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float t=uTime;
 float r=length(p);
 vec3 col=vec3(.003,.005,.016);
 float px=1.3/uResolution.y;
 float energy=(.58+uRms*1.15+uBeat*.6)*uIntensity;
 // Background isometric triangle shard tessellation pulsing with the spectrum.
 vec2 sg=rot(t*.05)*p*(5.5+uBass*.8);
 sg.x+=sg.y*.57735;
 vec2 id=floor(sg), f=fract(sg);
 float orient=step(f.x,f.y);
 float triEdge=min(min(f.x,1.-f.y),abs(f.x-f.y));
 float cellHash=fract(sin(dot(id+orient*.5,vec2(12.9898,78.233)))*43758.5453);
 float shardSpec=fft(cellHash*.85+.05);
 float shardLine=1.-smoothstep(.02,.08,triEdge);
 float shardFill=smoothstep(.45,.05,triEdge)*pow(shardSpec,1.6)*(.35+uBeat*.85);
 vec3 shardCol=palette(cellHash*.45+r*.3-t*.02+uHue+.25);
 col+=shardCol*(shardLine*.16+shardFill*.42)*exp(-r*1.35)*energy;
 // Nested 3D tunnel of counter-rotating equilateral neon delta frames.
 for(int i=0;i<16;i++){
  float k=float(i);
  float z=fract(k*(1./16.)-t*.085);
  float iz=1.-z;
  float sz=.04+z*z*1.55*(1.+uBass*.14+uBeat*.08);
  if(abs(r-sz*.75)<.22+sz*.55){
   vec2 shift=vec2(sin(iz*3.5+t*.3),cos(iz*2.8+t*.24))*.11*z;
   float flip=mod(k,2.)*PI/3.;
   vec2 q=rot(t*.18*(mod(k,2.)*2.-1.)+iz*uTwist*1.8+flip)*(p-shift);
   float spec=fft(k*(.8/16.)+.05);
   float waveMod=wave(clamp(atan(q.y,q.x)*(1./(2.*PI))+.5,0.,1.))*(.012+uMid*.025)*z;
   float d=abs(sdTri(q,sz)+waveMod);
   float edge=1.-smoothstep(px,px*2.7,d);
   float glow=exp(-d/(.007+sz*.02+spec*.015));
   float fade=smoothstep(0.,.1,z)*(1.-smoothstep(.82,1.,z));
   vec3 tCol=palette(k*(.65/16.)+iz*.2+t*.025+uHue);
   col+=tCol*(edge*1.05+glow*.4)*fade*(energy+spec*.65*uIntensity);
  }
 }
 // Fracturing 4-piece Sierpinski / Triforce delta core exploding outward on beats.
 vec2 cp=rot(-t*.32)*p;
 float coreSz=.12+uBass*.045+uBeat*.04;
 float centerD=abs(sdTri(-cp,coreSz*.48));
 float split=.065+uBass*.04+uBeat*.055;
 for(int j=0;j<3;j++){
  float ang=float(j)*(2.*PI/3.)+PI/6.;
  vec2 sub=cp-vec2(cos(ang),sin(ang))*split;
  centerD=min(centerD,abs(sdTri(sub,coreSz*.46)));
 }
 float coreEdge=1.-smoothstep(px,px*2.8,centerD)+exp(-centerD*58.)*.65;
 col+=palette(uHue+.15+r*.5)*coreEdge*energy*1.25;
 col+=palette(uHue+.3)*(.032+uBeat*.035)/(.06+r);
 col*=1.-smoothstep(.45,1.45,r)*.76;
 gl_FragColor=vec4(col,1.);
}`;

abstract class ConsoleLightModule extends ShaderModule {
  abstract params: {
    speed: number;
    intensity: number;
    hue: number;
    spread?: number;
    twist?: number;
    warp?: number;
    symmetry?: number;
  };
  protected abstract readonly fragment: string;
  private time = 0;
  private readonly hoops = Array.from({ length: 28 }, () => new T.Vector4());
  private readonly extra = {
    uIntensity: { value: 1 },
    uSpread: { value: 1 },
    uTwist: { value: 1 },
    uWarp: { value: 1 },
    uSymmetry: { value: 8 },
    uHue: { value: 0 },
    uHoops: { value: this.hoops },
  };
  init(_renderer: T.WebGLRenderer, w: number, h: number) {
    this.pass = new FullscreenPass(this.fragment, {
      ...this.uniforms,
      ...this.extra,
    });
    this.resize(w, h);
  }
  override update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    this.time +=
      dt * this.params.speed * (1 + audio.mid * 0.45 + audio.beat * 0.25);
    const t = this.time;
    const twist = this.params.twist ?? 1;
    this.uniforms.uTime.value = t;
    this.extra.uIntensity.value = this.params.intensity;
    this.extra.uSpread.value = this.params.spread ?? 1;
    this.extra.uTwist.value = twist;
    this.extra.uWarp.value = this.params.warp ?? 1;
    this.extra.uSymmetry.value = this.params.symmetry ?? 8;
    this.extra.uHue.value = this.params.hue;
    if (this.id === "mandala") audio.uAudioHistoryTexture.needsUpdate = true;
    if (this.id === "prismatic") {
      for (let i = 0; i < 28; i++) {
        const z = (((i / 28 - t * 0.065) % 1) + 1) % 1;
        const iz = 1 - z;
        const cx = Math.sin(iz * 4 + t * 0.17) * 0.16 * z;
        const cy = Math.cos(iz * 3 + t * 0.13) * 0.16 * z;
        const rotAngle = t * 0.09 + iz * twist * 2;
        this.hoops[i].set(cx, cy, Math.cos(rotAngle), Math.sin(rotAngle));
      }
    }
  }
}

export class AuroraRibbonsModule extends ConsoleLightModule {
  readonly id = "aurora";
  readonly name = "Aurora ribbons";
  protected readonly fragment = ribbons;
  params = { speed: 0.85, intensity: 1.25, spread: 1, hue: 0.12 };
}

export class PrismaticDriftModule extends ConsoleLightModule {
  readonly id = "prismatic";
  readonly name = "Prismatic drift";
  protected readonly fragment = drift;
  params = { speed: 0.95, intensity: 1.3, twist: 1, hue: 0.55 };
}

export class XenonBladesModule extends ConsoleLightModule {
  readonly id = "blades";
  readonly name = "Xenon blades";
  protected readonly fragment = blades;
  params = { speed: 0.9, intensity: 1.3, spread: 1, hue: 0.28 };
}

export class VectorLatticeModule extends ConsoleLightModule {
  readonly id = "lattice";
  readonly name = "Vector lattice";
  protected readonly fragment = lattice;
  params = { speed: 1, intensity: 1.3, warp: 1, hue: 0.72 };
}

export class SolarMandalaModule extends ConsoleLightModule {
  readonly id = "mandala";
  readonly name = "Solar mandala";
  protected readonly fragment = mandala;
  params = { speed: 0.9, intensity: 1.3, symmetry: 8, hue: 0.88 };
}

export class HypernovaVortexModule extends ConsoleLightModule {
  readonly id = "hypernova";
  readonly name = "Hypernova vortex";
  protected readonly fragment = hypernova;
  params = { speed: 1, intensity: 1.35, twist: 1.2, hue: 0.05 };
}

export class NexusSpectrumModule extends ConsoleLightModule {
  readonly id = "nexus";
  readonly name = "Nexus spectrum";
  protected readonly fragment = nexus;
  params = { speed: 0.95, intensity: 1.35, spread: 1.1, hue: 0.38 };
}

export class TeslaPlasmaModule extends ConsoleLightModule {
  readonly id = "tesla";
  readonly name = "Tesla plasma web";
  protected readonly fragment = tesla;
  params = { speed: 1.05, intensity: 1.4, warp: 1.2, hue: 0.62 };
}

export class LaserCathedralModule extends ConsoleLightModule {
  readonly id = "cathedral";
  readonly name = "Laser cathedral";
  protected readonly fragment = cathedral;
  params = { speed: 0.9, intensity: 1.35, symmetry: 6, hue: 0.82 };
}

export class ApexTrianglesModule extends ConsoleLightModule {
  readonly id = "triangles";
  readonly name = "Apex triangles";
  protected readonly fragment = triangles;
  params = { speed: 1, intensity: 1.35, twist: 1.1, hue: 0.16 };
}
