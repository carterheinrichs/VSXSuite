import "./style.css";
import { AudioEngine } from "./audio/AudioEngine";
import { VisualizerHost } from "./core/VisualizerHost";
import { ViszSuiteUI } from "./ui/ViszSuiteUI";
try {
  const audio = new AudioEngine();
  const host = new VisualizerHost(
    document.querySelector<HTMLCanvasElement>("#stage")!,
    audio,
  );
  const ui = new ViszSuiteUI(host, audio);
  window.addEventListener(
    "pagehide",
    () => {
      ui.dispose();
      host.dispose();
    },
    { once: true },
  );
} catch (error) {
  const element = document.querySelector<HTMLElement>("#error")!;
  element.hidden = false;
  element.textContent =
    error instanceof Error ? error.message : "Unable to initialize graphics.";
}
