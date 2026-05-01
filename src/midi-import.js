/**
 * MIDI → LMMS project import library.
 * Pure JavaScript — Node.js built-ins only (fs, zlib).
 */
const zlib = require('zlib');
const fs = require('fs');

const LMMS_TPQ = 48;           // LMMS ticks per quarter note
const LMMS_TICKS_PER_BAR = 192; // 4 quarters × 48 ticks
const MMPZ_HEADER = Buffer.from([0x00, 0x00, 0x1a, 0xb4]);

// ---- VLQ reader ----

function readVLQ(buf, offset) {
  let value = 0;
  while (true) {
    const byte = buf[offset++];
    value = (value << 7) | (byte & 0x7F);
    if (!(byte & 0x80)) break;
  }
  return { value, offset };
}

// ---- MIDI parser ----

/**
 * Parse a standard MIDI file.
 * @param {string} filepath
 * @returns {{ notes: Array<{absPos, note, vel, duration}>, ticksPerQN: number }}
 */
function parseMidi(filepath) {
  const data = fs.readFileSync(filepath);

  if (data.toString('utf8', 0, 4) !== 'MThd')
    throw new Error(`Not a valid MIDI file: ${filepath}`);

  const numTracks = data.readUInt16BE(10);
  const ticksPerQN = data.readUInt16BE(12);
  const notes = [];
  let pos = 14;

  for (let ti = 0; ti < numTracks; ti++) {
    if (data.toString('utf8', pos, pos + 4) !== 'MTrk') break;
    const trkLen = data.readUInt32BE(pos + 4);
    const trkData = data.subarray(pos + 8, pos + 8 + trkLen);
    pos += 8 + trkLen;

    let offset = 0, absTime = 0, runningStatus = null;
    const noteOns = {};  // note -> { absTime, vel }

    while (offset < trkData.length) {
      const r1 = readVLQ(trkData, offset);
      offset = r1.offset;
      absTime += r1.value;
      if (offset >= trkData.length) break;

      let status = trkData[offset];

      // Meta event
      if (status === 0xFF) {
        const r2 = readVLQ(trkData, offset + 2);
        offset = r2.offset + r2.value;
        continue;
      }

      // MIDI event (handle running status)
      if (status & 0x80) { runningStatus = status; offset++; }
      else { status = runningStatus; }

      const msgType = status >> 4;
      const ch = status & 0x0F;

      if (msgType === 0x9 && trkData[offset + 1] > 0) {
        // Note On
        const note = trkData[offset], vel = trkData[offset + 1];
        offset += 2;
        // Handle same-note overlap: close previous first
        if (noteOns[note] !== undefined) {
          const prev = noteOns[note];
          delete noteOns[note];
          notes.push({ absPos: prev.absTime, note, vel: prev.vel, duration: absTime - prev.absTime });
        }
        noteOns[note] = { absTime, vel };
      } else if (msgType === 0x8 || (msgType === 0x9 && trkData[offset + 1] === 0)) {
        // Note Off
        const note = trkData[offset];
        offset += 2;
        if (noteOns[note] !== undefined) {
          const prev = noteOns[note];
          delete noteOns[note];
          notes.push({ absPos: prev.absTime, note, vel: prev.vel, duration: absTime - prev.absTime });
        }
      } else if (msgType === 0xC) offset += 1;
      else if (msgType === 0xB || msgType === 0xE) offset += 2;
      else offset += 1;
    }

    // Close dangling notes
    for (const [n, prev] of Object.entries(noteOns)) {
      notes.push({ absPos: prev.absTime, note: parseInt(n), vel: prev.vel, duration: 1 });
    }
  }

  notes.sort((a, b) => a.absPos - b.absPos);
  return { notes, ticksPerQN };
}

// ---- Tick conversion ----

function midiToLmms(midiTick, midiTpq) {
  return Math.round(midiTick * LMMS_TPQ / midiTpq);
}

// ---- LMMS XML builders ----

/**
 * Build a <pattern> XML element with all notes.
 * @returns {string} XML fragment
 */
function buildPatternXml(name, notes, midiTpq, totalSteps) {
  const lines = [];
  for (const n of notes) {
    const pos = midiToLmms(n.absPos, midiTpq);
    const dur = Math.max(midiToLmms(n.duration, midiTpq), 1);
    lines.push(`      <note key="${n.note}" len="${dur}" pos="${pos}" vol="${n.vel}" pan="0"/>`);
  }
  return `<pattern type="1" muted="0" name="${name}" steps="${totalSteps}" pos="0">
${lines.join('\n')}
    </pattern>`;
}

/**
 * Calculate pattern length in LMMS ticks, rounded up to bar boundary.
 */
function calculatePatternLength(notes, midiTpq) {
  let maxEnd = 0;
  for (const n of notes) {
    maxEnd = Math.max(maxEnd, midiToLmms(n.absPos, midiTpq) + midiToLmms(n.duration, midiTpq));
  }
  return (Math.floor(maxEnd / LMMS_TICKS_PER_BAR) + 1) * LMMS_TICKS_PER_BAR;
}

