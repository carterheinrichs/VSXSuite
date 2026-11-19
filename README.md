# VSXSuite

VSXSuite is a local-first music visualizer with 35 audio-reactive scenes, text and logo overlays, and full-song video export. It runs in your browser; audio stays on your device.

## Run

Install a current Node.js LTS release and npm, then run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Press **Play** for the built-in beat, choose a catalog track, or open or drag in an audio file. Pick a visualizer from the library and adjust its controls in the rack.

To build and preview the production app:

```sh
npm run build
npm run preview
```

Requires WebGL2 and floating-point render targets. Microphone and system audio capture require HTTPS or localhost.

[Documentation](docs/README.md) · [Visualizer guides](docs/visualizers/README.md)
