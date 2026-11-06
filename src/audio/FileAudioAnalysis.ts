// Retained FFT with precomputed Blackman window, bit-reversal and twiddle tables for deterministic analysis.
const FFT_SIZE = 1024;
const HALF_FFT = FFT_SIZE >> 1;
const WINDOW = new Float64Array(FFT_SIZE);
const BIT_REVERSE = new Uint16Array(FFT_SIZE);
const TWIDDLE_COS = new Float64Array(HALF_FFT);
const TWIDDLE_SIN = new Float64Array(HALF_FFT);

for (let i = 0, j = 0; i < FFT_SIZE; i++) {
  WINDOW[i] =
    0.42 -
    0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE) +
    0.08 * Math.cos((4 * Math.PI * i) / FFT_SIZE);
  BIT_REVERSE[i] = j;
  let bit = HALF_FFT;
  for (; j & bit; bit >>= 1) j ^= bit;
  j ^= bit;
}
for (let k = 0; k < HALF_FFT; k++) {
  const angle = (-2 * Math.PI * k) / FFT_SIZE;
  TWIDDLE_COS[k] = Math.cos(angle);
  TWIDDLE_SIN[k] = Math.sin(angle);
}

export class FileAudioAnalysis {
  private readonly real = new Float64Array(FFT_SIZE);
  private readonly imaginary = new Float64Array(FFT_SIZE);
  private readonly smoothed = new Float64Array(HALF_FFT);
  private readonly channels: Float32Array[];
  private readonly samples = new Float32Array(FFT_SIZE);
  private smoothFactor = 0.2;
  constructor(readonly buffer: AudioBuffer) {
    this.channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
  }
  at(time: number, dt = 1 / 60, loop = false) {
    this.smoothFactor = Math.pow(0.2, dt * 60);
    const end = Math.floor(time * this.buffer.sampleRate);
    const real = this.real;
    const imag = this.imaginary;
    const samples = this.samples;
    const channels = this.channels;
    const numChannels = channels.length;
    const invChannels = 1 / numChannels;
    imag.fill(0);
    for (let i = 0; i < FFT_SIZE; i++) {
      let index = end - FFT_SIZE + i;
      if (loop)
        index =
          ((index % this.buffer.length) + this.buffer.length) %
          this.buffer.length;
      let value = 0;
      if (index >= 0) {
        for (let c = 0; c < numChannels; c++) value += channels[c][index] ?? 0;
        value *= invChannels;
      }
      samples[i] = value;
      real[BIT_REVERSE[i]] = value * WINDOW[i];
    }
    for (let size = 2; size <= FFT_SIZE; size <<= 1) {
      const half = size >> 1;
      const step = FFT_SIZE / size;
      for (let start = 0; start < FFT_SIZE; start += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = start + j,
            b = a + half;
          const cos = TWIDDLE_COS[k],
            sin = TWIDDLE_SIN[k];
          const rb = real[b],
            ib = imag[b];
          const r = rb * cos - ib * sin;
          const im = rb * sin + ib * cos;
          real[b] = real[a] - r;
          imag[b] = imag[a] - im;
          real[a] += r;
          imag[a] += im;
        }
      }
    }
  }
  getByteFrequencyData(data: Uint8Array) {
    const s = this.smoothFactor;
    const invS = (1 - s) / FFT_SIZE;
    for (let i = 0; i < data.length; i++) {
      this.smoothed[i] =
        s * this.smoothed[i] +
        invS * Math.hypot(this.real[i], this.imaginary[i]);
      const db = 20 * Math.log10(Math.max(1e-12, this.smoothed[i]));
      data[i] = Math.max(0, Math.min(255, ((db + 100) / 70) * 255));
    }
  }
  getByteTimeDomainData(data: Uint8Array) {
    for (let i = 0; i < data.length; i++)
      data[i] = Math.max(0, Math.min(255, 128 * (1 + this.samples[i])));
  }
}
