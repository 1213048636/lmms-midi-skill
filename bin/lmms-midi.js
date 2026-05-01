#!/usr/bin/env node
/**
 * lmms-midi — CLI for generating MIDI files and importing into LMMS projects.
 *
 * Usage:
 *   node lmms-midi.js generate --output ./mydir/
 *   node lmms-midi.js import --project dsd --project-path ./lmms-projects/
 *   node lmms-midi.js import --project /full/path/to/project.mmpz
 *   node lmms-midi.js all --project dsd --output ./mydir/
 */
const fs = require('fs');
const path = require('path');
const midiGen = require('../src/midi-generate');
const midiImport = require('../src/midi-import');

const args = process.argv.slice(2);
const cmd = args[0];

function flag(key) {
  const idx = args.indexOf(key);
  return idx !== -1 ? args[idx + 1] : null;
}

const project = flag('--project') || 'temp';
const projectPathFlag = flag('--project-path') || process.cwd();
const outputDir = flag('--output') || flag('--midi-dir') || process.cwd();
const midiDir = flag('--midi-dir') || outputDir;

// If --project is a full path, use it directly; otherwise resolve relative to --project-path
const projPath = path.isAbsolute(project)
  ? project
  : path.join(projectPathFlag, `${project}.mmpz`);

// ---- Generate ----

function generate() {
  // Example: generate 4 demonstration tracks
  const { TPQ, midiNote: mn, createMidi, GM_INSTRUMENTS } = midiGen;

  // Bassline (C minor, driving)
  const bassEv = [
    { kind: 'track_name', absPos: 0, name: 'Bass' },
    { kind: 'program', absPos: 0, prog: GM_INSTRUMENTS['electric bass pick'], channel: 0 },
    { kind: 'tempo', absPos: 0, bpm: 140 },
    { kind: 'time_sig', absPos: 0, num: 4, den: 2 },
  ];
  [
    [0, mn('C2'),120,TPQ],[TPQ/2,mn('C2'),100,TPQ],[TPQ,mn('G1'),120,TPQ],
    [TPQ*2,mn('C2'),110,TPQ],[TPQ*2+TPQ/2,mn('Eb2'),100,TPQ],[TPQ*3,mn('G1'),120,TPQ],
    [TPQ*4,mn('F2'),110,TPQ],[TPQ*4+TPQ/2,mn('F2'),90,TPQ],[TPQ*5,mn('C2'),120,TPQ],
    [TPQ*6,mn('F2'),110,TPQ],[TPQ*6+TPQ/2,mn('Ab2'),95,TPQ],[TPQ*7,mn('C2'),120,TPQ],
    [TPQ*8,mn('Ab1'),120,TPQ*2],[TPQ*9,mn('Eb2'),100,TPQ],[TPQ*10,mn('Ab1'),110,TPQ*2],[TPQ*11,mn('C2'),100,TPQ],
    [TPQ*12,mn('G1'),120,TPQ*2],[TPQ*13,mn('D2'),100,TPQ],[TPQ*14,mn('G1'),110,TPQ],[TPQ*14+TPQ/2,mn('F2'),95,TPQ/2],[TPQ*15,mn('G1'),100,TPQ],
    [TPQ*16,mn('C2'),120,TPQ*2],[TPQ*17,mn('G1'),100,TPQ],[TPQ*18,mn('Eb2'),110,TPQ],[TPQ*18+TPQ/2,mn('C2'),95,TPQ/2],[TPQ*19,mn('G1'),100,TPQ],
    [TPQ*20,mn('F2'),110,TPQ],[TPQ*20+TPQ/2,mn('C2'),90,TPQ],[TPQ*21,mn('F2'),100,TPQ],[TPQ*22,mn('Ab2'),110,TPQ],[TPQ*22+TPQ/2,mn('F2'),95,TPQ/2],[TPQ*23,mn('C2'),100,TPQ],
    [TPQ*24,mn('Ab1'),120,TPQ*2],[TPQ*25,mn('Eb2'),100,TPQ],[TPQ*26,mn('Ab1'),110,TPQ],[TPQ*26+TPQ/2,mn('C2'),95,TPQ/2],[TPQ*27,mn('Eb2'),100,TPQ],
    [TPQ*28,mn('G1'),120,TPQ*2],[TPQ*29,mn('F2'),100,TPQ],[TPQ*30,mn('G1'),110,TPQ],[TPQ*30+TPQ/2,mn('G1'),95,TPQ/2],[TPQ*31,mn('C3'),120,TPQ*4],
  ].forEach(([p,n,v,d]) => bassEv.push({ kind:'note', absPos:p, note:n, vel:v, duration:d, channel:0 }));

  // Drums (GM channel 10)
  const drumEv = [
    { kind: 'track_name', absPos: 0, name: 'Drums' },
    { kind: 'tempo', absPos: 0, bpm: 140 },
    { kind: 'time_sig', absPos: 0, num: 4, den: 2 },
  ];
  for (let bar = 0; bar < 8; bar++) {
    const b = bar * TPQ * 4;
    drumEv.push({kind:'note',absPos:b,note:36,vel:120,duration:TPQ,channel:9});
    drumEv.push({kind:'note',absPos:b+TPQ*2,note:36,vel:100,duration:TPQ/2,channel:9});
    drumEv.push({kind:'note',absPos:b+TPQ*3,note:36,vel:110,duration:TPQ,channel:9});
    drumEv.push({kind:'note',absPos:b+TPQ,note:38,vel:110,duration:TPQ,channel:9});
    drumEv.push({kind:'note',absPos:b+TPQ*3,note:38,vel:110,duration:TPQ,channel:9});
    for (let i = 0; i < 8; i++)
      drumEv.push({kind:'note',absPos:b+i*TPQ/2,note:42,vel:i%2?70:80,duration:TPQ/4,channel:9});
  }

  const files = [
    ['bassline.mid', [bassEv]],
    ['drums.mid', [drumEv]],
  ];

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  for (const [name, tracks] of files) {
    const data = createMidi(tracks);
    fs.writeFileSync(path.join(outputDir, name), data);
    console.log(`Created: ${name} (${data.length} bytes)`);
  }
}

