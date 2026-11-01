import { test, expect } from "@playwright/test";

test("exports an uploaded song as a playable video with audio", async ({
  page,
}) => {
  const rate = 8000,
    samples = rate * 0.3;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(
      Math.sin((i * 440 * 2 * Math.PI) / rate) * 12000,
      44 + i * 2,
    );
  await page.goto("/");
  await expect(page.locator("#export")).toBeDisabled();
  await page
    .locator("#file-input")
    .setInputFiles({ name: "song.wav", mimeType: "audio/wav", buffer: wav });
  await expect(page.locator("#export")).toBeEnabled();
  await page.locator("#export-open").click();
  await page.locator("#export").click();
  await expect(page.locator("#download-video")).toBeVisible({ timeout: 90000 });
  await expect(page.locator("#download-video")).toHaveAttribute(
    "download",
    /song-visualization\.(webm|mp4)/,
  );
  const result = await page
    .locator("#download-video")
    .evaluate(async (element) => {
      const video = document.createElement("video");
      video.src = (element as HTMLAnchorElement).href;
      video.muted = true;
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("Video decode failed"));
      });
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 36;
      const context = canvas.getContext("2d")!;
      context.drawImage(video, 0, 0, 64, 36);
      const pixels = context.getImageData(0, 0, 64, 36).data;
      let brightest = 0;
      for (let i = 0; i < pixels.length; i += 4)
        brightest = Math.max(
          brightest,
          pixels[i],
          pixels[i + 1],
          pixels[i + 2],
        );
      const stream = (
        video as HTMLVideoElement & { captureStream(): MediaStream }
      ).captureStream();
      const result = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        brightest,
        audio: stream.getAudioTracks().length,
        video: stream.getVideoTracks().length,
      };
      video.pause();
      return result;
    });
  expect(result.width).toBe(2560);
  expect(result.height).toBe(1440);
  expect(result.duration).toBeCloseTo(0.3, 1);
  expect(result.audio).toBe(1);
  expect(result.video).toBe(1);
  const timing = await page
    .locator("#download-video")
    .evaluate(async (element) => {
      // @ts-expect-error Vite serves the installed browser module for integration inspection.
      const {
        Input,
        BlobSource,
        ALL_FORMATS,
        EncodedPacketSink,
        VideoSampleSink,
      } = await import("/node_modules/mediabunny/dist/modules/src/index.js");
      const blob = await (
        await fetch((element as HTMLAnchorElement).href)
      ).blob();
      const input = new Input({
        source: new BlobSource(blob),
        formats: ALL_FORMATS,
      });
      const track = await input.getPrimaryVideoTrack();
      const timestamps: number[] = [];
      for await (const packet of new EncodedPacketSink(track).packets())
        timestamps.push(packet.timestamp);
      const duration = await input.computeDuration();
      const sample = await new VideoSampleSink(track).getSample(0.15);
      const canvas = new OffscreenCanvas(64, 36);
      const context = canvas.getContext("2d")!;
      sample.draw(context, 0, 0, 64, 36);
      const pixels = context.getImageData(0, 0, 64, 36).data;
      let brightest = 0;
      for (let i = 0; i < pixels.length; i += 4)
        brightest = Math.max(
          brightest,
          pixels[i],
          pixels[i + 1],
          pixels[i + 2],
        );
      sample.close();
      input.dispose();
      return { timestamps, duration, brightest };
    });
  expect(timing.timestamps).toHaveLength(9);
  expect(timing.brightest).toBeGreaterThan(20);
  timing.timestamps.forEach((time, i) => expect(time).toBeCloseTo(i / 30, 3));
  expect(timing.duration).toBeCloseTo(0.3, 1);
  await expect(page.locator("#export-dialog #export-status")).toBeVisible();
  const exportBox = await page.locator("#export").boundingBox();
  const downloadBox = await page.locator("#download-video").boundingBox();
  expect(downloadBox!.width).toBeCloseTo(exportBox!.width, 1);
  expect(downloadBox!.height).toBeGreaterThanOrEqual(40);
  await page.getByRole("button", { name: "Close export" }).click();
  await expect(page.locator("#export-status")).toBeHidden();
  await expect(page.locator("#play")).toBeEnabled();
  await expect(page.locator("#export-quality")).toBeEnabled();
  const restoredWidth = await page
    .locator("#stage")
    .evaluate((canvas) => (canvas as HTMLCanvasElement).width);
  expect(restoredWidth).toBeLessThan(2560);
});

test("canceling export restores paused playback and discards the partial file", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    // @ts-expect-error Vite serves source modules to the integration browser.
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    // @ts-expect-error Vite serves source modules to the integration browser.
    const { VideoExporter } = await import("/src/core/VideoExporter.ts");
    const audio = new AudioEngine();
    await audio.synth();
    audio.fileLoaded = true;
    audio.seek(2);
    await audio.togglePlayback();
    const exporter = new VideoExporter();
    let begun = false,
      ended = false;
    const host = {
      canvas: document.createElement("canvas"),
      beginOfflineExport() {
        begun = true;
      },
      renderFrame() {
        exporter.cancel();
      },
      endOfflineExport() {
        ended = true;
      },
    };
    let message = "";
    try {
      await exporter.record(host, audio, "1080p");
    } catch (error) {
      message = (error as Error).message;
    }
    if (
      message !== "Export canceled." ||
      !begun ||
      !ended ||
      exporter.active ||
      audio.playing ||
      Math.abs(audio.position - 2) > 0.05
    )
      throw new Error(
        `Cancel did not restore playback: ${message}, ${audio.position}`,
      );
    audio.dispose();
  });
});

test("offline audio analysis responds to the song rather than the playback clock", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite serves source modules to the integration browser.
    const { FileAudioAnalysis } =
      await import("/src/audio/FileAudioAnalysis.ts");
    // @ts-expect-error Vite serves source modules to the integration browser.
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const buffer = new AudioBuffer({
      length: 48000,
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < 24000; i++)
      samples[i] = Math.sin((2 * Math.PI * 93.75 * i) / 48000) * 0.8;
    const analysis = new FileAudioAnalysis(buffer);
    const audio = new AudioEngine();
    let bass = 0,
      rms = 0;
    for (let frame = 0; frame < 30; frame++) {
      analysis.at(frame / 30);
      const data = audio.update(frame / 30, 1 / 30, analysis);
      if (frame === 12) {
        bass = data.bass;
        rms = data.rms;
      }
    }
    const silentRms = audio.frame.rms;
    audio.dispose();
    return { bass, rms, silentRms };
  });
  expect(result.bass).toBeGreaterThan(0.1);
  expect(result.rms).toBeGreaterThan(0.4);
  expect(result.silentRms).toBeLessThan(0.03);
});
