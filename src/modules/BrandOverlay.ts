import * as T from "three";
import type { AudioFrameData } from "../core/types";
import { FullscreenPass } from "../shaders/shared";

/** Transparent artwork composited in HDR, before the master effects and export. */
export class BrandOverlay {
  readonly params = {
    enabled: false,
    scale: 0.6,
    x: 0.5,
    y: 0.5,
    rotation: 0,
    opacity: 1,
    reactivity: 1,
    motion: 1,
    glow: 1,
  };
  readonly text = {
    text: "FEEL THE MUSIC",
    color: "#63f5ff",
    font: "sans-serif",
    bold: true,
  };
  private canvas = document.createElement("canvas");
  private texture: T.CanvasTexture;
  private image: HTMLImageElement | null = null;
  private signature = "";
  private version = 0;
  private disposed = false;
  private pass: FullscreenPass;
  constructor(readonly kind: "logo" | "text") {
    this.canvas.width = 1536;
    this.canvas.height = 768;
    this.texture = new T.CanvasTexture(this.canvas);
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = T.LinearFilter;
    this.pass = new FullscreenPass(
      `precision highp float;
      varying vec2 vUv;
      uniform sampler2D image, artwork;
      uniform vec2 resolution, position;
      uniform float scale, angle, opacity, energy, motion, glow, time;
      vec4 ink(vec2 uv){
        if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec4(0.);
        return texture2D(artwork,uv);
      }
      void main(){
        vec2 p=(vUv-position)*vec2(resolution.x/resolution.y,1.);
        p-=vec2(sin(time*.7),cos(time*.9))*.012*motion;
        float c=cos(angle),s=sin(angle);
        p=mat2(c,-s,s,c)*p/max(.001,scale*(1.+energy*.12));
        vec2 uv=p/vec2(2.,1.)+.5;
        vec4 mark=ink(uv);
        vec3 halo=vec3(0.);
        for(int i=0;i<8;i++){
          float a=float(i)*.785398;
          vec4 tap=ink(uv+vec2(cos(a),sin(a))*.006);
          halo+=tap.rgb*tap.a;
        }
        vec3 base=texture2D(image,vUv).rgb;
        base+=halo*.09*glow*(1.+energy)*opacity;
        gl_FragColor=vec4(mix(base,mark.rgb*(1.+energy*.35),mark.a*opacity),1.);
      }`,
      {
        image: { value: null },
        artwork: { value: this.texture },
        resolution: { value: new T.Vector2(1, 1) },
        position: { value: new T.Vector2() },
        scale: { value: 1 },
        angle: { value: 0 },
        opacity: { value: 1 },
        energy: { value: 0 },
        motion: { value: 0 },
        glow: { value: 0 },
        time: { value: 0 },
      },
    );
  }
  async loadLogo(file: File) {
    const version = ++this.version;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (this.disposed || version !== this.version) return;
      this.image = image;
      this.signature = "";
      this.params.enabled = true;
    } catch {
      throw new Error(
        "Unable to load this logo. Choose a supported image such as PNG, JPEG, WebP, or SVG.",
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  clearLogo() {
    this.version++;
    this.image = null;
    this.params.enabled = false;
    this.signature = "";
  }
  get active() {
    return (
      this.params.enabled &&
      (this.kind === "text" ? !!this.text.text.trim() : !!this.image)
    );
  }
  private draw() {
    const signature =
      this.kind === "text"
        ? JSON.stringify(this.text)
        : (this.image?.src ?? "");
    if (signature === this.signature) return;
    this.signature = signature;
    const c = this.canvas.getContext("2d")!,
      w = this.canvas.width,
      h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    if (this.kind === "logo" && this.image) {
      const ratio = Math.min(
        w / this.image.naturalWidth,
        h / this.image.naturalHeight,
      );
      const iw = this.image.naturalWidth * ratio,
        ih = this.image.naturalHeight * ratio;
      c.drawImage(this.image, (w - iw) / 2, (h - ih) / 2, iw, ih);
    } else if (this.kind === "text") {
      const lines = this.text.text.slice(0, 1000).split(/[|\n]/).slice(0, 8);
      const size = Math.min(220, (h * 0.8) / (lines.length * 1.3));
      c.font = `${this.text.bold ? 800 : 400} ${size}px ${this.text.font}`;
      c.fillStyle = this.text.color;
      c.textAlign = "center";
      c.textBaseline = "middle";
      lines.forEach((line, i) =>
        c.fillText(
          line,
          w / 2,
          h / 2 + (i - (lines.length - 1) / 2) * size * 1.3,
          w * 0.92,
        ),
      );
    }
    this.texture.needsUpdate = true;
  }
  render(
    renderer: T.WebGLRenderer,
    output: T.WebGLRenderTarget,
    input: T.WebGLRenderTarget,
    audio: AudioFrameData,
    time: number,
  ) {
    this.draw();
    const u = this.pass.material.uniforms,
      p = this.params;
    u.image.value = input.texture;
    u.resolution.value.set(output.width, output.height);
    u.position.value.set(p.x, 1 - p.y);
    u.scale.value = p.scale;
    u.angle.value = (p.rotation * Math.PI) / 180;
    u.opacity.value = p.opacity;
    u.energy.value = (audio.rms + audio.bass * 0.5) * p.reactivity;
    u.motion.value = p.motion;
    u.glow.value = p.glow;
    u.time.value = audio.songTime ?? time;
    this.pass.render(renderer, output);
  }
  dispose() {
    this.disposed = true;
    this.clearLogo();
    this.texture.dispose();
    this.pass.dispose();
  }
}
