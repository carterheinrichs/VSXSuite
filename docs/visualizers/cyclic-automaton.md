# Cyclic Cellular Automaton

[Documentation home](../README.md) · [All visualizers](README.md)

On a wrapping GPU grid, cells advance to the next color when enough of their eight neighbors already have it. Traveling fronts and spirals emerge; music accelerates evolution and lights boundaries.

Select **Cyclic Cellular Automaton** in the library and expand its rack folder. [Shared controls, overlays, and master FX](../using-vsxsuite.md) apply to this scene and exports.

## Options

Parameter names are listed below; explanations include differing display labels. Defaults are the initial app values.

| Option | Default | What it does |
| --- | --- | --- |
| `speed` | `1` | Animation speed; zero stops time-driven motion, though audio changes may remain. |
| `intensity` | `1.3` | Scene brightness. |
| `hue` | `0` | Palette shift through a full color cycle (0–1). |
| `reactivity` | `1` | Music response strength; zero removes audio modulation. |
| `states` | `12` | Color states (3–24); changes restart the grid. |
| `threshold` | `1` | Required neighbors in the next state (1–4); higher values may freeze patterns. Changes restart the grid. |
| `cells` | `192` | Cells across the grid; higher values make smaller cells. Changes reset the simulation. |
| `seed` | `1` | Reproducible starting layout; changes restart the simulation. |
