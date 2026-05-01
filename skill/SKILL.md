---
name: lmms-midi
description: Generate MIDI files and import them into LMMS projects. Use when the user wants to create MIDI music patterns, import MIDI into LMMS .mmpz project files, or build music production pipelines for LMMS.
---

# LMMS MIDI — Agent Skill Guide

Generate MIDI files programmatically and inject them into LMMS `.mmpz` project files.

## Prerequisites

```bash
# Install (optional — the skill also works with inline scripts)
npm install -g lmms-midi-skill
```

No external dependencies — pure Node.js standard library.

---

## Quick Reference

### Generating MIDI

Use `src/midi-generate.js`:

```js
const { createMidi, midiNote, TPQ } = require('./src/midi-generate');

const events = [
  { kind: 'track_name', absPos: 0, name: 'My Track' },
  { kind: 'tempo', absPos: 0, bpm: 140 },
  { kind: 'time_sig', absPos: 0, num: 4, den: 2 },
  { kind: 'program', absPos: 0, prog: 0, channel: 0 },
  { kind: 'note', absPos: 0, note: midiNote('C4'), vel: 100, duration: 480, channel: 0 },
];
fs.writeFileSync('output.mid', createMidi([events]));
```

Key rules:
- PPQN = 480 ticks per quarter note
- VLQ is big-endian (MSB first)
- Sort ALL events by absolute time before writing (note-on and note-off separately, note-on before note-off at same time)
- Delta times are relative to the previous event

### Importing into LMMS (.mmpz)

Use `src/midi-import.js`:

```js
const { importMidiToProject, INSTRUMENTS } = require('./src/midi-import');

importMidiToProject('project.mmpz', [
  { name: 'Track1', midiPath: 'track1.mid', instrumentXml: INSTRUMENTS.tripleoscBase },
]);
```

Key rules:
- .mmpz = 4-byte header (00 00 1a b4) + zlib-deflated XML
- LMMS TPQ = 48 (1 bar = 192 ticks)
- Convert: `Math.round(midiTick * 48 / 480)`
- Inject new `<track>` elements before the closing `</trackcontainer>` of the song container
- Pattern XML: `<pattern type="1" ...><note key="N" len="L" pos="P" vol="V" pan="0"/></pattern>`

---

## CLI

```bash
node bin/lmms-midi.js generate --output ./out/
node bin/lmms-midi.js import --project dsd --midi-dir ./out/
node bin/lmms-midi.js all --project dsd
```

---

## File Layout

| File | Purpose |
|------|---------|
| `src/midi-generate.js` | MIDI generation library |
| `src/midi-import.js` | LMMS import library |
| `bin/lmms-midi.js` | CLI entry point |
| `SKILL.md` | This file (main skill guide) |
