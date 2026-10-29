import { test, expect } from "@playwright/test";

test("exports an uploaded song as a playable video with audio", async ({
  page,
}) => {
  const rate = 8000,
    samples = rate * 2;
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
  await page.locator("#export").click();
  await expect(page.locator("#download-video")).toBeVisible({ timeout: 30000 });
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
      const stream = (
        video as HTMLVideoElement & { captureStream(): MediaStream }
      ).captureStream();
      const result = {
        width: video.videoWidth,
        height: video.videoHeight,
        audio: stream.getAudioTracks().length,
        video: stream.getVideoTracks().length,
      };
      video.pause();
      return result;
    });
  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
  expect(result.audio).toBe(1);
  expect(result.video).toBe(1);
});
