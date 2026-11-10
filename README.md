# VSXSuite

A local-first modular music visualizer built with strict TypeScript, Vite, Three.js/WebGL2, native Web Audio and Tweakpane. No audio leaves the browser. Assets and fonts require no external service.

<img width="1853" height="1038" alt="image" src="https://github.com/user-attachments/assets/48bcd723-4417-4ba3-bf52-c6aad04153d5" />

## Run

```sh
npm install
npm run dev
```

Open the local Vite URL and press **Play** to start the synth, open an audio file, or drag one onto the window. The bottom transport provides play/pause, elapsed time, duration, and a seek slider for files and the synth loop. Pause preserves the audio clock and resumes from the same position. Live microphone/system inputs display **LIVE** and cannot seek. The header provides fullscreen and a hide-controls view. Space toggles playback when no interactive control has focus. The chrome stays dark across scenes. The rack contains the only scene selector, source selection, a neon overlay, adaptive quality, render scale, and per-module controls.

```sh
npm run build       # strict type checking + production bundle
npm test            # Chromium integration and DSP checks
npm run preview     # serve the production bundle locally
```

Install the test browser once with `npx playwright install chromium`. Deploy `dist/` to any static host. HTTPS or localhost is required for microphone/display capture. Browser audio starts after a user gesture. System capture support depends on the browser/OS and the selected source; enable “share audio” in the picker. The capture video track is required by display-capture APIs and is never rendered or transmitted. File codec support follows the browser's decoder.

## Video export

Open an audio file, choose an export resolution and frame rate in the header, and select **Export video**. The default is **1440p at 30 FPS**; 1080p, 4K and 60 FPS are also available. The download contains only the visualization and the full song, encoded as WebM (VP9 when available, otherwise VP8, with Opus audio). Current Chrome or Edge over HTTPS/localhost is recommended; export checks encoder support and reports unsupported settings.

Export renders every frame at the chosen native resolution, independent of the preview window, render scale, adaptive quality and real-time FPS. Explicit timestamps keep the song and animation aligned even when rendering takes longer than the song. File audio is analyzed at those timestamps, and the soundtrack is encoded from the decoded audio buffer. Playback is suspended during export and restored afterward. Cancel discards the partial video. Progress reflects rendered song time, not elapsed wall time. Hidden tabs may run more slowly but do not lose frames.

Video bitrate targets at 30 FPS are 20 Mbps for 1080p, 32 Mbps for 1440p and 60 Mbps for 4K, doubled at 60 FPS; audio targets 320 kbps. The encoder uses variable bitrate, so actual sizes vary. Encoded output is assembled in browser memory; long songs at 4K/60 can require substantial memory. These are SDR exports after the visualizer's HDR-to-display tone mapping. YouTube performs its own processing; wait for the desired HD resolution to finish processing before judging upload quality.

## Architecture

- `src/audio/AudioEngine.ts`: source lifecycle, pre-rendered eight-second procedural beat, 1024-point FFT, six smoothed frequency bands, normalized RMS/centroid and adaptive low-frequency beat gate. Microphone/capture output is muted to avoid acoustic feedback. Local files loop.
- `src/audio/FileAudioAnalysis.ts`: retained FFT and waveform sampling of decoded song audio at deterministic export timestamps.
- `src/core/VideoExporter.ts`: fixed-resolution, frame-by-frame encoding with Mediabunny/WebCodecs, direct audio encoding, explicit timestamps, progress, cancellation and playback restoration.
- `src/core/types.ts`: `AudioFrameData` and the `IVisualModule` contract.
- `src/core/VisualizerHost.ts`: WebGL2 capability checks, two half-float HDR scene targets, explicit scene → optional neon overlay → optional master FX → display pipeline. Neon feeds its internal HDR buffer directly into post FX; overlay compositing is folded into bloom extraction and the final display pass when FX are enabled. Without FX, the separate overlay path is retained. Resize, adaptive resolution, visibility suspension, context-loss handling and disposal are centralized.
- `src/modules/`: neon vortex with private feedback targets, folded gyroid sphere tracing, simplex-displaced physical ferrofluid with finite-difference normals and a planar reflector, plus quarter-resolution separable bloom/aberration/scanlines. Tone mapping occurs after HDR compositing.
- `src/shaders/`: shared fullscreen utilities and simplex noise.
- `src/ui/ViszSuiteUI.ts`: automatic parameter bindings, audio sources, presets, error feedback and throttled meters.

The current audio texture is 512×2 R8: FFT at row 0, waveform at row 1 (silence = 128). The 512×128 R8 history shifts in place and puts the newest FFT at row 0. Textures use linear filtering, clamp addressing and no mipmaps. Modules receive both textures through the same reused frame object.

Application-owned frame code creates no arrays, vectors, objects, typed-array views or callbacks per frame. Audio buffers, render targets and uniforms are retained. The small DOM meter updates four times per second; Three.js and Tweakpane manage their own internals (Tweakpane uses DOM). Resource initialization, source changes and resizing may allocate. This is not a guarantee that browser or library internals perform zero allocations.

