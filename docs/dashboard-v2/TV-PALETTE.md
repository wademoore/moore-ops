# Dashboard v2 television palette

Dashboard v2 uses explicit surface tokens so its paper-and-paint character stays intact without a global brightness, opacity, or filter adjustment.

| Token | Day | Evening | Purpose |
| --- | --- | --- | --- |
| `--canvas` | `#d8c9ad` | `#c9b99d` | Warm oatmeal dashboard parchment |
| `--surface-panel` | `#e3d6bd` | `#d5c6aa` | Primary paper cards |
| `--surface-alt` | `#ded0b4` | `#cfbea0` | Alerts, assessment strips, and alternate paper |
| `--secondary` | `#45564d` | `#394b42` | Secondary text with retained green contrast |
| `--rule` | `rgba(20,40,31,.28)` | `rgba(20,40,31,.34)` | Dividers and quiet borders |

The automatic evening palette activates from 7:00 PM through 5:59 AM in `America/New_York`. It is a restrained warm reduction, not dark mode. The render fixtures may force `paletteMode: "day"` or `"evening"` for deterministic screenshots; otherwise the browser reevaluates the local hour with the live clock.
