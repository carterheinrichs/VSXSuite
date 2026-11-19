# Performance and limits

[Documentation home](README.md)


The default maximum scale is 1.0 of CSS dimensions, without a device-pixel-ratio multiplier. Adaptive quality starts with a 1280×720 pixel budget, or 640×360 when the graphics driver identifies software rendering. Sustained slow frames reduce resolution toward a 60 FPS target; sustained headroom gradually restores it. Adaptation stops at 65% of the starting scale on hardware GPUs (55% on software renderers) to preserve visual detail. The pixel budgets remain unchanged. Resolution changes resize the retained targets rather than allocating resources every frame. Disable adaptive quality to hold a manual render scale (capped at a 1920×1080 pixel budget). The footer shows measured FPS and actual render dimensions; hover the dimensions for software-renderer diagnostics. Browser graphics acceleration is strongly recommended for high-quality rendering. UI panels avoid costly backdrop blurs over the animated canvas.

The raymarcher is bounded to 112 steps; the ferrofluid uses a retained high-resolution mesh, procedural PMREM environment and half-resolution planar reflection capped at 512 pixels per axis, with reflection MSAA disabled. Fog is exponential scene fog, providing atmospheric depth rather than physical volumetric scattering. Bloom is an efficient separable approximation and its blur passes are skipped when bloom is zero. Beat detection uses adaptive energy heuristics; tempo and beat-phase estimates also drive synchronized scenes such as Human Heart. Visual quality and FPS vary with GPU and screen size; no hardware frame-rate guarantee is implied.

Fullscreen passes use one oversized triangle and skip automatic clears because they overwrite every pixel. Scene rendering retains its normal color/depth clearing. Ferrofluid reuses its center displacement for vertex position and normals. These optimizations retain render budgets, mesh detail, audio analysis and effect settings. Fused overlay processing avoids an intermediate half-float rounding step; regression coverage allows at most one 8-bit channel level of difference on the tested HDR patterns and verifies one fewer draw per frame with overlay plus FX.

Tests check shader/runtime errors, synth activation, scene selection, resizing, pause/resume and seeking for synth and local WAV files, HiDPI pixel budgets/adaptation, and FFT/history buffer stability plus metric/beat behavior. Physical microphone/system capture and codec-specific playback still need manual device testing.

Simplex shader noise derives from Ashima Arts / Stefan Gustavson (MIT; see `THIRD_PARTY_NOTICES.md`).
