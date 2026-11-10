import * as T from "three";
import type { AudioFrameData, IVisualModule } from "../core/types";
import { common, FullscreenPass } from "../shaders/shared";
import { ShaderModule } from "./ShaderModule";
import { compileExpression, type Expression } from "../math/expression";

const fragment =
  common +
  `
uniform sampler2D uDrawing;
uniform vec3 uBackground;
uniform float uEffect,uMotion,uGlow,uReaction,uHue;
void main(){
 vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
 float energy=uRms+uBass*.5;
 vec3 col=uBackground;
 if(uEffect>.5 && uEffect<1.5){
  float waveY=.15*sin(p.x*5.+uTime*.6)+.06*sin(p.x*11.-uTime);
  float ribbon=exp(-abs(p.y-waveY)*12.);
  col+=palette(p.x*.2+uHue+uTime*.03)*ribbon*(.12+energy*uReaction*.4);
 } else if(uEffect>1.5){
  float rings=pow(.5+.5*cos(length(p)*32.-uTime*2.-energy*uReaction),12.);
  col+=palette(length(p)*.3+uHue)*rings*.12;
 }
 vec2 uv=vUv;
 uv-=vec2(sin(uTime*.7),cos(uTime*.9))*.012*uMotion;
 uv=(uv-.5)/(1.+uMotion*uReaction*uBass*.12)+.5;
 vec4 ink=texture2D(uDrawing,uv);
 vec3 halo=vec3(0.);
 for(int i=0;i<8;i++){
  float a=float(i)*PI/4.;
  vec2 offset=vec2(cos(a),sin(a))*5./uResolution;
  vec4 tap=texture2D(uDrawing,uv+offset);
  halo+=tap.rgb*tap.a;
 }
 col+=halo*.09*uGlow*(1.+energy*uReaction);
 col=mix(col,ink.rgb*(1.+energy*uReaction*.35),ink.a);
 gl_FragColor=vec4(col,1.);
}`;

abstract class DrawingModule extends ShaderModule {
  controls: NonNullable<IVisualModule["controls"]> = {};
  protected canvas = document.createElement("canvas");
  protected context = this.canvas.getContext("2d")!;
  private texture = new T.CanvasTexture(this.canvas);
  protected dirty = true;
  init(_renderer: T.WebGLRenderer, width: number, height: number) {
    Object.assign(this.uniforms, {
      uDrawing: { value: this.texture },
      uBackground: { value: new T.Color() },
      uEffect: { value: 0 },
      uMotion: { value: 0 },
      uGlow: { value: 0 },
      uReaction: { value: 0 },
      uHue: { value: 0 },
    });
    this.pass = new FullscreenPass(fragment, this.uniforms);
    this.resize(width, height);
  }
  resize(w: number, h: number) {
    super.resize(w, h);
    // Keep text sharp without uploading unbounded textures during 4K exports.
    const scale = Math.min(1, 1536 / Math.max(w, h));
    this.canvas.width = Math.max(1, Math.round(w * scale));
    this.canvas.height = Math.max(1, Math.round(h * scale));
    // Canvas textures need fresh GPU storage when their dimensions change.
    this.texture.dispose();
    this.texture = new T.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = false;
    this.texture.minFilter = T.LinearFilter;
    (this.uniforms as Record<string, T.IUniform>).uDrawing.value = this.texture;
    this.dirty = true;
  }
  protected abstract draw(audio: AudioFrameData, time: number): boolean;
  update(audio: AudioFrameData, time: number, dt: number) {
    super.update(audio, time, dt);
    const u = this.uniforms as Record<string, T.IUniform>;
    u.uBackground.value.set(this.params.background);
    u.uEffect.value = this.params.backgroundEffect;
    u.uMotion.value = this.params.motion ?? 0;
    u.uGlow.value = this.params.glow;
    u.uReaction.value = this.params.reactivity;
    u.uHue.value = this.params.hue ?? 0;
    if (this.draw(audio, time)) this.texture.needsUpdate = true;
    this.dirty = false;
  }
  dispose() {
    this.texture.dispose();
    super.dispose();
  }
}

