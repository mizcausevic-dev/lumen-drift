# Lumen Drift

Fifty original MIDI pad progressions for atmospheric electronic arrangements. The set is a synthwave and darkwave foundation heard through a wider ambient lens: patient harmony, small inner movements, and enough space for bass and melody.

Reference climate, not templates: the patience associated with Brian Eno, the emotional harmonic pressure associated with Jon Hopkins, the worn color associated with Boards of Canada, and the luminous major writing associated with Tycho. Nothing here is a reconstruction of a recording, and no progression is labeled as an artist's piece.

## What this is

Lumen Drift is a production library and a listening room. A composer or producer drops a loop under a sustained pad patch, then writes bass, lead, and drums around it. The MIDI contains pitch, timing, and velocity only. Lushness still depends on the instrument, the envelope, and the effects.

1. **Product.** Fifty loopable pad progressions in five groups of ten.
2. **Who it is for.** Producers writing nocturnal electronic music who want harmony already voiced for a pad, not a cue sheet of chord symbols.
3. **Why it is useful.** Each loop is a real polyphonic part: common tones are held, low clusters are avoided, and the top is usually left open.
4. **Structure.** Five groups: Suspended Light, Emotional Currents, Faded Memory, Open Horizons, Nocturnal Bloom.
5. **Discovery.** The listening room groups the loops, shows the harmony, and plays them with a simple pad synth.
6. **Engagement.** Play a loop, read the voicing, download the MIDI.
7. **Conversion.** The download is the action. There is no account and no mailing list.
8. **Money.** This release is a free portfolio library. A later licensed sample-pack edition could sell the same progressions with sounds. That edition does not exist in this repo.
9. **Launch.** Source on the main branch. The listening room is the GitHub Pages build.
10. **After launch.** Add a progression only when it survives the same duplicate and voicing checks. Do not grow the set by transposing these files.

## Groups

| Group | IDs | Role |
| --- | --- | --- |
| Suspended Light | 001-010 | Open intervals, slow change, a little ambiguity |
| Emotional Currents | 011-020 | Inner motion and controlled tension |
| Faded Memory | 021-030 | Modal color and a few borrowed chords |
| Open Horizons | 031-040 | Warmer voicings with room above the pad |
| Nocturnal Bloom | 041-050 | Darker harmony and longer blooms |

Aeolian in this set means natural minor. The collection does not list natural minor as a second name for the same set of pitches.

## Timing and pitch

- 480 ticks per quarter note.
- 4/4 only.
- Loop lengths are 4 bars (7,680 ticks), 8 bars (15,360 ticks), or 16 bars (30,720 ticks).
- Positions are zero-based. Beat 1 is tick 0.
- Authoritative timing is the integer tick. Beat columns are `ticks / 480`, rounded half-up to 9 decimal places. Validation accepts a beat that is within 0.0000000005 beats of the exact ratio.
- Tempo is an integer BPM from 70 to 115. The MIDI tempo meta is the nearest integer microseconds per quarter note, with half-up rounding of `60,000,000 / BPM`.
- C4 is MIDI note 60.
- The primary pad range is 48-84. The files also allow 36-96, and these parts rarely use the bottom of that extra range.
- Note names follow the primary pitch collection. Each scale degree is spelled from the tonic's letter, so G Dorian writes Bb rather than A#, and C Aeolian writes Eb and Ab. A tone outside the collection takes the spelling of the chord that uses it: a raised sixth borrowed into D Aeolian is B, not Cb. Cb appears when the letter is actually C flat, as in Eb Aeolian. MIDI numbers remain the authority. Every written name parses back to that MIDI number. C4 is 60. Cb4 is 59.

## Roman numerals

Romans are measured from the parallel major of the primary tonic and do not change when a passage tonicizes something else. None of these loops tonicize a new key. Borrowed chords are named in the index.

