/**
 * MIDI file generation library.
 * Pure JavaScript — no dependencies beyond Node.js Buffer.
 */
const TPQ = 480; // ticks per quarter note (standard PPQN)

const NOTE_NAMES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

// ---- VLQ encoding (big-endian, MSB first) ----

function writeVLQ(value) {
  const groups = [];
  do { groups.push(value & 0x7F); value >>= 7; } while (value > 0);
  const buf = Buffer.alloc(groups.length);
  for (let i = 0; i < groups.length; i++) {
    let byte = groups[groups.length - 1 - i];
    if (i < groups.length - 1) byte |= 0x80;
    buf[i] = byte;
  }
  return buf;
}

// ---- Note name conversion ----

function midiNote(name) {
  if (typeof name === 'number') return name;
  const noteName = name.slice(0, -1);
  const octave = parseInt(name.slice(-1));
  return (octave + 1) * 12 + NOTE_NAMES[noteName];
}

// ---- MIDI file builder ----

/**
 * Create a standard MIDI file (format 1).
 * @param {Array[]} tracksData - array of track event arrays.
 *   Each event: { kind, absPos, ... }
 *     note:   { kind:'note', absPos, note, vel, duration, channel }
 *     meta:   { kind:'track_name'|'tempo'|'time_sig'|'program', absPos, ... }
 * @param {number} [ticksPerQuarter=480]
 * @returns {Buffer} complete .mid file
 */
function createMidi(tracksData, ticksPerQuarter) {
  const tpq = ticksPerQuarter || TPQ;

  // Header
  const header = Buffer.alloc(14);
  header.write('MThd', 0);
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(1, 8);          // format 1
  header.writeUInt16BE(tracksData.length, 10);
  header.writeUInt16BE(tpq, 12);

  const parts = [header];

  for (const rawEvents of tracksData) {
    // Collect all MIDI stream events sorted by absolute time
    const stream = [];

    for (const ev of rawEvents) {
      if (ev.kind === 'note') {
        stream.push({ absTime: ev.absPos, priority: 0,
          data: Buffer.from([0x90 | ev.channel, ev.note, ev.vel]) });
        stream.push({ absTime: ev.absPos + ev.duration, priority: 1,
          data: Buffer.from([0x80 | ev.channel, ev.note, 0]) });
      } else if (ev.kind === 'track_name') {
        const nameBuf = Buffer.from(ev.name, 'latin1');
        const lenVLQ = writeVLQ(nameBuf.length);
        stream.push({ absTime: ev.absPos, priority: 0,
          data: Buffer.concat([Buffer.from([0xFF, 0x03]), lenVLQ, nameBuf]) });
      } else if (ev.kind === 'program') {
        stream.push({ absTime: ev.absPos, priority: 0,
          data: Buffer.from([0xC0 | ev.channel, ev.prog]) });
      } else if (ev.kind === 'tempo') {
        const usPerQN = Math.round(60000000 / ev.bpm);
        const tb = Buffer.alloc(3);
        tb.writeUIntBE(usPerQN, 0, 3);
        stream.push({ absTime: ev.absPos, priority: 0,
          data: Buffer.concat([Buffer.from([0xFF, 0x51, 0x03]), tb]) });
      } else if (ev.kind === 'time_sig') {
        const num = ev.num || 4, den = ev.den || 2;
        stream.push({ absTime: ev.absPos, priority: 0,
          data: Buffer.from([0xFF, 0x58, 0x04, num, den, 24, 8]) });
      }
    }

    // Sort and write with deltas
    stream.sort((a, b) => a.absTime - b.absTime || a.priority - b.priority);

    const chunks = [];
    let cursor = 0;
    for (const item of stream) {
      const delta = Math.max(0, item.absTime - cursor);
      cursor = item.absTime;
      chunks.push(writeVLQ(delta), item.data);
    }
    chunks.push(writeVLQ(0), Buffer.from([0xFF, 0x2F, 0x00]));

    const trackData = Buffer.concat(chunks);
    const trkHeader = Buffer.alloc(8);
    trkHeader.write('MTrk', 0);
    trkHeader.writeUInt32BE(trackData.length, 4);
    parts.push(trkHeader, trackData);
  }

  return Buffer.concat(parts);
}

// ---- GM instrument lookup ----

const GM_INSTRUMENTS = {
  piano: 0, 'acoustic grand': 0, 'bright piano': 1, 'electric piano': 4,
  guitar: 24, 'nylon guitar': 24, 'steel guitar': 25, 'jazz guitar': 26,
  'electric guitar clean': 27, 'electric guitar muted': 28,
  bass: 33, 'electric bass finger': 33, 'electric bass pick': 34, 'fretless bass': 35,
  'slap bass': 36, 'synth bass': 38,
  strings: 48, 'string ensemble': 48, 'slow strings': 49,
  'choir aahs': 52, 'voice oohs': 53,
  'synth lead': 80, 'lead square': 80, 'lead sawtooth': 81, 'lead voice': 85,
  'pad warm': 89, 'pad polysynth': 90, 'pad new age': 88,
  trumpet: 56, trombone: 57, flute: 73, clarinet: 71,
};

const DRUM_MAP = {
  kick: 36, bassdrum: 36, snare: 38, rimshot: 37,
  'closed hh': 42, 'closed hihat': 42, 'open hh': 46, 'open hihat': 46,
  crash: 49, 'ride cymbal': 51, clap: 39, 'hand clap': 39,
  'low tom': 41, 'mid tom': 47, 'high tom': 50,
};

module.exports = {
  TPQ, writeVLQ, midiNote, createMidi, GM_INSTRUMENTS, DRUM_MAP,
};
