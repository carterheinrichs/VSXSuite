import { common } from "../shaders/shared";
// A sculpted anatomical impression: asymmetric ventricles, atria and great
// vessels. Everything is procedural and timestamp driven for offline export.
export const fragment =
  common +
  `
uniform float uIntensity,uHue,uReactivity,uVessels,uTurn,uCutaway,uHeartPhase;
float contraction,valveOpen;
float hash(vec3 p){p=fract(p*.3183099+vec3(.13,.37,.71));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);}
float tissue(vec3 p){return noise(p*19.)*.55+noise(p*47.)*.3+noise(p*113.)*.15;}
float microHeight(vec3 p){
 vec3 fibers=vec3(p.x*1.8+p.y*.5,p.y*.45,p.z);
 return tissue(fibers)*.0018+sin(p.y*130.+noise(p*12.)*12.+p.x*32.)*.00035;
}
float ellipsoid(vec3 p,vec3 r){return (length(p/r)-1.)*min(r.x,min(r.y,r.z));}
float blend(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float tube(vec3 p,vec3 a,vec3 b,float r){vec3 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.))-r;}
vec3 local(vec3 p){p.xz=rot(.16+sin(uTime*.17)*.10*uTurn)*p.xz;p.xy=rot(-.13)*p.xy;
 // Ventricles shorten and twist more than the atria and great vessels.
 float ventricle=1.-smoothstep(.12,.62,p.y);
 p.xz=rot(contraction*.055*ventricle)*p.xz;
 p.xz/=1.-contraction*.075*ventricle;p.y/=(1.-contraction*.035*ventricle);return p;}
float organ(vec3 p){
 vec3 q=p-vec3(.16,-.18,0.);q.xy=rot(-.30)*q.xy;
 float d=ellipsoid(q,vec3(.43,.72,.38));
 q=p-vec3(-.23,.02,.03);q.xy=rot(.27)*q.xy;
 d=blend(d,ellipsoid(q,vec3(.39,.51,.34)),.19);
 d=blend(d,ellipsoid(p-vec3(-.34,.39,-.03),vec3(.27,.27,.29)),.12);
 d=blend(d,ellipsoid(p-vec3(.31,.42,-.08),vec3(.24,.25,.26)),.12);
 // Aortic arch, ascending trunk and three branches.
 d=blend(d,tube(p,vec3(.05,.36,-.02),vec3(.04,.79,-.04),.135),.10);
 d=blend(d,tube(p,vec3(.04,.79,-.04),vec3(.23,.95,-.06),.13),.10);
 d=blend(d,tube(p,vec3(.23,.95,-.06),vec3(.43,.80,-.12),.12),.10);
 d=min(d,tube(p,vec3(.43,.80,-.12),vec3(.44,.52,-.18),.115));
 d=blend(d,tube(p,vec3(-.37,.35,-.07),vec3(-.43,.88,-.1),.105),.08);
 d=blend(d,tube(p,vec3(-.12,.41,.12),vec3(-.24,.68,.17),.12),.08);
 d=blend(d,tube(p,vec3(-.24,.68,.17),vec3(-.59,.69,.10),.09),.08);
 for(int i=0;i<3;i++){float x=float(i);d=blend(d,tube(p,vec3(.12+x*.10,.87,-.06),vec3(.08+x*.16,1.16-x*.035,-.08),.045),.045);}
 return d;
}
float cavities(vec3 p){
 vec3 left=p-vec3(.22,-.15,.27);left.xy=rot(-.12)*left.xy;
 vec3 right=p-vec3(-.25,.01,.29);right.xy=rot(.18)*right.xy;
 // Unequal chambers and an intact muscular septum; shallow trabecular relief.
 float d=min(ellipsoid(left,vec3(.225,.48,.40)),ellipsoid(right,vec3(.195,.35,.37)));
 float ridges=sin(p.y*39.+noise(p*13.)*7.+p.z*23.)*sin(p.x*29.+p.z*37.+noise(p*21.)*3.);
 return d+ridges*.003*(1.-smoothstep(.12,.35,p.z));
}
// Thin scalloped leaflets fold back toward their annulus during filling.
// The two visible atrioventricular valves have two and three cusps.
float valve(vec3 p,vec3 center,float cusps){
 vec3 q=p-center;q.yz=rot(.52)*q.yz;q.y/=.70;
 float radius=length(q.xy),angle=atan(q.y,q.x);
 float cusp=.5+.5*cos(angle*cusps+.4);
 float aperture=.002+valveOpen*(.075+.026*cusp);
 float leaflet=max(radius-(.146+.008*sin(angle*3.)),aperture-radius);
 float span=clamp(1.-radius/.15,0.,1.);
 // Tissue bows under pressure, then folds inward along individual cusp seams.
 float depth=.013+(1.-valveOpen)*span*.035-valveOpen*span*(.13+.025*cusp);
 depth+=sin(angle*cusps)*span*.007;
 return max(leaflet,abs(q.z-depth)-.0045);
}
vec3 valveCenter(float side){return side<.5 ? vec3(.20,.22,.12) : vec3(-.25,.30,.14);}
float valves(vec3 p){
 float d=min(valve(p,valveCenter(0.),2.),valve(p,valveCenter(1.),3.));
 // Chordae anchor the leaflet edges to papillary muscles in each ventricle.
 for(int side=0;side<2;side++){
  vec3 center=valveCenter(float(side));float x=center.x;
  for(int i=0;i<3;i++){
   float a=float(i)*2.094;
   vec3 edge=center+vec3(cos(a)*(.025+valveOpen*.065),sin(a)*.065,-valveOpen*.06);
   vec3 anchor=vec3(x+cos(a)*.075,-.25+float(side)*.08,-.015);
   d=min(d,tube(p,edge,anchor,.0025));
   d=min(d,tube(p,edge+vec3(.018,0.,0.),mix(edge,anchor,.65),.0018));
  }
 }
 return d;
}
float muscle(vec3 p){
 float d=organ(p);
 if(uCutaway>.5)d=max(d,-cavities(p));
 if(uCutaway>.5){
  // Papillary muscles rise from the ventricular wall beneath the chordae.
  d=blend(d,ellipsoid(p-vec3(.26,-.30,-.055),vec3(.045,.13,.065)),.025);
  d=blend(d,ellipsoid(p-vec3(-.23,-.21,-.025),vec3(.036,.10,.055)),.025);
 }
 return d;
}
float anatomy(vec3 p){float d=muscle(p);if(uCutaway>.5)d=min(d,valves(p));return d;}
float map(vec3 p){return anatomy(local(p));}
float shadow(vec3 p,vec3 light){
 float visibility=1.,t=.018;
 for(int i=0;i<12;i++){float d=map(p+light*t);visibility=min(visibility,12.*d/t);t+=clamp(d,.022,.11);if(t>.85)break;}
 return clamp(visibility,.08,1.);
}
float vessels(vec3 p){
 float d=10.;
 // Descending coronary artery and alternating lateral branches on the front.
 for(int i=0;i<7;i++){
  float t=float(i)/7.,s=float(i+1)/7.;
  vec3 a=vec3(-.12+.38*t+.035*sin(t*9.),.49-1.20*t,.35);
  vec3 b=vec3(-.12+.38*s+.035*sin(s*9.),.49-1.20*s,.35);
  d=min(d,tube(p,a,b,.018-.009*t));
  float side=mod(float(i),2.)*2.-1.;
  vec3 c=a+vec3(side*(.25-.12*t),-.13,0.);
  d=min(d,tube(p,a,c,.011-.005*t));
  d=min(d,tube(p,c,c+vec3(side*.055,-.12,0.),.006));
 }
 return d;
}
void main(){
 float phase=uHeartPhase>=0. ? fract(uHeartPhase+.12) : fract(uTime*1.12);
 float rest=exp(-pow((phase-.12)/.065,2.))+.4*exp(-pow((phase-.29)/.09,2.));
 float drive=uReactivity*(.42*uBeat+.18*uBass);
 contraction=clamp(uHeartPhase>=0. ? rest*(.55+drive) : .55*rest+drive,0.,1.);
 valveOpen=1.-smoothstep(.12,.65,contraction);
 vec2 uv=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 // Fit the whole sculpture in portrait as well as landscape.
 uv*=max(1.,uResolution.y/uResolution.x);
 vec3 ro=vec3(0.,.13,3.8),rd=normalize(vec3(uv*2.5,-3.8));
 // Soft, out-of-focus red tissue enclosing the scene, with deep edge shadows.
 float wall=noise(vec3(uv*5.,2.))+noise(vec3(uv*11.,7.))*.25;
 float vignette=exp(-dot(uv*vec2(.9,1.1),uv*vec2(.9,1.1))*2.5);
 vec3 col=vec3(.009,.0006,.001)+vec3(.068,.004,.006)*vignette*(.55+.45*wall);
 float travel=0.;vec3 p=ro;bool hit=false;
 // All anatomy fits inside a radius-1.5 sphere, including the great vessels,
 // smooth unions and valve chordae. The local rotations preserve distance;
 // contraction only shrinks the sculpture. Reject background rays before
 // evaluating anatomy, but retain the original march for every possible hit.
 float closest=-dot(ro,rd);
 vec3 nearest=ro+rd*max(closest,0.);
 if(dot(nearest,nearest)<=2.25){
  for(int i=0;i<112;i++){p=ro+rd*travel;float d=map(p);if(d<.0012){hit=true;break;}travel+=max(d*.72,.001);if(travel>6.)break;}
 }
 if(hit){
  vec2 e=vec2(.002,0.);vec3 n=normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));
  vec3 q=local(p);vec3 vesselPoint=q;vesselPoint.z=.35;float vein=vessels(vesselPoint);
  float lines=exp(-max(vein,0.)*160.)*uVessels;
  float grain=tissue(q);
  float interior=uCutaway>.5 ? 1.-smoothstep(.003,.025,abs(cavities(q))) : 0.;
  float isValve=uCutaway>.5 && valves(q)<.005 ? 1. : 0.;
  // Break up the silhouette's smooth shading with fine, irregular tissue relief.
  vec3 bump=vec3(microHeight(q+e.xyy)-microHeight(q-e.xyy),microHeight(q+e.yxy)-microHeight(q-e.yxy),microHeight(q+e.yyx)-microHeight(q-e.yyx))/(2.*e.x);
  n=normalize(n-(bump-n*dot(bump,n))*.28);
  float marbling=noise(q*7.+vec3(noise(q*15.)));
  vec3 red=mix(vec3(.105,.012,.017),vec3(.29,.055,.044),marbling);
  red*=.80+grain*.40;
  red=mix(red,vec3(.22,.037,.033)*(.65+grain*.55),interior);
  float fat=smoothstep(.38,.76,noise(q*12.))*exp(-abs(vein-.025)*40.)*(1.-interior)*(1.-isValve);
  red=mix(red,vec3(.40,.27,.13),fat*.18);
  vec2 leaflet=q.xy-(q.x>0. ? valveCenter(0.).xy : valveCenter(1.).xy);
  float seam=pow(.5+.5*cos(atan(leaflet.y,leaflet.x)*(q.x>0. ? 2. : 3.)),20.);
  red=mix(red,vec3(.50,.34,.25)*(.75+grain*.35-seam*.15),isValve);
  red=mix(red,red.gbr,uHue);
  vec3 light=normalize(vec3(-.9,1.2,1.3));
  float diffuse=max(dot(n,light),0.),rim=pow(1.-max(dot(n,-rd),0.),3.);
  vec3 halfVector=normalize(light-rd);
  float ndh=max(dot(n,halfVector),0.),ndv=max(dot(n,-rd),.01);
  float roughness=mix(.29,.19,grain)*(1.-isValve*.15);
  float a2=pow(roughness,4.);
  float distribution=a2/(PI*pow(ndh*ndh*(a2-1.)+1.,2.)+.0001);
  float fresnel=.028+.972*pow(1.-max(dot(-rd,halfVector),0.),5.);
  float spec=min(distribution*fresnel/(4.*max(diffuse,.10)*ndv+.08),1.8);
  float pulse=pow(.5+.5*cos(q.y*13.+uTime*7.),12.)*(.25+uMid*uReactivity*2.);
  float occlusion=clamp(.55*map(p+n*.04)/.04+.30*map(p+n*.10)/.10+.15*map(p+n*.20)/.20,.12,1.);
  float visibility=shadow(p+n*.012,light);
  col=red*(.16*occlusion+diffuse*visibility*1.9)+vec3(1.,.80,.66)*spec*diffuse*visibility*.65;
  col+=red*vec3(1.,.23,.12)*pow(max(dot(-n,light),0.),2.)*.35*occlusion;
  col+=vec3(.10,.017,.012)*rim*.15*occlusion;
  // Coronary vessels remain dark blood red rather than emissive neon.
  col=mix(col,col*vec3(.48,.24,.28),clamp(lines,0.,1.)*(1.-interior)*(1.-isValve)*.7);
  col+=red*pulse*.045*uReactivity*(1.-isValve);
 }
 col*=uIntensity;
 gl_FragColor=vec4(max(col,vec3(0.)),1.);
}`;
