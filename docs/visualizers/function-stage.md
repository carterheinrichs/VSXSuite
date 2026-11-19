# Function Stage

[Documentation home](../README.md) · [All visualizers](README.md)

Plots one or two equations as y = f(x), animated with time and audio variables.

Select **Function Stage** in the library and expand its rack folder. [Shared controls, overlays, and master FX](../using-vsxsuite.md) apply to this scene and exports.

## Options

Parameter names are listed below; explanations include differing display labels. Defaults are the initial app values.

| Option | Default | What it does |
| --- | --- | --- |
| `function1` | `sin(x + t) * (1 + bass)` | First equation, without y =. |
| `function2` | `cos(2x - t) * (1 + treble)` | Second equation, without y =. |
| `secondFunction` | `true` | Show y₂: toggles the second curve. |
| `color1` | `#63f5ff` | Curve 1 color. |
| `color2` | `#ff70b8` | Curve 2 color. |
| `xRange` | `8` | Horizontal half-range (1–30); higher values zoom out. Both axes share the same unit scale. |
| `centerX` | `0` | Horizontal coordinate of the graph center. |
| `centerY` | `0` | Vertical coordinate of the graph center. |
| `lineWidth` | `2` | Curve width (1–6). |
| `grid` | `true` | Toggles the labeled coordinate grid. |
| `speed` | `1` | Time speed: scales the t variable in both equations. |
| `reactivity` | `1` | Music response strength; zero removes audio modulation. |
| `glow` | `0.7` | Glow around text or curves. |
| `background` | `#070b18` | Background color. |
| `backgroundEffect` | `0` | Background style: Solid (0), Waves (1), or Rings (2). |
| `status` | Empty until validated | Read-only equation validation or error message. |

## Expressions

Expressions support `+ - * / ^`, parentheses, implicit multiplication (`2x`), constants `pi` and `e`, and `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `abs`, `sqrt`, `exp`, `log` (base 10), `ln`, `floor`, and `ceil`. Variables are `x`, `t` (song playback position multiplied by Time speed; elapsed app time for live inputs or silence), `bass`, `mid`, `treble`, `beat`, and `rms`. Music response scales the audio variables; zero disables audio modulation. Invalid equations show a message and leave the other curve running. Expressions are limited to 256 characters and 128 tokens and never execute JavaScript.


See the [recipe book](../function-recipes.md) for ten paired examples. Rapid oscillations may require a smaller horizontal range.

Canvas artwork is capped at 1,536 pixels on its longest edge.
