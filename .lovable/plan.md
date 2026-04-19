

## Problem
Two issues with the radar:
1. **Idle state**: Green/teal dots are pure decoration — they don't represent any data, so they look like fake info.
2. **Result state**: Risk-colored dots (red/amber/green) are redundant with the new Criticality verdict and even contradict the philosophy we just adopted (no per-symbol risk, judge the change as a whole).

## Fix: make the dots mean something real

Re-purpose the dots so each one represents an **actual affected symbol**, encoded along three dimensions that the criticality verdict *doesn't* already convey:

| Visual channel | Encodes | Why it adds info |
|---|---|---|
| **Distance from center** (ring) | call-graph depth (1 = direct caller, 4 = deep transitive) | shows how *close* the blast is |
| **Dot size** | fan-in of that symbol (how widely *it* is used) | bigger dot = hitting it propagates further |
| **Color** | single neutral ink tone with opacity by depth (closer = more opaque) | removes the redundant red/amber/green; preserves "near = matters more" |

The center node = the resolved target symbol (already there).

### Idle state
Replace the 9 fake teal dots with: nothing. Just the rings + the sweep + center. Add a faint label `awaiting change` near the center. The empty radar reads as "ready to scan" instead of "fake data".

### Hover affordance
On dot hover, show a tooltip with the symbol name, file, depth, and fan-in — turns the radar into an actual exploration surface instead of decoration.

### Result-state caption (under radar)
Currently repeats the criticality verdict. Change to a complementary stat: `5 immediate · 12 transitive · deepest d4` — so the caption and the criticality banner each say a different thing.

## Files touched
- `src/components/RadarVisual.tsx` — drop `STATIC_DOTS`, change `RISK_FILL` mapping to a single ink tone with depth-based opacity, scale dot radius by fan-in, add `<title>` tooltips, render an idle "awaiting change" label.
- `src/pages/ImpactRadar.tsx` — pass `fan_in` through to the radar (extend the `AffectedDot` shape consumed by `RadarVisual`); replace the redundant criticality caption under the radar with the depth-distribution stat.

## Out of scope
- Animated dot transitions, click-to-pin, legend overlay.

