import { StreamTarget } from "mediabunny";

// Keep every byte buffer bounded, including when the muxer seeks back to patch
// headers. Blob parts can represent large files without one giant ArrayBuffer.
export class VideoBlobTarget {
  private readonly chunkSize = 16 * 1024 * 1024;
  private chunks: Blob[] = [];
  readonly target = new StreamTarget(
    new WritableStream({
      write: ({ data, position }) => this.write(data, position),
    }),
    { chunked: true, chunkSize: this.chunkSize },
  );

  private write(data: Uint8Array<ArrayBuffer>, position: number) {
    let offset = 0;
    while (offset < data.byteLength) {
      const index = Math.floor(position / this.chunkSize);
      const start = position % this.chunkSize;
      const length = Math.min(data.byteLength - offset, this.chunkSize - start);
      while (this.chunks.length <= index) this.chunks.push(new Blob());
      const previous = this.chunks[index];
      this.chunks[index] = new Blob([
        previous.slice(0, start),
        new Uint8Array(Math.max(0, start - previous.size)),
        data.subarray(offset, offset + length),
        previous.slice(start + length),
      ]);
      offset += length;
      position += length;
    }
  }

  finish(): Blob {
    const blob = new Blob(this.chunks, { type: "video/webm" });
    this.chunks = [];
    return blob;
  }
}
