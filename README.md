# LMMS MIDI Skill · LMMS MIDI 技能

> Claude Code agent skill for generating MIDI files and importing them into LMMS projects.
> Claude Code 智能体技能：生成 MIDI 文件并导入 LMMS 项目。

[English](#english) · [中文](#中文)

---

## English

### What It Does

This skill teaches Claude how to:

1. **Generate MIDI files** — programmatically create standard MIDI files (.mid) with arbitrary note patterns, instruments, drums, and tempo maps
2. **Import into LMMS projects** — parse .mid files and inject their notes as patterns into LMMS `.mmpz` project files

The skill is a *knowledge document* — Claude reads it and adapts to your specific request (key, style, tempo, number of tracks, target project) during conversation.

### Installation

```bash
git clone https://github.com/1213048636/lmms-midi-skill.git
cd lmms-midi-skill && npm link
```

### Usage

**In conversation with Claude Code** — just ask naturally:

- "Generate a D major piano melody and import into dsd.mmpz"
- "Make a 120 BPM hip-hop drum pattern with kick, snare, and hi-hat"
- "Import chords.mid and melody.mid into temp.mmpz"

**CLI (standalone):**

```bash
node bin/lmms-midi.js generate --output ./midi-out/
node bin/lmms-midi.js import --project dsd --project-path ./lmms-projects/
node bin/lmms-midi.js all --project dsd --output ./midi-out/
```

### Library API

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

### File Structure

```
lmms-midi-skill/
├── SKILL.md              # Main skill guide (loaded by Claude Code)
├── skill/SKILL.md        # Compact skill entry point
├── AGENTS.md             # Agent coding guidelines
├── README.md             # This file
├── LICENSE               # MIT License
├── package.json
├── bin/
│   └── lmms-midi.js      # CLI entry point
└── src/
    ├── midi-generate.js  # MIDI generation library
    └── midi-import.js    # LMMS project import library
```

### Requirements

- Node.js 18+
- No npm dependencies (pure stdlib)

---

## 中文

### 功能

这个技能教会 Claude 两件事：

1. **生成 MIDI 文件** — 用代码创建标准 MIDI 文件（.mid），支持任意音符编排、乐器、鼓组和速度映射
2. **导入 LMMS 项目** — 解析 .mid 文件，将其音符作为 Pattern 注入 LMMS `.mmpz` 项目文件

技能本质是一份*知识文档* — Claude 在对话中读取它后，根据你的具体需求（调式、风格、速度、轨道数、目标项目）灵活适配。

### 安装

```bash
git clone https://github.com/1213048636/lmms-midi-skill.git
cd lmms-midi-skill && npm link
```

### 使用方式

**在 Claude Code 对话中** — 直接说：

- "生成一段 D 大调钢琴旋律，导入 dsd.mmpz"
- "做一个 120 BPM hip-hop 鼓组，kick + snare + hi-hat"
- "把 chords.mid 和 melody.mid 导入到 temp.mmpz"

**命令行（独立使用）：**

```bash
node bin/lmms-midi.js generate --output ./midi-out/
node bin/lmms-midi.js import --project dsd --project-path ./lmms-projects/
node bin/lmms-midi.js all --project dsd --output ./midi-out/
```

### 库 API

```js
const gen = require('./src/midi-generate');
const imp = require('./src/midi-import');

// 生成 MIDI 文件
const data = gen.createMidi([[
  { kind: 'track_name', absPos: 0, name: 'Piano' },
  { kind: 'tempo', absPos: 0, bpm: 120 },
  { kind: 'program', absPos: 0, prog: 0, channel: 0 },
  { kind: 'note', absPos: 0, note: 60, vel: 100, duration: 480, channel: 0 },
]]);

// 解析 MIDI 文件
const { notes, ticksPerQN } = imp.parseMidi('melody.mid');

// 导入到 LMMS 项目
imp.importMidiToProject('project.mmpz', [
  { name: 'Piano', midiPath: 'piano.mid', instrumentXml: imp.INSTRUMENTS.tripleoscBase },
]);
```

### 文件结构

```
lmms-midi-skill/
├── SKILL.md              # 主技能指南（Claude Code 加载）
├── skill/SKILL.md        # 精简版技能入口
├── AGENTS.md             # Agent 编码规范
├── README.md             # 本文件
├── LICENSE               # MIT 许可证
├── package.json
├── bin/
│   └── lmms-midi.js      # CLI 入口
└── src/
    ├── midi-generate.js  # MIDI 生成库
    └── midi-import.js    # LMMS 导入库
```

### 运行要求

- Node.js 18+
- 无外部依赖（纯 Node.js 标准库）

---

## License

MIT — see [LICENSE](./LICENSE)