const backgroundControls = {
  background: { label: "Background color" },
  backgroundEffect: {
    label: "Background effect",
    options: { Solid: 0, Waves: 1, Rings: 2 },
  },
  glow: { min: 0, max: 3, step: 0.01 },
  reactivity: { label: "Music response", min: 0, max: 3, step: 0.01 },
};

export class TextStageModule extends DrawingModule {
  readonly id = "text-stage";
  readonly name = "Text Stage";
  params = {
    text: "FEEL THE MUSIC",
    font: "sans-serif",
    color: "#63f5ff",
    background: "#070b18",
    backgroundEffect: 1,
    size: 0.65,
    tracking: 0.02,
    bold: true,
    motion: 1,
    glow: 1.2,
    reactivity: 1,
  };
  controls = {
    ...backgroundControls,
    text: { label: "Your text (| for new line)" },
    font: {
      options: {
        Modern: "sans-serif",
        Editorial: "serif",
        Terminal: "monospace",
      },
    },
    color: { label: "Text color" },
    size: { min: 0.1, max: 1, step: 0.01 },
    tracking: { label: "Letter spacing", min: 0, max: 0.15, step: 0.005 },
    motion: { label: "Float & pulse", min: 0, max: 3, step: 0.01 },
  };
  private signature = "";
  protected draw() {
    const signature = JSON.stringify(this.params);
    if (!this.dirty && signature === this.signature) return false;
    this.signature = signature;
    const c = this.context,
      w = this.canvas.width,
      h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    const lines = this.params.text.slice(0, 1000).split(/[|\n]/).slice(0, 8);
    const fontSize =
      Math.min(h * 0.22, w * 0.16, (h * 0.7) / (lines.length * 1.3)) *
      this.params.size;
    c.font = `${this.params.bold ? 800 : 400} ${fontSize}px ${this.params.font}`;
    c.fillStyle = this.params.color;
    c.textAlign = "left";
    c.textBaseline = "middle";
    const spacing = this.params.tracking * fontSize;
    lines.forEach((line, i) => {
      const letters = Array.from(line);
      const widths = letters.map((letter) => c.measureText(letter).width);
      const width =
        widths.reduce((a, b) => a + b, 0) +
        Math.max(0, letters.length - 1) * spacing;
      c.save();
      c.translate(w / 2, h / 2 + (i - (lines.length - 1) / 2) * fontSize * 1.3);
      c.scale(Math.min(1, (w * 0.82) / Math.max(1, width)), 1);
      let x = -width / 2;
      letters.forEach((letter, j) => {
        c.fillText(letter, x, 0);
        x += widths[j] + spacing;
      });
      c.restore();
    });
    return true;
  }
}

