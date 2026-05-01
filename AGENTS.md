# AGENTS.md — LMMS MIDI Skill

## Project Overview

- **Name**: lmms-midi-skill
- **Type**: Claude Code Agent Skill (Node.js)
- **Engine**: Node.js 18+ (pure JavaScript, no dependencies beyond Node.js stdlib)

## Commands

```bash
# Generate MIDI files
node bin/lmms-midi.js generate --output ./out/

# Import MIDI into LMMS project
node bin/lmms-midi.js import --project dsd --midi-dir ./out/

# Full pipeline
node bin/lmms-midi.js all --project dsd --output ./out/
```

## Code Style

- Pure JavaScript (no TypeScript), ES modules optional
- `camelCase` for functions, `SCREAMING_SNAKE_CASE` for constants
- No external dependencies — only Node.js built-ins (fs, path, zlib)
- Export via `module.exports`

## Project Structure

```
lmms-midi-skill/
  SKILL.md              # Main skill guide (loaded by Claude Code)
  skill/SKILL.md        # Alternative skill entry point
  AGENTS.md             # This file
  README.md             # GitHub README
  package.json          # npm metadata
  bin/lmms-midi.js      # CLI entry point
  src/midi-generate.js  # MIDI generation library (writeVLQ, createMidi, midiNote)
  src/midi-import.js    # LMMS import library (parseMidi, buildPatternXml, injectTracks)
```

## Key Patterns

- MIDI events MUST be sorted by absolute time before writing (note-on + note-off in flat array)
- VLQ encoding is big-endian (MSB first)
- LMMS ticks = Math.round(MIDI ticks / 10)  [480 TPQ → 48 TPQ]
- .mmpz files: 4-byte header (00 00 1a b4) + zlib-deflated XML
- Inject new tracks before the closing `</trackcontainer>` of the song container

## Testing

Currently manual: generate MIDI, import to an .mmpz, open in LMMS to verify.