- Uppercase numerals are major-family chords, including dominant sevenths, added-tone major chords, and `7sus4` on a major degree.
- Lowercase numerals are minor-family chords, including `m(maj7)`, half-diminished `ø`, and minor-ninth chords.
- `b` and `#` mark roots altered from the parallel major. In C, Ab major is `bVI` and F minor is `iv`.
- `add6` in a roman means an added sixth. It does not mean first inversion. Inversions are described in the voicing text.
- `ø` means half-diminished, the same chord the symbol writes as `m7b5`.
- A symbol with `(no3)` or `(no5)` is missing that tone on purpose. `maj7(#11,no5)` omits the fifth so the raised eleventh is not a semitone away from it.
- `sus2`, `sus4`, and `sus4(b9)` have no third.
- Aeolian `bvii` is lowercase when the chord is minor. Phrygian `bII` is uppercase when the chord is major.

## CSV files

All three CSV files are UTF-8 with a header row. Fields that contain commas are quoted by the standard library writer. List fields are JSON arrays inside a single cell, with no spaces (`[0,2,3]`). The token `none` is the text value for an empty optional field, not a JSON array.

### `data/index.csv`

Pattern ID, progression name, collection group, MIDI filename, BPM, encoded tempo in microseconds per quarter note, primary tonal center, primary pitch collection, primary pitch-class set (C = 0), sounding pitch classes outside that collection, borrowed chords, loop length in bars, loop length in ticks, number of harmonic events, chord progression summary, voicing and voice-leading description, transition approach, suggested playback sound, optional treatment.

### `data/notes.csv`

Pattern ID, MIDI note number, note name, start tick, duration in ticks, start beat, duration in beats, velocity.

### `data/harmony.csv`

Pattern ID, event number (1-based), start tick, duration in ticks, start beat, duration in beats, chord symbol, roman numeral, intended voiced MIDI pitches, voicing and transition notes.

Harmonic-event intervals partition the loop. They do not overlap and they do not leave a gap. A note may enter late, leave early, or hang across the boundary. The event still names the harmony of that span. Intended pitches are listed separately from outgoing transition tones.

## Playback, not MIDI

The sound and treatment columns are suggestions for the person loading the file. They are not controller data. The files contain no program change, pitch bend, sustain, modulation, or expression.

Use a slow attack when the shortest harmonic event is long, and a moderate attack when a loop contains two-beat events (Inner Tide, Ember Line, and the faster Open Horizons loops). A long release will cover the small articulation gaps. It will not turn a MIDI gap into a written crossfade. Overlapping different pitches are real note overlaps. Same pitches never overlap.

Useful starting points:

- Warm saw pad, slow attack, lowpass a little open, short chorus.
- Soft filtered pad for the pieces with faster harmonic rhythm.
- Airy digital pad with a long release for the 16-bar loops.
- Dark pulse pad with a slow filter move for Phrygian and harmonic-minor pieces.
- Wide, lightly detuned pad with the highs trimmed when a melody will sit above the part.

## Common tones and the loop seam

When a pitch continues from one event into the next, it is a single MIDI note. When a pitch returns across the loop seam, it ends exactly at the loop boundary and a new note starts at tick 0. That is structural looping, not a guaranteed seamless audio loop. A synth release tail from the end can overlap the attack at the start in audio even though the MIDI notes do not overlap.

Staggered entrances delay a new upper or inner pitch by 180, 200, 240, or 360 ticks. They are still part of the intended chord. Hangs, where used, extend a departing pitch into the next event only when it stays at least three semitones from every intended pitch of that next chord and the polyphony cap still holds.

## How to regenerate

```bash
python3 tools/build_collection.py
```

The script reopens every MIDI file and writes `VALIDATION-REPORT-Cursor.md` from that parse. The zip is written only after the implemented checks pass.

## Listening room

The site in `web/` plays the same note list the MIDI files contain, through a small Web Audio pad. From `web/`:

```bash
npm install
npm run dev
```

The dev server is configured for `127.0.0.1` port `8734`. Production uses relative asset paths so the same build can sit on a project GitHub Pages URL.

The production build is static and is what GitHub Pages serves.

## Validation limits

Automated checks cover file structure, ranges, pairing of note-ons and note-offs, polyphony, same-pitch overlap, tempo encoding, CSV equality, harmonic partitions, pitch-class declarations, and duplicate or transposed note data. A score-based review reports common-tone counts, register, and shared roman sequences. That review is not a hearing test. This repository does not claim that anyone listened to the rendered audio merely because a browser synth can play it.
