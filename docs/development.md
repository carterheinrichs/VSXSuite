# Development

[Documentation home](README.md)

## Commands

```sh
npm run typecheck
npm run build
npx playwright install chromium
npm test
npm run test:audio
```

Deploy `dist/` to a static host after building. `npm test` runs browser checks; `npm run test:audio` runs Node audio checks.

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


## Adding visualizers

Implement `IVisualModule`, then register a retained instance in `VisualizerHost.modules`. Use `update` to mutate pre-existing uniforms. Render into `writeBuffer`; sample only `readBuffer` or a separate internal target, never the target currently being written. Put user controls in `params`; primitive parameters are added automatically to their rack folder. Add range metadata in the rack for specialized controls. The MVP supports one base scene, an additive neon overlay, and a final FX pass; extend the host's explicit ordering for additional layer types.
