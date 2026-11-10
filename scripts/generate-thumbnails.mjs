// Run with the Vite dev server available at THUMBNAIL_URL (default localhost:5173).
// Images use the actual default scene shaders and post-processing with a fixed
// representative audio signal so regenerated thumbnails remain reproducible.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.route("**/src/main.ts", (route) => route.abort());
  await page.goto(process.env.THUMBNAIL_URL || "http://127.0.0.1:5173");
  const ids = await page.evaluate(async () => {
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const { VisualizerHost } = await import("/src/core/VisualizerHost.ts");
    const audio = new AudioEngine();
    const canvas = document.createElement("canvas");
    const host = new VisualizerHost(canvas, audio);
    host.beginOfflineExport(320, 180);
    window.thumbnailScene = { host, audio, canvas };
    return host.modules.map((module) => module.id);
  });
  await mkdir("public/thumbnails", { recursive: true });
  for (const id of ids.filter(
    (id) => !process.env.THUMBNAIL_SCENE || id === process.env.THUMBNAIL_SCENE,
  )) {
    const data = await page.evaluate(async (id) => {
      const { host, audio, canvas } = window.thumbnailScene;
      await host.select(id);
      for (let frame = 0; frame < 90; frame++) {
        const time = frame / 30;
        const pulse = Math.exp(-((time * 2) % 1) * 5);
        for (let bin = 0; bin < 512; bin++) {
          audio.bytes[bin] = Math.round(
            160 *
              Math.exp(-bin / 170) *
              (0.55 + 0.45 * Math.sin(bin * 0.09 + time * 3) ** 2) *
              (0.6 + pulse * 0.4),
          );
          audio.bytes[512 + bin] = Math.round(
            128 +
              75 * Math.sin(bin * 0.05 + time * 3) +
              20 * Math.sin(bin * 0.13),
          );
        }
        audio.history.copyWithin(512, 0, 512 * 127);
        audio.history.set(audio.bytes.subarray(0, 512));
        audio.texture.needsUpdate = true;
        audio.historyTexture.needsUpdate = true;
        Object.assign(audio.frame, {
          subBass: 0.55,
          bass: 0.5 + pulse * 0.3,
          lowMid: 0.45,
          mid: 0.5,
          highMid: 0.35,
          treble: 0.3,
          rms: 0.5,
          centroid: 0.3,
          beat: pulse,
          kick: frame % 15 === 0,
        });
        host.renderFrame(audio.frame, time, 1 / 30);
      }
      return canvas.toDataURL("image/webp", 0.85).split(",")[1];
    }, id);
    await writeFile(
      `public/thumbnails/${id}.webp`,
      Buffer.from(data, "base64"),
    );
    console.log(`Rendered ${id}`);
  }
  await page.evaluate(() => window.thumbnailScene.host.dispose());
} finally {
  await browser.close();
}
