import { test, expect } from "@playwright/test";

test("adaptive resizing precedes drawing and scene preparation preserves the current scene", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser imports use Vite source resolution.
    const { VisualizerHost } = await import("/src/core/VisualizerHost.ts");
    // Exercise host lifecycle without compiling unrelated GPU scenes.
    // @ts-expect-error Browser imports use Vite source resolution.
    const { AudioEngine } = await import("/src/audio/AudioEngine.ts");
    const host = new VisualizerHost(
      document.createElement("canvas"),
      new AudioEngine(),
    );
    host.exporting = true;
    const internal = host as any;
    const events: string[] = [];
    internal.adapt = () => events.push("resize");
    host.renderFrame = () => {
      events.push("draw");
      host.mode = "hidden";
    };
    host.mode = "realtime";
    internal.tick(performance.now());
    let ready!: () => void;
    const pending = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const heart = host.modules.find(
      (module: any) => module.id === "human-heart",
    )!;
    heart.prepare = () => pending;
    const before = host.settings.scene;
    const selection = host.select("human-heart");
    const during = host.settings.scene;
    ready();
    await selection;
    const after = host.settings.scene;
    // A stale preparation must never override a newer selection.
    let finish!: () => void;
    heart.prepare = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    const stale = host.select("human-heart");
    host.neon.prepare = () => Promise.resolve();
    await host.select("neon");
    finish();
    await stale;
    const latest = host.settings.scene;
    host.dispose();
    return { events, before, during, after, latest };
  });
  expect(result.events).toEqual(["resize", "draw"]);
  expect(result.during).toBe(result.before);
  expect(result.after).toBe("human-heart");
  expect(result.latest).toBe("neon");
});
