# Moore Ops — First Day of School art package

This is the lean production package for the locked First Day treatment. The static art dresses live HTML; it does not contain changing schedule, weather, dinner, calendar, date, clock, or grade data.

## Primary assets

- `composition-reference.png` — canonical 16:9 placement and visual target.
- `first-day-title.png` — hero headline treatment.
- `myles-first-day.png` — transparent Myles character.
- `ophelia-first-day.png` — transparent Ophelia character.
- `stonehouse-sea-stars.png` — transparent school/Sea Stars cluster.
- `paper-lined.png` — edge-to-edge background texture.

## UI accents

- `frame-red.png`, `frame-purple.png`, `frame-blue.png` — empty irregular card frames.
- `brush-red.png`, `brush-purple.png` — ownership-label swashes.
- `icon-backpack.png`, `icon-weather-sun.png`, `icon-calendar.png` — essential live-UI doodles.
- `doodle-star-red.png`, `doodle-star-purple.png`, `underline-yellow.png` — restrained decoration.
- `ui-accents-master.png` — source sprite containing all accent pieces.

## Implementation boundary

Keep `NOW`, `NEXT`, weather, dinner, coming-up items, clock/date, times, and all changing values as live HTML. Use the paper texture as the page backdrop and position these PNGs over it. Do not redraw the crayon aesthetic in CSS or reinterpret the characters.

Red is Myles's ownership cue. Purple is Ophelia's. Blue and yellow are shared school/system accents. The lined-paper effect should remain subtle: no punched holes, torn edge, spiral binding, or strong red notebook margin.
