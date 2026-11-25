# VSXSuite

VSXSuite is a local-first music visualizer with 35 audio-reactive scenes, text and logo overlays, and full-song video export. It runs in your browser; audio stays on your device.

## Run

Install a current Node.js LTS release and npm, then run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Press **Play** for the built-in beat, choose a catalog track, or open or drag in an audio file. Pick a visualizer from the library and adjust its controls in the rack.

**Music library** opens a separate in-app view where you can choose a local folder, including subfolders. Audio filenames appear without extensions, with duration when the browser can read it and file type/size on hover. Use **+** to queue songs. Playback and the queue continue when switching between the music library and visualizer. The library is saved locally in browser storage and restored after reloading. Supported browsers can reconnect a chosen folder and scan for added or removed files on each page load. If folder permission needs renewing, use **Refresh folder**. On phones or browsers without folder access, use **Choose audio files** to save copies; select files again to import new music. Clearing browser site data removes the saved library. The queue lasts for the current tab session.

To build and preview the production app:

```sh
npm run build
npm run preview
```

Requires WebGL2 and floating-point render targets. Microphone and system audio capture require HTTPS or localhost.

[Documentation](docs/README.md) · [Visualizer guides](docs/visualizers/README.md)