// ---- LMMS instrument XML presets ----

const INSTRUMENTS = {
  tripleoscBase: `<instrument name="tripleoscillator">
            <tripleoscillator pan0="0" coarse2="-24" userwavefile1="" finer1="0" finel0="0" coarse1="-12" stphdetun1="0" modalgo1="2" vol2="33" finel1="0" wavetype1="0" finer2="0" finel2="0" modalgo3="2" vol0="33" stphdetun0="0" phoffset1="0" phoffset2="0" wavetype2="0" wavetype0="0" stphdetun2="0" phoffset0="0" modalgo2="2" pan2="0" vol1="33" coarse0="0" userwavefile2="" finer0="0" userwavefile0="" pan1="0"/>
          </instrument>
          <eldata fres="0.5" ftype="0" fcut="14000" fwet="0">
            <elvol att="0" lamt="0" hold="0.5" lspd="0.1" rel="0.1" lspd_syncmode="0" lspd_numerator="4" ctlenvamt="0" amt="0" pdel="0" userwavefile="" dec="0.5" lspd_denominator="4" latt="0" x100="0" sustain="0.5" lshp="0" lpdel="0"/>
            <elcut att="0" lamt="0" hold="0.5" lspd="0.1" rel="0.1" lspd_syncmode="0" lspd_numerator="4" ctlenvamt="0" amt="0" pdel="0" userwavefile="" dec="0.5" lspd_denominator="4" latt="0" x100="0" sustain="0.5" lshp="0" lpdel="0"/>
            <elres att="0" lamt="0" hold="0.5" lspd="0.1" rel="0.1" lspd_syncmode="0" lspd_numerator="4" ctlenvamt="0" amt="0" pdel="0" userwavefile="" dec="0.5" lspd_denominator="4" latt="0" x100="0" sustain="0.5" lshp="0" lpdel="0"/>
          </eldata>
          <chordcreator chord="0" chordrange="1" chord-enabled="0"/>
          <arpeggiator arptime_numerator="4" arpdir="0" arpskip="0" arpmiss="0" arpcycle="0" arpgate="100" arp-enabled="0" arprange="1" arptime="100" arpmode="0" arptime_denominator="4" arptime_syncmode="0" arp="0"/>
          <midiport outputchannel="1" outputcontroller="0" fixedoutputvelocity="-1" readable="0" inputcontroller="0" basevelocity="63" writable="0" inputchannel="0" outputprogram="1" fixedoutputnote="-1" fixedinputvelocity="-1"/>
          <fxchain enabled="0" numofeffects="0"/>`,

  kicker: `<instrument name="kicker">
            <kicker decay_syncmode="0" noise="0" decay_denominator="4" gain="1" click="0.4" slope="0.06" decay_numerator="4" decay="440" endfreq="40" version="1" startfreq="150" dist="0.8" distend="0.8" env="0.163" startnote="1" endnote="0"/>
          </instrument>
          <eldata fres="0.5" ftype="0" fcut="14000" fwet="0">
            <elvol att="0" lamt="0" hold="0.5" lspd="0.1" rel="0.1" lspd_syncmode="0" lspd_numerator="4" ctlenvamt="0" amt="0" pdel="0" userwavefile="" dec="0.5" lspd_denominator="4" latt="0" x100="0" sustain="0.5" lshp="0" lpdel="0"/>
            <elcut att="0" lamt="0" hold="0.5" lspd="0.1" rel="0.1" lspd_syncmode="0" lspd_numerator="4" ctlenvamt="0" amt="0" pdel="0" userwavefile="" dec="0.5" lspd_denominator="4" latt="0" x100="0" sustain="0.5" lshp="0" lpdel="0"/>
            <elres att="0" lamt="0" hold="0.5" lspd="0.1" rel="0.1" lspd_syncmode="0" lspd_numerator="4" ctlenvamt="0" amt="0" pdel="0" userwavefile="" dec="0.5" lspd_denominator="4" latt="0" x100="0" sustain="0.5" lshp="0" lpdel="0"/>
          </eldata>
          <chordcreator chord="0" chordrange="1" chord-enabled="0"/>
          <arpeggiator arptime_numerator="4" arpdir="0" arpskip="0" arpmiss="0" arpcycle="0" arpgate="100" arp-enabled="0" arprange="1" arptime="100" arpmode="0" arptime_denominator="4" arptime_syncmode="0" arp="0"/>
          <midiport outputchannel="1" outputcontroller="0" fixedoutputvelocity="-1" readable="0" inputcontroller="0" basevelocity="63" writable="0" inputchannel="0" outputprogram="1" fixedoutputnote="-1" fixedinputvelocity="-1"/>
          <fxchain enabled="0" numofeffects="0"/>`,
};

