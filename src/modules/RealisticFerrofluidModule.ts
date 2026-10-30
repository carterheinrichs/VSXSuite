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
  private readonly blob = new T.Mesh(createIndexedSphere(1, 6), this.material);
  private readonly cyan = new T.PointLight(0x4cffff, 16, 15, 2);
  private readonly pink = new T.PointLight(0xff368f, 20, 15, 2);
  private reflector!: Reflector;
  private environment!: T.WebGLRenderTarget;
  private readonly uniforms = {
    uTime: { value: 0 },
    uBass: { value: 0 },
    uBeat: { value: 0 },
    uSpikes: { value: 0.65 },
    uAudioTexture: { value: null as T.Texture | null },
  };
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
uniform float uTime,uBass,uBeat,uSpikes;uniform sampler2D uAudioTexture;
${simplex}
`,
        )
        .replace(
          "#include <beginnormal_vertex>",
          `// Analytic simplex gradient normals keep displaced spikes smooth and 3x faster.
vec3 n=normalize(position);
vec4 ng=snoiseGrad(n*5.+vec3(0.,uTime*.22,0.));
float u=clamp(n.y*.45+.5,0.,1.);
float spectrum=texture2D(uAudioTexture,vec2(u*u*(.15+.85*u),.25)).r;
float base=max(0.,ng.w*.5+.5);
float base3=base*base*base;
float amp=uSpikes*(.3+uBass*1.6+uBeat*.6);
float disp=base3*base*amp+spectrum*.12;
vec3 dDisp=ng.xyz*(10.*base3*amp);
vec3 surfGrad=dDisp-n*dot(n,dDisp);
vec3 center=n*(1.+disp);
vec3 objectNormal=normalize(center-surfGrad);`,
        )
        .replace("#include <begin_vertex>", "vec3 transformed=center;");
    };
    this.resize(w, h);
  }
  update(a: AudioFrameData, t: number, dt: number) {
    this.uniforms.uTime.value = t;
    this.uniforms.uBass.value = a.bass;
    this.uniforms.uBeat.value = a.beat;
    this.uniforms.uSpikes.value = this.params.spikes;
    this.uniforms.uAudioTexture.value = a.uAudioTexture;
    if (this.material.roughness !== this.params.roughness)
      this.material.roughness = this.params.roughness;
    this.blob.rotation.y += dt * this.params.rotation;
    this.blob.rotation.z = Math.sin(t * 0.2) * 0.12;
    this.blob.position.y = 0.18 + Math.sin(t * 0.7) * 0.05;
    this.cyan.intensity = this.params.light * (1 + a.beat * 0.5);
    this.pink.intensity = this.params.light * 1.25 * (1 + a.bass * 0.4);
    this.pink.position.x = 2 * Math.cos(t * 0.25);
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
