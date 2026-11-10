# Function Stage recipe book

Ten starting points for music-reactive curves. **Start with Twin tides, Liquid modulation, or Traveling wave packets.** These are visual adaptations of mathematical waveforms, not simulations of the song's actual waveform or audio synthesizers.

## Set up

1. Select **Function Stage** and expand its control rack folder.
2. Paste the first expression into **y₁ =** and the second into **y₂ =**. Copy only the expression; do not include `y =`.
3. Enable **Show y₂**, set **Center x** and **Center y** to `0`, and apply the recipe's horizontal half-range and time speed.
4. Start music. Set **Music response** to `1`, **Line width** to `2`, and **Glow** to `0.7`. Cyan and pink make overlapping curves easy to follow. A solid dark background keeps the curves clear; disable **grid** for a cleaner performance view.

`t` animates the curves using song time and **Time speed**. `bass`, `mid`, `treble`, `beat`, and `rms` come from the music and are scaled by **Music response**. `beat` is a decaying hit envelope, not a beat counter; use `t` for continuous movement. Expressions containing `t` can move in silence; audio variables need playing music or an active input. These formulas use radians.

The settings below suit a landscape canvas. On a tall canvas, reduce the horizontal half-range or increase line width for readability. Both axes share the same unit scale, so a larger horizontal range also exposes more vertical space.

## 1. Twin tides — start here

Two waves travel in opposite directions. Bass swells the broad wave while treble lifts the smaller ripples.

**Horizontal half-range:** `8` · **Time speed:** `0.7`

**y₁**
```text
(1 + bass) * sin(x - t)
```

**y₂**
```text
(0.6 + treble) * cos(2x + t)
```

## 2. Interference loom

Nearby spatial frequencies combine into broad pockets of ripples. The second curve traces their signed envelope. This uses the sum-to-product identity: `sin(A) + sin(B) = 2sin((A+B)/2)cos((A-B)/2)`.

**Horizontal half-range:** `12` · **Time speed:** `0.5`

**y₁**
```text
(0.7 + 0.5bass) * (sin(3x - t) + sin(3.4x + t))
```

**y₂**
```text
2 * (0.7 + 0.5bass) * cos(0.2x + t)
```

## 3. Liquid modulation

A sine wave bends the phase of another sine wave. Midrange energy strengthens the folds; treble bends the companion curve. Inspired by [sinusoidal modulation](https://www.dsprelated.com/freebooks/mdft/Sinusoidal_Frequency_Modulation_FM.html); these expressions apply phase modulation directly.

**Horizontal half-range:** `8` · **Time speed:** `0.6`

**y₁**
```text
1.5sin(2x - t + (0.5 + 2mid) * sin(0.7x + t))
```

**y₂**
```text
1.2cos(2x + t + (0.5 + 2treble) * cos(0.7x - t))
```

## 4. Traveling wave packets

Two localized bursts glide back and forth. A Gaussian envelope keeps the ripples concentrated instead of filling the screen. Adapted from the [Gaussian function](https://mathworld.wolfram.com/GaussianFunction.html), with moving centers and music-driven heights.

**Horizontal half-range:** `8` · **Time speed:** `0.5`

**y₁**
```text
(1 + 1.5bass) * exp(-0.4(x - 3sin(t))^2) * cos(5(x - 3sin(t)) - t)
```

**y₂**
```text
(0.8 + treble) * exp(-0.4(x + 3sin(t))^2) * sin(5(x + 3sin(t)) + t)
```

## 5. Chirp ribbons

Waves spread out around the center and pack more tightly toward the edges. Their quadratic spatial phase is inspired by a [linear chirp](https://docs.scipy.org/doc/scipy-1.17.0/reference/generated/scipy.signal.chirp.html), using `x` as the swept coordinate.

**Horizontal half-range:** `6` · **Time speed:** `0.5`

**y₁**
```text
(1 + bass) * sin(0.7x^2 - t)
```

**y₂**
```text
(0.8 + treble) * cos(0.7x^2 + t)
```

## 6. Harmonic staircase

Compare a fundamental sine wave with a three-term square-wave approximation. Bass adds the third harmonic and treble adds the fifth, so the rounded trace gains sharper shoulders with the music. Based on the [odd-harmonic Fourier series for a square wave](https://mathworld.wolfram.com/FourierSeriesSquareWave.html). At full harmonic weights this is still a finite approximation, with rounded edges and overshoot.

**Horizontal half-range:** `8` · **Time speed:** `0.6`

**y₁**
```text
(4/pi) * (sin(x - t) + bass * sin(3(x - t))/3 + treble * sin(5(x - t))/5)
```

**y₂**
```text
(4/pi) * sin(x - t)
```

## 7. Neon zigzags

`asin(sin(...))` folds sine waves into continuous triangle waves. The corners stay sharp while bass and treble change the heights. The factor `2/pi` gives a unit-height triangle before music scaling.

**Horizontal half-range:** `8` · **Time speed:** `0.6`

**y₁**
```text
(1 + bass) * (2/pi) * asin(sin(2x - t))
```

**y₂**
```text
(0.7 + treble) * (2/pi) * asin(sin(3x + t))
```

## 8. Kick needles

Exponentials turn repeated wave crossings into narrow peaks. Detected beats punch the upper row upward; treble drives a mirrored lower row. This is a stylized pulse pattern, not an ECG.

**Horizontal half-range:** `8` · **Time speed:** `0.7`

**y₁**
```text
(0.5 + 2beat) * exp(-6abs(sin(x - t)))
```

**y₂**
```text
-(0.5 + 1.5treble) * exp(-6abs(cos(x + t)))
```

## 9. Soft-clipped waves

`atan` smoothly flattens the tops as the audio drive increases. This gives a rounded, squarer shape without poles or abrupt jumps.

**Horizontal half-range:** `8` · **Time speed:** `0.6`

**y₁**
```text
(3/pi) * atan((1 + 8bass) * sin(2x - t))
```

**y₂**
```text
(3/pi) * atan((1 + 8treble) * cos(2x + t))
```

## 10. Breathing mountains

Two smooth hills orbit horizontally. Bass and midrange raise their peaks, while `rms` broadens their bases. The positive denominators avoid singularities across the entire graph.

**Horizontal half-range:** `8` · **Time speed:** `0.4`

**y₁**
```text
(1 + 2bass) / (1 + ((x - 3sin(t))/(0.5 + rms))^2)
```

**y₂**
```text
-(1 + 2mid) / (1 + ((x + 3sin(t))/(0.5 + rms))^2)
```

## Make your own variations

- **Height:** multiply a curve by `(1 + bass)` or `(0.5 + treble)`.
- **Continuous travel:** replace `x` with `(x - t)`; use `(x + t)` to reverse direction.
- **A moving shape:** replace `x` with `(x - 3sin(t))` to slide it back and forth within the viewport.
- **Beat accents:** multiply by `(1 + beat)` for a hit-driven swell. Keep `t` in the phase if you want smooth travel between hits.
- **More folds:** try `sin(2x + (1 + mid) * sin(x - t))`.
- **Less visual clutter:** lower **Time speed**, turn off the second curve, or reduce the number multiplying `x`.

All recipes use the current Function Stage grammar and fit its expression limits. Mathematical source links explain the underlying waveforms; the music mappings and paired compositions are custom adaptations for VSXSuite. Only enter the right-hand side of `y = f(x)` here: parametric curves, polar equations, inequalities, and Desmos-specific syntax are not supported. Avoid `tan(x)` or `1/x` as starting points unless you want gaps at their singularities.
