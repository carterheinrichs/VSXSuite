// Retained FFT for deterministic analysis at export timestamps.
export class FileAudioAnalysis {
  private readonly real = new Float64Array(1024);
  private readonly imaginary = new Float64Array(1024);
  private readonly smoothed = new Float64Array(512);
  private readonly channels: Float32Array[];
  private readonly samples = new Float32Array(1024);
  constructor(readonly buffer: AudioBuffer) {
    this.channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
  }
  at(time: number) {
    const end = Math.floor(time * this.buffer.sampleRate);
    this.imaginary.fill(0);
    for (let i = 0; i < 1024; i++) {
      const index = end - 1024 + i;
      let value = 0;
      for (const channel of this.channels) value += channel[index] ?? 0;
      value /= this.channels.length;
      this.samples[i] = value;
      // Web Audio's Blackman window.
      this.real[i] =
        value *
        (0.42 -
          0.5 * Math.cos((2 * Math.PI * i) / 1024) +
          0.08 * Math.cos((4 * Math.PI * i) / 1024));
    }
    for (let i = 1, j = 0; i < 1024; i++) {
      let bit = 512;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const temp = this.real[i];
        this.real[i] = this.real[j];
        this.real[j] = temp;
      }
    }
    for (let size = 2; size <= 1024; size *= 2) {
      const half = size / 2;
      for (let start = 0; start < 1024; start += size) {
        for (let j = 0; j < half; j++) {
          const a = start + j,
            b = a + half,
            angle = (-2 * Math.PI * j) / size;
          const r =
            this.real[b] * Math.cos(angle) -
            this.imaginary[b] * Math.sin(angle);
          const im =
            this.real[b] * Math.sin(angle) +
            this.imaginary[b] * Math.cos(angle);
          this.real[b] = this.real[a] - r;
          this.imaginary[b] = this.imaginary[a] - im;
          this.real[a] += r;
          this.imaginary[a] += im;
        }
      }
    }
  }
  getByteFrequencyData(data: Uint8Array) {
    for (let i = 0; i < data.length; i++) {
      this.smoothed[i] =
        0.76 * this.smoothed[i] +
        (0.24 * Math.hypot(this.real[i], this.imaginary[i])) / 1024;
      const db = 20 * Math.log10(Math.max(1e-12, this.smoothed[i]));
      data[i] = Math.max(0, Math.min(255, ((db + 100) / 70) * 255));
    }
  }
  getByteTimeDomainData(data: Uint8Array) {
    for (let i = 0; i < data.length; i++)
      data[i] = Math.max(0, Math.min(255, 128 * (1 + this.samples[i])));
  }
}