export class FunctionStageModule extends DrawingModule {
  readonly id = "function-stage";
  readonly name = "Function Stage";
  params = {
    function1: "sin(x + t) * (1 + bass)",
    function2: "cos(2x - t) * (1 + treble)",
    secondFunction: true,
    color1: "#63f5ff",
    color2: "#ff70b8",
    xRange: 8,
    centerX: 0,
    centerY: 0,
    lineWidth: 2,
    grid: true,
    speed: 1,
    reactivity: 1,
    glow: 0.7,
    background: "#070b18",
    backgroundEffect: 0,
    status: "",
  };
  controls = {
    ...backgroundControls,
    function1: { label: "y₁ =" },
    function2: { label: "y₂ =" },
    secondFunction: { label: "Show y₂" },
    color1: { label: "Curve 1 color" },
    color2: { label: "Curve 2 color" },
    xRange: { label: "Horizontal half-range", min: 1, max: 30, step: 0.1 },
    centerX: { label: "Center x", min: -30, max: 30, step: 0.1 },
    centerY: { label: "Center y", min: -30, max: 30, step: 0.1 },
    lineWidth: { label: "Line width", min: 1, max: 6, step: 0.1 },
    speed: { label: "Time speed", min: 0, max: 3, step: 0.01 },
    status: {
      label: "Equation status",
      readonly: true as const,
      interval: 250,
    },
  };
  private sources = ["", ""];
  private expressions: (Expression | undefined)[] = [];
  private errors = ["", ""];
  protected draw(audio: AudioFrameData, time: number) {
    [this.params.function1, this.params.function2].forEach((source, i) => {
      if (source === this.sources[i]) return;
      this.sources[i] = source;
      try {
        this.expressions[i] = compileExpression(source);
        this.errors[i] = "";
      } catch (error) {
        this.expressions[i] = undefined;
        this.errors[i] = `y${i + 1}: ${(error as Error).message}`;
      }
    });
    this.params.status =
      this.errors
        .slice(0, this.params.secondFunction ? 2 : 1)
        .filter(Boolean)
        .join(" ") || "Valid · x, t, bass, mid, treble, beat, rms";
    const c = this.context,
      w = this.canvas.width,
      h = this.canvas.height;
    const scale = w / (2 * this.params.xRange);
    const px = (x: number) => w / 2 + (x - this.params.centerX) * scale;
    const py = (y: number) => h / 2 - (y - this.params.centerY) * scale;
    c.clearRect(0, 0, w, h);
    if (this.params.grid) {
      const rough = 75 / scale,
        power = 10 ** Math.floor(Math.log10(rough));
      const step = [1, 2, 5, 10].map((n) => n * power).find((n) => n >= rough)!;
      c.font = `${Math.max(10, h * 0.018)}px monospace`;
      c.lineWidth = 1;
      for (const axis of [0, 1]) {
        const center = axis === 0 ? this.params.centerX : this.params.centerY;
        const range = (axis === 0 ? w : h) / (2 * scale);
        for (
          let n = Math.ceil((center - range) / step);
          n <= Math.floor((center + range) / step);
          n++
        ) {
          const value = n * step,
            pos = axis === 0 ? px(value) : py(value);
          c.strokeStyle = n === 0 ? "#61708b" : "#202c42";
          c.beginPath();
          if (axis === 0) {
            c.moveTo(pos, 0);
            c.lineTo(pos, h);
          } else {
            c.moveTo(0, pos);
            c.lineTo(w, pos);
          }
          c.stroke();
          c.fillStyle = "#8191ae";
          c.fillText(
            String(Number(value.toPrecision(5))),
            axis === 0 ? pos + 4 : 6,
            axis === 0 ? h - 10 : pos - 4,
          );
        }
      }
    }
    const v = {
      x: 0,
      t: time * this.params.speed,
      bass: audio.bass * this.params.reactivity,
      mid: audio.mid * this.params.reactivity,
      treble: audio.treble * this.params.reactivity,
      beat: audio.beat * this.params.reactivity,
      rms: audio.rms * this.params.reactivity,
    };
    this.expressions.forEach((expression, i) => {
      if (!expression || (i === 1 && !this.params.secondFunction)) return;
      c.strokeStyle = i === 0 ? this.params.color1 : this.params.color2;
      c.lineWidth = this.params.lineWidth;
      c.lineJoin = "round";
      c.beginPath();
      let previousY = NaN;
      for (let x = 0; x <= w; x++) {
        v.x = this.params.centerX + (x - w / 2) / scale;
        const y = py(expression(v));
        // Break paths across poles and invalid domains instead of bridging asymptotes.
        if (!Number.isFinite(y) || y < -h || y > 2 * h) {
          previousY = NaN;
          continue;
        }
        if (!Number.isFinite(previousY) || Math.abs(y - previousY) > h / 2)
          c.moveTo(x, y);
        else c.lineTo(x, y);
        previousY = y;
      }
      c.stroke();
    });
    return true;
  }
}
