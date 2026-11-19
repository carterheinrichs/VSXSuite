# Using VSXSuite

[Documentation home](README.md)

## Playback

Open the local Vite URL and press **Play** to start the synth, open an audio file, or drag one onto the window. The bottom transport provides play/pause, elapsed time, duration, and a seek slider for files and the synth loop. Pause preserves the audio clock and resumes from the same position. Live microphone/system inputs display **LIVE** and cannot seek. The header provides fullscreen and a hide-controls view. Space toggles playback when no interactive control has focus. Search or filter the visualizer library and select a scene card. Expand its rack folder to adjust scene options. The library, catalog, and rack can each be minimized.


Choose a catalog track or expand **AUDIO SOURCE** for **Procedural beat**, **Microphone**, **Share system / tab audio**, and **Stop audio**. Files loop. Capture requires HTTPS or localhost and browser permission. Enable audio sharing in the picker; support depends on browser, OS, and source. Capture video is not displayed or transmitted; live monitoring is muted to avoid feedback. Codec support depends on the browser.

## Shared controls

| Option | What it does |
| --- | --- |
| Neon overlay | Adds neon feedback over the scene. |
| Master FX | Enables Master polish. |
| Adaptive quality | Adjusts preview resolution for smoother playback. |
| Render scale | Sets preview scale; disable adaptive quality for manual control. Export resolution is separate. |
| Clear feedback | Clears retained feedback and resets scene state. |

## Master polish

| Option | What it does |
| --- | --- |
| bloom | Glow around bright areas; zero skips blur passes. |
| threshold | Brightness cutoff for bloom; higher values restrict glow. |
| chromatic | Edge color separation, accentuated on beats. |
| scanlines | Horizontal scanline shading. |
| exposure | Brightness before tone mapping. |

## Overlays


In **VISUAL ENGINE**, expand **Logo overlay** to upload an image (transparent PNG, WebP, and SVG logos are supported), or **Text overlay** to enter your own text (`|` starts a new line). Enable **Show overlay** for text; uploading a logo enables it automatically. Both overlays work with every scene and have independent scale, horizontal/vertical position, rotation, opacity, music response, float, and glow controls. Text also has font, weight, and color controls. Overlays pass through master FX and are included in video exports. Uploaded artwork stays in the current browser session; use **Remove logo** to clear it.


| Option | What it does |
| --- | --- |
| Show overlay | Toggles this overlay independently. |
| Text / Text color | Content and color (text only). |
| font / bold | Modern, Editorial, or Terminal typography and heavier weight (text only). |
| scale | Size. |
| Horizontal / Vertical position | Location using normalized coordinates from 0 to 1. |
| rotation | Angle in degrees. |
| opacity | Transparency: 0 invisible, 1 opaque. |
| Music response | Audio modulation; zero removes it. |
| Float | Continuous drifting motion. |
| glow | Halo around artwork or text. |
