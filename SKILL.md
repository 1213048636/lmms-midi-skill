---
name: lmms-midi
description: Generate MIDI files and import them into LMMS projects. Use when the user wants to create MIDI music patterns, import MIDI into LMMS .mmpz project files, or build music production pipelines for LMMS.
---

# LMMS MIDI Pipeline — Agent Skill Guide

Generate MIDI files programmatically and inject them into LMMS (Let's Make Music) `.mmpz` project files.

## Quick Start

```bash
# Generate MIDI files from a note specification
node bin/lmms-midi.js generate --output ./output/

# Import existing .mid files into an LMMS project
node bin/lmms-midi.js import --project dsd --midi-dir ./output/

# Or do both in one step (generate + import)
node bin/lmms-midi.js all --project dsd --output ./output/
```

When the user gives a custom request (e.g., "make a D major melody"), adapt the patterns below in an inline Node.js script rather than using the CLI.

---

## Part 1: Generating MIDI Files

### MIDI Binary Format

```
MThd (14 bytes): "MThd" + length(6,BE) + format(2,BE) + ntracks(2,BE) + division(2,BE)
MTrk (8+N bytes): "MTrk" + length(4,BE) + events... + 0x00 0xFF 0x2F 0x00
```

- **PPQN (division)**: always use **480** ticks per quarter note
- **Format**: 1 (multi-track, synchronous)

### VLQ Encoding (Big-Endian, MSB First)

```js
function writeVLQ(v) {
  const g = [];
  do { g.push(v & 0x7F); v >>= 7; } while (v > 0);
  const b = Buffer.alloc(g.length);
  for (let i = 0; i < g.length; i++) {
    let x = g[g.length - 1 - i];
    if (i < g.length - 1) x |= 0x80;
    b[i] = x;
  }
  return b;
}
```

### MIDI Events (written per track, delta-first)

| Event | Status | Data bytes |
|-------|--------|------------|
| Note On (ch c) | `0x9c` | note (0-127), vel (1-127) |
| Note Off (ch c) | `0x8c` | note, velocity (0) |
| Program Change | `0xcc` | program number |
| Tempo meta | `FF 51 03` | 3 GB μs-per-quarter (60000000/bpm) |
| Time sig meta | `FF 58 04` | num, den(pow2), clocks(24), qn(8) |
| Track name meta | `FF 03 len` | name (latin1) |
| End of track | `FF 2F 00` | |

### CRITICAL: Event Ordering

Do NOT write note-on/note-off as consecutive pairs. Instead:

1. Collect ALL events (note-on, note-off, meta) into a flat array
2. Sort by absolute time; for ties, note-on before note-off (priority field)
3. Write sequentially: `delta = absTime - cursor`

```js
const stream = [];
for (const n of notes) {
  stream.push({ t: n.pos, p: 0, d: Buffer.from([0x90|ch, n.note, n.vel]) });        // on
  stream.push({ t: n.pos + n.dur, p: 1, d: Buffer.from([0x80|ch, n.note, 0]) });    // off
}
stream.sort((a, b) => a.t - b.t || a.p - b.p);
let cursor = 0;
for (const item of stream) {
  const delta = Math.max(0, item.t - cursor);
  cursor = item.t;
  trackData = Buffer.concat([trackData, writeVLQ(delta), item.d]);
}
```

### Note Name → MIDI Number

```js
const names = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };
function midiNote(s) {
  return (parseInt(s.slice(-1)) + 1) * 12 + names[s.slice(0, -1)];
}
// midiNote('C4') = 60, midiNote('A3') = 57
```

### Full createMidi Implementation

See `src/midi-generate.js` for the complete, production-ready implementation.

```js
const midi = require('./src/midi-generate.js');

const tracks = [[
  { kind: 'track_name', absPos: 0, name: 'My Track' },
  { kind: 'tempo', absPos: 0, bpm: 140 },
  { kind: 'time_sig', absPos: 0, num: 4, den: 2 },
  { kind: 'program', absPos: 0, prog: 0, channel: 0 },  // 0=Acoustic Grand Piano
  // notes: { kind: 'note', absPos, note, vel, duration, channel }
  { kind: 'note', absPos: 0, note: 60, vel: 100, duration: 480, channel: 0 },
]];

fs.writeFileSync('output.mid', midi.createMidi(tracks, 480));
```

### GM Program Numbers (Common)

| Prog | Instrument |
|------|-----------|
| 0 | Acoustic Grand Piano |
| 24 | Acoustic Guitar (nylon) |
| 33 | Electric Bass (finger) |
| 34 | Electric Bass (pick) |
| 48 | String Ensemble |
| 80 | Lead (square) |
| 81 | Lead (sawtooth) |
| 91 | Pad (warm) |

### GM Drum Map (Channel 9/10)

| Note | Sound |
|------|-------|
| 35 | Acoustic Bass Drum |
| 36 | Bass Drum (Kick) |
| 38 | Acoustic Snare |
| 42 | Closed Hi-hat |
| 46 | Open Hi-hat |
| 49 | Crash Cymbal |

---

## Part 2: Importing MIDI into LMMS Projects

### .mmpz File Format

```
Bytes 0-3:   header (always 0x00 0x00 0x1a 0xb4)
Bytes 4-end:  zlib-deflated XML
```

```js
const zlib = require('zlib');
// Read
const raw = fs.readFileSync('project.mmpz');
const xml = zlib.inflateSync(raw.subarray(4)).toString('utf8');
// Write
const compressed = zlib.deflateSync(xmlStr);
const header = Buffer.from([0x00, 0x00, 0x1a, 0xb4]);
fs.writeFileSync('project.mmpz', Buffer.concat([header, compressed]));
```

### LMMS Tick System

- **LMMS TPQ = 48** ticks per quarter note
- **1 bar = 192 ticks** (4/4, 4 × 48)
- **MIDI → LMMS conversion**: `Math.round(midiTick * 48 / 480)`  (= `Math.round(midiTick / 10)`)

### MIDI Parsing

Reading a .mid file to extract notes:

```js
function readVLQ(buf, offset) {
  let v = 0;
  while (true) { const b = buf[offset++]; v = (v << 7) | (b & 0x7F); if (!(b & 0x80)) break; }
  return { value: v, offset };
}
```

Track parsing logic:
1. Read VLQ delta → accumulate `absTime`
2. Meta events (0xFF): skip by their length field
3. Note On (0x9x, vel > 0): store `{absTime, vel}` in a Map keyed by note number
4. Note Off (0x8x or 0x9x with vel=0): pop the note from the Map, compute duration, push to results
5. **Same-note overlap**: if a Note On arrives while the same note is already pending, close the old one first (implicit note-off)
6. Running status: if data byte < 0x80, reuse previous status byte

See `src/midi-import.js` → `parseMidi()` for the full implementation.

### XML Injection Point

Find the song-level `<trackcontainer type="song">` and insert new tracks before its closing tag:

```js
// Find <trackcontainer ... type="song" ...>
let tcOpen = xml.indexOf('<trackcontainer', xml.indexOf('<song>'));
while (tcOpen !== -1) {
  const tagClose = xml.indexOf('>', tcOpen);
  if (xml.substring(tcOpen, tagClose + 1).includes('type="song"')) break;
  tcOpen = xml.indexOf('<trackcontainer', tagClose + 1);
}

// Find matching </trackcontainer> by depth counting
let depth = 0, tcClose = -1;
for (let i = tcOpen; i < xml.length; i++) {
  if (xml.startsWith('<trackcontainer', i) && (xml[i+15] === ' ' || xml[i+15] === '>'))
    depth++;
  else if (xml.startsWith('</trackcontainer>', i)) {
    depth--;
    if (depth === 0) { tcClose = i + 17; break; }
  }
}
const insertPos = tcClose - 17;  // insert BEFORE the closing tag
```

### LMMS Pattern XML

```xml
<pattern type="1" muted="0" name="Name" steps="1728" pos="0">
  <note key="60" len="48" pos="0" vol="100" pan="0"/>
  <note key="62" len="24" pos="48" vol="95" pan="0"/>
</pattern>
```

- `type="1"` = piano-roll (free note positions), `type="0"` = B&B step sequencer
- `steps` = total pattern length in LMMS ticks (round up to bar boundary: `(Math.floor(maxEnd/192)+1)*192`)
- `pos` and `len` in LMMS ticks
- `vol` = MIDI velocity (0-127), `pan` = 0 (center)

### LMMS Track XML

```xml
<track type="0" muted="0" name="TrackName" solo="0">
  <instrumenttrack fxch="0" vol="100" pitch="0" pitchrange="1" basenote="57" pan="0" usemasterpitch="1">
    <instrument name="tripleoscillator"> ... </instrument>
    <eldata fres="0.5" ftype="0" fcut="14000" fwet="0"> ... </eldata>
    <chordcreator chord="0" chordrange="1" chord-enabled="0"/>
    <arpeggiator arp="0" arp-enabled="0" .../>
    <midiport outputchannel="1" .../>
    <fxchain enabled="0" numofeffects="0"/>
  </instrumenttrack>
  <pattern type="1" ...> ... </pattern>
</track>
```

### LMMS Instruments Reference

**TripleOscillator** — general-purpose synth, good for bass/lead/chords/pads:

```xml
<instrument name="tripleoscillator">
  <tripleoscillator
    pan0="0" coarse2="-24" finer1="0" finel0="0" coarse1="-12"
    stphdetun1="0" modalgo1="2" vol2="33" finel1="0" wavetype1="0"
    finer2="0" finel2="0" modalgo3="2" vol0="33" stphdetun0="0"
    phoffset1="0" phoffset2="0" wavetype2="0" wavetype0="0"
    stphdetun2="0" phoffset0="0" modalgo2="2" pan2="0"
    vol1="33" coarse0="0" finer0="0" pan1="0"
  />
</instrument>
```

Key parameters to vary by track role:
- `wavetype0`: 0=sine, 1=saw, 2=square, 3=triangle
- `vol0/1/2`: oscillator mix levels
- `coarse0/1/2`: pitch offset in semitones (-24 = two octaves down)
- `fcut`: filter cutoff Hz (lower = darker/muffled)

**Kicker** — kick drum synthesizer:

```xml
<instrument name="kicker">
  <kicker decay="440" startfreq="150" endfreq="40" gain="1"
    click="0.4" slope="0.06" dist="0.8" env="0.163" .../>
</instrument>
```

---

## Reference Files

| File | Purpose |
|------|---------|
| `src/midi-generate.js` | Production MIDI generation library (writeVLQ, createMidi, midiNote) |
| `src/midi-import.js` | Production LMMS import library (parseMidi, readVLQ, buildPatternXml, injectTracks) |
| `bin/lmms-midi.js` | CLI entry point (generate / import / all) |

When the user asks for custom MIDI content (specific key, style, instruments, number of tracks), write an inline Node.js script using the patterns documented above rather than relying on the CLI. The CLI is for common quick tasks; the documented patterns are for flexible customization.