/**
 * Build custom instrument XML by applying overrides to a base preset.
 * @param {'tripleosc'|'kicker'} preset
 * @param {Object} overrides - key/value pairs to replace in the XML string
 * @returns {string}
 */
function buildInstrumentXml(preset, overrides) {
  let base = preset === 'kicker' ? INSTRUMENTS.kicker : INSTRUMENTS.tripleoscBase;
  for (const [k, v] of Object.entries(overrides)) {
    base = base.replace(new RegExp(`${k}="[^"]*"`, 'g'), `${k}="${v}"`);
  }
  return base;
}

/**
 * Build a complete <track> XML fragment.
 */
function buildTrackXml(trackName, instrumentXml, patternXml) {
  return `<track type="0" muted="0" name="${trackName}" solo="0">
    <instrumenttrack fxch="0" vol="100" pitch="0" pitchrange="1" basenote="57" pan="0" usemasterpitch="1">
${instrumentXml}
    </instrumenttrack>
${patternXml}
  </track>`;
}

// ---- Project-level operations ----

/**
 * Read and decompress a .mmpz project file.
 * @returns {string} XML content
 */
function readProject(filepath) {
  const raw = fs.readFileSync(filepath);
  return zlib.inflateSync(raw.subarray(4)).toString('utf8');
}

/**
 * Compress and write a .mmpz project file.
 */
function writeProject(filepath, xml) {
  const compressed = zlib.deflateSync(xml);
  fs.writeFileSync(filepath, Buffer.concat([MMPZ_HEADER, compressed]));
}

/**
 * Inject track XML fragments into the project's song trackcontainer.
 * @param {string} xml - full project XML
 * @param {string[]} trackXmls - array of <track> XML fragments to insert
 * @returns {string} modified XML
 */
function injectTracks(xml, trackXmls) {
  // Find song trackcontainer
  const songStart = xml.indexOf('<song>');
  let tcOpen = xml.indexOf('<trackcontainer', songStart);
  while (tcOpen !== -1) {
    const tagClose = xml.indexOf('>', tcOpen);
    if (xml.substring(tcOpen, tagClose + 1).includes('type="song"')) break;
    tcOpen = xml.indexOf('<trackcontainer', tagClose + 1);
  }
  if (tcOpen === -1) throw new Error('Song trackcontainer not found');

  // Find matching close tag
  let depth = 0, tcClose = -1;
  for (let i = tcOpen; i < xml.length; i++) {
    if (xml.startsWith('<trackcontainer', i) && (xml[i + 15] === ' ' || xml[i + 15] === '>')) {
      depth++;
    } else if (xml.startsWith('</trackcontainer>', i)) {
      depth--;
      if (depth === 0) { tcClose = i + 17; break; }
    }
  }
  if (tcClose === -1) throw new Error('Could not find closing </trackcontainer>');

  const insertPos = tcClose - 17;  // before closing tag
  const insertXml = '\n' + trackXmls.join('\n') + '\n    ';
  return xml.slice(0, insertPos) + insertXml + xml.slice(insertPos);
}

/**
 * Full import: parse MIDI files and inject into an LMMS project.
 * @param {string} projectPath - path to .mmpz file
 * @param {Array<{name: string, midiPath: string, instrumentXml: string}>} tracks
 * @returns {{ notesByTrack: Object, patternLength: number }}
 */
function importMidiToProject(projectPath, tracks) {
  const xml = readProject(projectPath);

  // Parse all MIDI files
  const notesByTrack = {};
  let maxEnd = 0;
  for (const t of tracks) {
    const { notes, ticksPerQN } = parseMidi(t.midiPath);
    notesByTrack[t.name] = { notes, ticksPerQN };
    for (const n of notes) {
      maxEnd = Math.max(maxEnd, midiToLmms(n.absPos, ticksPerQN) + midiToLmms(n.duration, ticksPerQN));
    }
  }

  const patternLength = (Math.floor(maxEnd / LMMS_TICKS_PER_BAR) + 1) * LMMS_TICKS_PER_BAR;

  // Build track XMLs
  const trackXmls = [];
  for (const t of tracks) {
    const { notes, ticksPerQN } = notesByTrack[t.name];
    const patXml = buildPatternXml(t.name, notes, ticksPerQN, patternLength);
    trackXmls.push(buildTrackXml(t.name, t.instrumentXml, patXml));
  }

  const newXml = injectTracks(xml, trackXmls);
  writeProject(projectPath, newXml);

  return { notesByTrack, patternLength };
}

module.exports = {
  LMMS_TPQ, LMMS_TICKS_PER_BAR, MMPZ_HEADER,
  readVLQ, parseMidi, midiToLmms,
  buildPatternXml, calculatePatternLength,
  buildInstrumentXml, buildTrackXml,
  INSTRUMENTS,
  readProject, writeProject, injectTracks, importMidiToProject,
};
