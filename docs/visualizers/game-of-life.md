# Conway's Game of Life

[Documentation home](../README.md) · [All visualizers](README.md)

Conway’s B3/S23 rules run alongside a director staging glider guns, oscillators, spaceships, and symmetric formations. Audio attacks cue formations and accent generation speed and glow.

Select **Conway's Game of Life** in the library and expand its rack folder. [Shared controls, overlays, and master FX](../using-vsxsuite.md) apply to this scene and exports.

## Options

Parameter names are listed below; explanations include differing display labels. Defaults are the initial app values.

| Option | Default | What it does |
| --- | --- | --- |
| `preset` | `showcase` | Choreography: Showcase, Guns & Fleets, Oscillator Garden, or Symmetric Blooms. |
| `curation` | `0.85` | Shape bias: how strongly stagnant ash is dissolved and fresh formations are staged. |
| `speed` | `1` | Animation speed; zero stops time-driven motion, though audio changes may remain. |
| `intensity` | `1.35` | Scene brightness. |
| `hue` | `0` | Palette shift through a full color cycle (0–1). |
| `reactivity` | `1` | Music response strength; zero removes audio modulation. |
| `trails` | `0.72` | Afterglow: fading traces of earlier generations. |
| `cells` | `160` | Cells across the grid; higher values make smaller cells. Changes reset the simulation. |
| `seed` | `1` | Reproducible starting layout; changes restart the simulation. |

At zero reactivity the scene runs autonomously. Shape bias still allows the director to introduce formations.
