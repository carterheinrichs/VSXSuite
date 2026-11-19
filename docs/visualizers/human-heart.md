# Human Heart

[Documentation home](../README.md) · [All visualizers](README.md)

An anatomical illustration shows staggered valve opening and chamber activity, synchronized to detected beat phase when available. Frequency bands modulate the animation. This is an artistic visualization, not a medical simulation.

Select **Human Heart** in the library and expand its rack folder. [Shared controls, overlays, and master FX](../using-vsxsuite.md) apply to this scene and exports.

## Options

Parameter names are listed below; explanations include differing display labels. Defaults are the initial app values.

| Option | Default | What it does |
| --- | --- | --- |
| `speed` | `1` | Scales shader time and the fallback valve cycle. Detected beat phase controls valves when synchronization is available. |
| `intensity` | `1.1` | Scene brightness. |
| `hue` | `0` | Palette shift through a full color cycle (0–1). |
| `reactivity` | `1` | Music response strength; zero removes audio modulation. |
| `cutaway` | `true` | Shows the interior illustration; disable for the exterior. |
| `valveMotion` | `1` | How widely the valves open. |
| `flow` | `1` | Strength of chamber activity. |
