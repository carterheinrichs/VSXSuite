import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function wav(seconds = 30) {
  const samples = 44100 * seconds;
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

for (const revision of [1, 2]) {
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    test(`mobile library ${viewport.width}x${viewport.height}, revision ${revision}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/?ui=${revision}`);
      await page.getByRole("link", { name: "Music library" }).click();
      const picker = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Choose audio files" }).click();
      await (
        await picker
      ).setFiles([
        { name: "Mobile song.wav", mimeType: "audio/wav", buffer: wav() },
      ]);
      const add = page.getByRole("button", {
        name: "Add Mobile song to queue",
        exact: true,
      });
      await add.click();
      const addBox = (await add.boundingBox())!;
      expect(addBox.width).toBeGreaterThanOrEqual(44);
      expect(addBox.height).toBeGreaterThanOrEqual(44);
      await page
        .locator(".catalog-track")
        .filter({ hasText: "Mobile song" })
        .click();
      await expect(page.locator("footer")).toHaveAttribute(
        "data-audio-state",
        "playing",
      );
      const geometry = await page.evaluate(() => {
        const panel = document
          .querySelector("#music-page")!
          .getBoundingClientRect();
        const footer = document
          .querySelector("footer")!
          .getBoundingClientRect();
        return {
          panelBottom: panel.bottom,
          footerTop: footer.top,
          footerRight: footer.right,
          width: innerWidth,
          scroll: document.querySelector("#music-page")!.scrollWidth,
          panelWidth: panel.width,
        };
      });
      expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.footerTop);
      expect(geometry.footerRight).toBeLessThanOrEqual(geometry.width);
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.panelWidth);
      await page.getByRole("link", { name: "Back to visualizer" }).click();
      await expect(page.locator("footer")).toHaveAttribute(
        "data-audio-state",
        "playing",
      );
      await page.getByRole("link", { name: "Music library" }).click();
      await expect(page.locator("#queue-count")).toHaveText("1");
    });
  }
}

test("imported music is restored and playable after reload", async ({
  page,
}) => {
  await page.goto("/#music");
  await page.locator("#tracks-input").setInputFiles({
    name: "Saved song.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await expect(page.locator("#folder-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.locator("#folder-status")).toContainText(
    "Restored from this device",
  );
  await page
    .locator(".catalog-track")
    .filter({ hasText: "Saved song" })
    .click();
  await expect(page.locator("footer")).toHaveAttribute(
    "data-audio-state",
    "playing",
  );
  await page
    .locator("header")
    .getByRole("link", { name: "Back to visualizer" })
    .click();
  await expect(page.locator("#stage")).toBeVisible();
});

test("saved folder is rescanned for added and removed files on reload", async ({
  page,
}) => {
  await page.goto("/#music");
  await page.evaluate(
    async (bytes) => {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle("test-music", {
        create: true,
      });
      const file = await directory.getFileHandle("Original.wav", {
        create: true,
      });
      const writer = await file.createWritable();
      await writer.write(new Uint8Array(bytes));
      await writer.close();
      // @ts-expect-error Vite source module
      const { saveLibrary } = await import("/src/audio/LocalMusicLibrary.ts");
      await saveLibrary({
        name: directory.name,
        directory,
        files: [await file.getFile()],
      });
      await directory.removeEntry("Original.wav");
      const added = await directory.getFileHandle("Added.wav", {
        create: true,
      });
      const nextWriter = await added.createWritable();
      await nextWriter.write(new Uint8Array(bytes));
      await nextWriter.close();
    },
    Array.from(wav(1)),
  );
  await page.reload();
  await expect(
    page.locator(".catalog-track").filter({ hasText: "Added" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".catalog-track").filter({ hasText: "Original" }),
  ).toHaveCount(0);
});
