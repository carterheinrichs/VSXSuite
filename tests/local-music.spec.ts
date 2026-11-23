import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function wav() {
  const samples = 44100 * 30;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(44100, 24);
  buffer.writeUInt32LE(88200, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

for (const revision of [1, 2]) {
  test(`local folder and playback survive navigation, revision ${revision}`, async ({
    page,
  }) => {
    const folder = await mkdtemp(join(tmpdir(), "vsx-music-"));
    try {
      await mkdir(join(folder, "album"));
      await writeFile(join(folder, "First song.wav"), wav());
      await writeFile(join(folder, "album", "Second song.WAV"), wav());
      await writeFile(join(folder, "notes.txt"), "Not audio");
      await page.goto(`/?ui=${revision}#music`);
      await expect(
        page.getByRole("heading", { name: "Local music library" }),
      ).toBeVisible();
      const initialCount = Number(
        await page.locator("#catalog-count").textContent(),
      );
      await page.locator("#folder-input").setInputFiles(folder);
      await expect(page.locator("#catalog-count")).toHaveText(
        String(initialCount + 2),
      );
      await expect(page.locator("#folder-status")).toContainText(
        "2 audio tracks",
      );
      await expect(
        page
          .locator(".catalog-track")
          .filter({ hasText: "First song" })
          .locator(".catalog-track-runtime"),
      ).toHaveText("0:30");
      await page
        .getByRole("button", { name: "Add Second song to queue", exact: true })
        .click();
      await page
        .locator(".catalog-track")
        .filter({ hasText: "First song" })
        .click();
      await expect(page.locator("#source-label")).toHaveText("FIRST SONG");
      await expect(page.locator("footer")).toHaveAttribute(
        "data-audio-state",
        "playing",
      );
      await page.getByRole("link", { name: "Back to visualizer" }).click();
      await expect(page.locator("#stage")).toBeVisible();
      await expect(page.locator("#queue-count")).toHaveText("1");
      await expect(page.locator("footer")).toHaveAttribute(
        "data-audio-state",
        "playing",
      );
      await page.getByRole("link", { name: "Music library" }).click();
      await expect(page.locator("#queue-count")).toHaveText("1");
      await page
        .getByRole("button", { name: "Play next", exact: true })
        .click();
      await expect(page.locator("#source-label")).toHaveText("SECOND SONG");
      await expect(page.locator("#queue-count")).toHaveText("0");
      // Replacing the library must preserve object URLs used by queued songs.
      await page
        .getByRole("button", { name: "Add First song to queue", exact: true })
        .click();
      await page.locator("#folder-input").setInputFiles(folder);
      await page
        .getByRole("button", { name: "Play next", exact: true })
        .click();
      await expect(page.locator("#source-label")).toHaveText("FIRST SONG");
      await expect(page.locator("footer")).toHaveAttribute(
        "data-audio-state",
        "playing",
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
}
