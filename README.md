# LMMS MIDI Skill

> Claude Code agent skill for generating MIDI files and importing them into LMMS projects.

## What It Does

This skill teaches Claude how to:

1. **Generate MIDI files** — programmatically create standard MIDI files (.mid) with arbitrary note patterns, instruments, drums, and tempo maps
2. **Import into LMMS projects** — parse .mid files and inject their notes as patterns into LMMS `.mmpz` project files

The skill is a *knowledge document* — Claude reads it and adapts to your specific request (key, style, tempo, number of tracks, target project) during conversation.

## Installation

```bash
# Clone into your LMMS workspace
git clone https://github.com/YOUR_USER/lmms-midi-skill.git

# Or copy SKILL.md into your project's CLAUDE.md / .claude/skills/

# Optionally install the CLI globally
cd lmms-midi-skill && npm link
```

## Usage

### In Conversation with Claude Code

Once the skill is loaded, just ask naturally:

- "生成一段 D 大调钢琴旋律，导入 dsd.mmpz"
- "做一个 120 BPM hip-hop 鼓组，kick + snare + hi-hat"
- "把 chords.mid 和 melody.mid 导入到 temp.mmpz"

### CLI (standalone)

```bash
# Generate example MIDI files
node bin/lmms-midi.js generate --output ./midi-out/

# Import existing .mid files into a project
node bin/lmms-midi.js import --project dsd --midi-dir ./midi-out/

# Full pipeline: generate + import in one step
node bin/lmms-midi.js all --project dsd --output ./midi-out/
```

## Library API

```js
const gen = require('./src/midi-generate');
const imp = require('./src/midi-import');

// Generate a MIDI file
const data = gen.createMidi([[
  { kind: 'track_name', absPos: 0, name: 'Piano' },
  { kind: 'tempo', absPos: 0, bpm: 120 },
  { kind: 'program', absPos: 0, prog: 0, channel: 0 },
  { kind: 'note', absPos: 0, note: 60, vel: 100, duration: 480, channel: 0 },
]]);

// Parse a MIDI file
const { notes, ticksPerQN } = imp.parseMidi('melody.mid');

// Import into LMMS project
imp.importMidiToProject('project.mmpz', [
  { name: 'Piano', midiPath: 'piano.mid', instrumentXml: imp.INSTRUMENTS.tripleoscBase },
]);
```

## File Structure

```
lmms-midi-skill/
├── SKILL.md              # Main skill guide (this is what Claude Code reads)
├── skill/SKILL.md        # Alternative entry point for skill loading
├── AGENTS.md             # Agent coding guidelines
├── README.md             # This file
├── package.json
├── bin/
│   └── lmms-midi.js      # CLI entry point
└── src/
    ├── midi-generate.js  # MIDI generation library
    └── midi-import.js    # LMMS project import library
```

## Requirements

- Node.js 18+
- No npm dependencies (pure stdlib)

## License

MIT
