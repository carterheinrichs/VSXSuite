# Video export

[Documentation home](README.md)


Open an audio file, choose an export resolution and frame rate in the export dialog, and select **Export video**. The default is **1440p at 30 FPS**; 1080p, 4K and 60 FPS are also available. The download contains only the visualization and the full song, encoded as WebM (VP9 when available, otherwise VP8, with Opus audio). Current Chrome or Edge over HTTPS/localhost is recommended; export checks encoder support and reports unsupported settings.

Export renders every frame at the chosen native resolution, independent of the preview window, render scale, adaptive quality and real-time FPS. Explicit timestamps keep the song and animation aligned even when rendering takes longer than the song. File audio is analyzed at those timestamps, and the soundtrack is encoded from the decoded audio buffer. Playback is suspended during export and restored afterward. Cancel discards the partial video. Progress reflects rendered song time, not elapsed wall time. Hidden tabs may run more slowly but do not lose frames.

Video bitrate targets at 30 FPS are 20 Mbps for 1080p, 32 Mbps for 1440p and 60 Mbps for 4K, doubled at 60 FPS; audio targets 320 kbps. The encoder uses variable bitrate, so actual sizes vary. Encoded output is stored in bounded Blob chunks rather than a single video-sized ArrayBuffer, allowing large 4K/60 exports without exceeding the browser buffer limit. Long exports still require sufficient browser storage and memory. These are SDR exports after the visualizer's HDR-to-display tone mapping. YouTube performs its own processing; wait for the desired HD resolution to finish processing before judging upload quality.

## Orientation and download

Enable **Portrait** to swap output width and height. Select **Download video** when rendering finishes. Export requires an opened audio file; live inputs and the procedural beat cannot be exported.