// ---- Import ----

function importMidi() {
  const inDir = midiDir;
  const files = fs.readdirSync(inDir).filter(f => f.endsWith('.mid'));

  if (!fs.existsSync(projPath)) {
    console.error(`Project not found: ${projPath}`);
    process.exit(1);
  }

  const { INSTRUMENTS, importMidiToProject } = midiImport;

  const tracks = files.map(f => ({
    name: path.basename(f, '.mid'),
    midiPath: path.join(inDir, f),
    instrumentXml: INSTRUMENTS.tripleoscBase,  // default; override per-track below
  }));

  // Customize instruments based on track name
  for (const t of tracks) {
    const n = t.name.toLowerCase();
    if (n.includes('drum') || n.includes('kick'))
      t.instrumentXml = INSTRUMENTS.kicker;
    else if (n.includes('bass'))
      t.instrumentXml = INSTRUMENTS.tripleoscBase;
    else if (n.includes('lead') || n.includes('melody'))
      t.instrumentXml = INSTRUMENTS.tripleoscBase
        .replace('wavetype0="0"', 'wavetype0="2"')
        .replace('vol0="33"', 'vol0="60"')
        .replace('vol1="33"', 'vol1="0"')
        .replace('vol2="33"', 'vol2="0"');
  }

  const result = importMidiToProject(projPath, tracks);
  const totalNotes = Object.values(result.notesByTrack).reduce((s, t) => s + t.notes.length, 0);
  console.log(`Imported ${tracks.length} tracks, ${totalNotes} notes → ${projPath}`);
  console.log(`Pattern: ${result.patternLength / midiImport.LMMS_TICKS_PER_BAR} bars`);
}

// ---- Main ----

if (cmd === 'generate') {
  generate();
} else if (cmd === 'import') {
  importMidi();
} else if (cmd === 'all') {
  generate();
  importMidi();
} else {
  console.log('Usage: node lmms-midi.js <generate|import|all> [--project <name|path>] [--project-path <dir>] [--output <dir>] [--midi-dir <dir>]');
  process.exit(1);
}
