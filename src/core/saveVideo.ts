type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }>;
};

// Invoke from the click handler so the picker retains user activation. Stream
// to disk rather than asking the download manager to read a large Blob URL.
export async function saveVideo(blob: Blob, name: string): Promise<boolean> {
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (!picker) return false;
  let handle;
  try {
    handle = await picker.call(window, {
      suggestedName: name,
      types: [
        { description: "WebM video", accept: { "video/webm": [".webm"] } },
      ],
    });
  } catch (error) {
    // Private browsing and embedded pages may expose the API but disallow it.
    if (
      error instanceof DOMException &&
      ["SecurityError", "NotAllowedError"].includes(error.name)
    )
      return false;
    throw error;
  }
  await blob.stream().pipeTo(await handle.createWritable());
  return true;
}