## Extending

**Human Heart** is a procedural anatomical cutaway with asymmetric chambers, an aortic arch, coronary vessels and two visible atrioventricular valves. Scalloped valve leaflets open during filling and close during contraction, with fine supporting chordae inside the chambers. Dark red surroundings, mottled muscle and warm wet highlights give it an organic appearance. The detected song BPM and beat position set the heartbeat cycle; bass and beats strengthen contractions. A resting cycle continues in silence or when no reliable tempo is detected. Tempo analysis is cached per song and stays aligned when seeking or exporting; microphone and system audio estimate tempo from incoming kicks. Disable cutaway for the exterior view. Speed, intensity, hue, reactivity, vessels and turn are adjustable. Reactivity at zero removes audio modulation. This is an anatomical visualization rather than a medical simulation. It supports the shared HDR, overlay, post-processing and deterministic export pipeline.

**Hubble Nebula** is a procedural scene inspired by Hubble telescope imagery, with gold and cyan emission clouds, dark dust pillars, layered stars and diffraction spikes. Bass expands and bends the clouds, mids shift the gas toward cyan, and beats send expanding illumination fronts across the dust. Individual spectrum bands light cloud filaments and stars, while treble strengthens their diffraction spikes. Speed, intensity, hue, dust, stars, drift and reactivity are adjustable in the control rack; reactivity at zero disables the audio response. It remains visible without audio and uses the shared HDR, post-processing and deterministic video export pipeline. No telescope photographs or external assets are required.

Five additional shader scenes adapt the psychedelic ring engine: **Psychedelic Bloom** folds nested petal rings into a breathing kaleidoscope; **Acid Chrome** shades flowing ripples with metallic highlights and iridescent reflections; **Pulse Reactor** surrounds a bass-reactive core with waveform containment rings and kick-triggered shockwaves; **Prismatic Tunnel** projects continuous twisting, eight-sided spectral walls into depth; **Topographic Contours** carves domain-warped simplex terrain into shifting hypsometric elevation bands and anti-aliased minor and major index isolines. Each has speed, intensity, hue and warp controls, with symmetry for Bloom, twist for the tunnel, and contour density and relief shading for Topographic Contours. They use the shared HDR, neon overlay, master FX and video export pipeline.

Implement `IVisualModule`, then register a retained instance in `VisualizerHost.modules`. Use `update` to mutate pre-existing uniforms. Render into `writeBuffer`; sample only `readBuffer` or a separate internal target, never the target currently being written. Put user controls in `params`; primitive parameters are added automatically to their rack folder. Add range metadata in the rack for specialized controls. The MVP supports one base scene, an additive neon overlay, and a final FX pass; extend the host's explicit ordering for additional layer types.

## Performance and limits

The default maximum scale is 1.0 of CSS dimensions, without a device-pixel-ratio multiplier. Adaptive quality starts with a 1280×720 pixel budget, or 640×360 when the graphics driver identifies software rendering. Sustained slow frames reduce resolution toward a 60 FPS target; sustained headroom gradually restores it. Adaptation stops at 65% of the starting scale on hardware GPUs (55% on software renderers) to preserve visual detail. The pixel budgets remain unchanged. Resolution changes resize the retained targets rather than allocating resources every frame. Disable adaptive quality to hold a manual render scale (capped at a 1920×1080 pixel budget). The footer shows measured FPS and actual render dimensions; hover the dimensions for software-renderer diagnostics. Browser graphics acceleration is strongly recommended for high-quality rendering. UI panels avoid costly backdrop blurs over the animated canvas.

The raymarcher is bounded to 112 steps; the ferrofluid uses a retained high-resolution mesh, procedural PMREM environment and half-resolution planar reflection capped at 512 pixels per axis, with reflection MSAA disabled. Fog is exponential scene fog, providing atmospheric depth rather than physical volumetric scattering. Bloom is an efficient separable approximation and its blur passes are skipped when bloom is zero. Beat detection is an adaptive energy heuristic, not tempo tracking. Visual quality and FPS vary with GPU and screen size; no hardware frame-rate guarantee is implied.

Fullscreen passes use one oversized triangle and skip automatic clears because they overwrite every pixel. Scene rendering retains its normal color/depth clearing. Ferrofluid reuses its center displacement for vertex position and normals. These optimizations retain render budgets, mesh detail, audio analysis and effect settings. Fused overlay processing avoids an intermediate half-float rounding step; regression coverage allows at most one 8-bit channel level of difference on the tested HDR patterns and verifies one fewer draw per frame with overlay plus FX.

Tests check shader/runtime errors, synth activation, scene selection, resizing, pause/resume and seeking for synth and local WAV files, HiDPI pixel budgets/adaptation, and FFT/history buffer stability plus metric/beat behavior. Physical microphone/system capture and codec-specific playback still need manual device testing.

