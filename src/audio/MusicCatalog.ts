export interface CatalogTrack {
  id: string;
  filename: string;
  displayName: string;
  name: string;
  author: string;
  url: string;
}

const AUDIO_FILE_RE = /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i;

export function parseCatalogTrack(
  pathOrFilename: string,
  url: string,
): CatalogTrack {
  const rawName = pathOrFilename.split("/").pop() ?? pathOrFilename;
  let filename = rawName;
  try {
    filename = decodeURIComponent(rawName);
  } catch {
    /* keep rawName if not URI-encoded */
  }
  const displayName = filename.replace(/\.[^/.]+$/, "").trim();
  const separator = displayName.indexOf(" - ");
  const name =
    separator >= 0 ? displayName.slice(0, separator).trim() : displayName;
  const author = separator >= 0 ? displayName.slice(separator + 3).trim() : "";
  return {
    id: pathOrFilename,
    filename,
    displayName,
    name,
    author,
    url,
  };
}

export function buildCatalogTracks(
  files: Record<string, string>,
): CatalogTrack[] {
  return Object.entries(files)
    .filter(([path]) => AUDIO_FILE_RE.test(path))
    .map(([path, url]) => parseCatalogTrack(path, url))
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
}

const catalogModules = import.meta.glob<string>(
  "/music/*.{mp3,wav,ogg,flac,m4a,aac,opus,MP3,WAV,OGG,FLAC,M4A,AAC,OPUS}",
  { query: "?url", import: "default", eager: true },
);

type CatalogListener = (tracks: CatalogTrack[]) => void;

const listeners: Set<CatalogListener> =
  (import.meta.hot?.data?.listeners as Set<CatalogListener> | undefined) ??
  new Set<CatalogListener>();

let currentTracks = buildCatalogTracks(catalogModules);

export function updateCatalogFiles(
  files: Record<string, string>,
): CatalogTrack[] {
  currentTracks = buildCatalogTracks(files);
  const hotRef = import.meta.hot;
  if (hotRef) hotRef.data.tracks = currentTracks;
  for (const listener of listeners) listener(currentTracks);
  return currentTracks;
}

const hot = import.meta.hot;
if (hot) {
  hot.data.listeners = listeners;
  hot.data.tracks = currentTracks;
  for (const listener of listeners) listener(currentTracks);
  hot.accept();
}

export function getCatalogTracks(): CatalogTrack[] {
  return (
    (import.meta.hot?.data?.tracks as CatalogTrack[] | undefined) ??
    currentTracks
  );
}

export function subscribeCatalog(listener: CatalogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function probeTrackDuration(
  url: string,
  signal?: AbortSignal,
): Promise<number> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const fromElement = await new Promise<number | null>((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    const cleanup = () => {
      audio.onloadedmetadata = null;
      audio.ondurationchange = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
    };
    const check = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        const duration = audio.duration;
        cleanup();
        resolve(duration);
      }
    };
    audio.onloadedmetadata = check;
    audio.ondurationchange = check;
    audio.onerror = () => {
      cleanup();
      resolve(null);
    };
    signal?.addEventListener(
      "abort",
      () => {
        cleanup();
        resolve(null);
      },
      { once: true },
    );
    audio.src = url;
  });
  if (fromElement !== null) return fromElement;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Unable to read track duration.");
  const buffer = await response.arrayBuffer();
  const offline = new OfflineAudioContext(1, 1, 44100);
  const decoded = await offline.decodeAudioData(buffer);
  return decoded.duration;
}
