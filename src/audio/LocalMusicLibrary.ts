// Folder handles are structured-cloned by IndexedDB, alongside a playable snapshot.
export interface MusicDirectory {
  kind: "directory";
  name: string;
  values(): AsyncIterable<MusicDirectory | MusicFile>;
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
}
interface MusicFile {
  kind: "file";
  getFile(): Promise<File>;
}
export interface SavedMusicLibrary {
  files: File[];
  name: string;
  directory?: MusicDirectory;
}
export const isAudioFile = (file: File) =>
  /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(file.name) ||
  file.type.startsWith("audio/");

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("vsxsuite-music", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("library");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readSavedLibrary(): Promise<
  SavedMusicLibrary | undefined
> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("library")
        .objectStore("library")
        .get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function saveLibrary(library: SavedMusicLibrary): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("library", "readwrite");
      transaction.objectStore("library").put(library, "current");
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () =>
        reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
export async function scanMusicDirectory(
  directory: MusicDirectory,
): Promise<File[]> {
  const files: File[] = [];
  for await (const entry of directory.values()) {
    if (entry.kind === "directory")
      files.push(...(await scanMusicDirectory(entry)));
    else {
      const file = await entry.getFile();
      if (isAudioFile(file)) files.push(file);
    }
  }
  return files;
}