Simplex shader noise derives from Ashima Arts / Stefan Gustavson (MIT; see `THIRD_PARTY_NOTICES.md`).

Aurora ribbons layers flowing spectral curtains; Prismatic drift flies through twisting prismatic hoops; Xenon blades frames a segmented ring of light inside sweeping concave arcs; Vector lattice warps dual perspective neon grids and horizon laser beacons; Solar mandala folds orbiting Lissajous plasma nodes and spectral history waves; Hypernova vortex tears logarithmic plasma spiral arms into a beat-driven singularity; Nexus spectrum drives a 48-band radial analyzer with peak-hold caps and an inner oscilloscope turbine; Tesla plasma web arcs branching waveform lightning across high-voltage electrodes; Laser cathedral sweeps volumetric concert laser fans across a chromatic polygonal prism; Apex triangles hurtles through counter-rotating equilateral delta frames over a reactive isometric shard tessellation and fracturing triforce core. These original, audio-reactive scenes draw on the colorful console music visualizers of the Xbox 360 era and offer speed, intensity and hue controls alongside scene-specific spread, twist, warp or symmetry parameters.

Evolving Atmosphere blends slowly shifting plasma, spectral ribbons, elliptical tunnel rings and petal folds with seeded orbital particles. Kicks launch expanding shockwaves and push particles outward; treble stretches their trails. Speed, intensity, hue, warp, evolution and particle strength are adjustable. Enable ambient for motion during silence. Timestamp-based variation and rewind resets make repeated offline exports reproducible.

Recursive Chrome travels through a corridor of polygonal rainbow metal frames and interlocking beveled gear teeth, inspired by the dense glossy repetition in the supplied visual reference. Bass contracts the corridor, individual FFT bands extend its gear teeth, and kicks snap their tilt and accelerate travel. A flowing spectral backdrop fills the gaps. Speed, intensity, hue, warp and symmetry are adjustable. It uses the shared HDR, overlay and export pipeline with a bounded 112-step raymarcher.

**Hubble Ring ON ACID** interprets [Hubble's Ring Nebula (M57) image](https://esahubble.org/images/heic1310a/) as an oval gas shell with a blue interior, rainbow filaments, liquid distortion and outer shell echoes. Bass breathes and distorts the ring, spectrum bands illuminate filaments, detected beats immediately expand, twist and accent the rim even with warp at zero, and treble strengthens star spikes. Ripples start at the shell on each hit; texture travel stays steady instead of reversing with the decaying beat envelope. Fast spectral attacks bypass the kick gate: bass pushes the shell, midrange attacks warp and light the filaments, and high-frequency attacks brighten filaments and star spikes. Angular colours blend continuously around the ring. Speed, intensity, hue, warp, stars and reactivity are adjustable. Reactivity at zero removes audio modulation. Procedural and offline; supports HDR, overlays, FX and deterministic export.

Three more classics are available in the Classic library: **Sine + cosine waves** layers two or three colored harmonic traces with frequency, amplitude, speed, separation and thickness controls; **Classic radial spectrum** arranges adjustable frequency bands around a ring with radius, bar length, rotation and mirroring controls; **Retro plasma** brings flowing demoscene color fields with scale, speed, color cycles, distortion and optional scanlines. All three also support intensity, audio gain, hue, master FX, neon overlay and video export.

## Text and function visualizers

Choose **Text Stage** in the library, then expand its control rack folder. Edit the text (`|` starts a new line), font, weight, letter spacing, size, and color. Solid, wave, and ring backgrounds have their own color; glow, float/pulse motion, and music response are adjustable. Text is limited to 1,000 characters and eight lines.

**Function Stage** plots one or two equations as `y = f(x)`. Toggle the second curve, set independent colors, adjust the horizontal half-range and center coordinates, and show or hide the labeled grid. Both axes use the same unit scale. For example, use `sin(x + t) * (1 + bass)` and `cos(2x - t) * (1 + treble)` for moving, music-reactive curves.

Expressions support `+ - * / ^`, parentheses, implicit multiplication (`2x`), constants `pi` and `e`, and `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `abs`, `sqrt`, `exp`, `log` (base 10), `ln`, `floor`, and `ceil`. Variables are `x`, `t` (song time multiplied by Time speed), `bass`, `mid`, `treble`, `beat`, and `rms`. Music response scales the audio variables; zero disables audio modulation. Invalid equations show a message and leave the other curve running. Expressions are limited to 256 characters and 128 tokens and never execute JavaScript.

Both scenes use the shared overlay, master FX, and export pipeline. Their canvas drawings are uploaded as textures capped at 1,536 pixels on the longest edge. Function Stage redraws its sampled curves each frame; these canvas-based scenes are exceptions to the shader scenes' allocation-free frame path. Curve sampling breaks at detected discontinuities, but extremely rapid oscillations may need a smaller horizontal range for accurate detail.
