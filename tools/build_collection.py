#!/usr/bin/env python3
"""Build, validate, and package the Lumen Drift MIDI pad collection.

Run from the repo root:

    python3 tools/build_collection.py

No third-party packages. The standard library writes Format 0 MIDI, CSV,
JSON, the README, the validation report, and the zip.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import shutil
import struct
import sys
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from itertools import combinations, product
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from progressions import PATTERNS

ROOT = Path(__file__).resolve().parents[1]
TPQ = 480
LO_NOTE = 48
HI_NOTE = 84
ABS_LO = 36
ABS_HI = 96

MODES = {
    "Aeolian": (0, 2, 3, 5, 7, 8, 10),
    "Dorian": (0, 2, 3, 5, 7, 9, 10),
    "Phrygian": (0, 1, 3, 5, 7, 8, 10),
    "Harmonic minor": (0, 2, 3, 5, 7, 8, 11),
    "Ionian": (0, 2, 4, 5, 7, 9, 11),
    "Mixolydian": (0, 2, 4, 5, 7, 9, 10),
    "Lydian": (0, 2, 4, 6, 7, 9, 11),
}

QUALITIES = {
    "m": (0, 3, 7),
    "maj": (0, 4, 7),
    "m7": (0, 3, 7, 10),
    "maj7": (0, 4, 7, 11),
    "7": (0, 4, 7, 10),
    "m9": (0, 3, 7, 10, 14),
    "maj9": (0, 4, 7, 11, 14),
    "9": (0, 4, 7, 10, 14),
    "m6": (0, 3, 7, 9),
    "6": (0, 4, 7, 9),
    "add9": (0, 4, 7, 14),
    "madd9": (0, 3, 7, 14),
    "sus2": (0, 2, 7),
    "sus4": (0, 5, 7),
    "7sus4": (0, 5, 7, 10),
    "m7add11": (0, 3, 7, 10, 17),
    "madd11": (0, 3, 7, 17),
    "m11no3": (0, 7, 10, 14, 17),
    "maj9no3": (0, 7, 11, 14),
    "6add9": (0, 4, 7, 9, 14),
    "maj7sharp11": (0, 4, 11, 18),
    "m7b5": (0, 3, 6, 10),
    "mmaj7": (0, 3, 7, 11),
    "mmaj9": (0, 3, 7, 11, 14),
    "sus4b9": (0, 1, 5, 7),
    "maj7no5": (0, 4, 11),
    "add9no5": (0, 4, 14),
    "7no5": (0, 4, 10),
    "maj7add13": (0, 4, 7, 11, 21),
}

SUFFIX = {
    "m": "m",
    "maj": "",
    "m7": "m7",
    "maj7": "maj7",
    "7": "7",
    "m9": "m9",
    "maj9": "maj9",
    "9": "9",
    "m6": "m6",
    "6": "6",
    "add9": "add9",
    "madd9": "m(add9)",
    "sus2": "sus2",
    "sus4": "sus4",
    "7sus4": "7sus4",
    "m7add11": "m7(add11)",
    "madd11": "m(add11)",
    "m11no3": "m11(no3)",
    "maj9no3": "maj9(no3)",
    "6add9": "6/9",
    "maj7sharp11": "maj7(#11,no5)",
    "m7b5": "m7b5",
    "mmaj7": "m(maj7)",
    "mmaj9": "m(maj9)",
    "sus4b9": "sus4(b9)",
    "maj7no5": "maj7(no5)",
    "add9no5": "add9(no5)",
    "7no5": "7(no5)",
    "maj7add13": "maj7(add13)",
}

MINOR_Q = {
    "m", "m7", "m9", "m6", "madd9", "m7add11", "madd11", "m11no3",
    "m7b5", "mmaj7", "mmaj9",
}
MAJOR_Q = {
    "maj", "maj7", "7", "maj9", "9", "6", "add9", "6add9", "maj7sharp11",
    "maj9no3", "7sus4", "maj7no5", "add9no5", "7no5", "maj7add13",
}

LETTERS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
LETTER_CYCLE = ["C", "D", "E", "F", "G", "A", "B"]
NATURAL_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
# Semitone interval above a chord root, mapped to the diatonic letter offset.
# 6 is a diminished fifth (letter of the fifth). 18 is a raised eleventh (letter of the fourth).
LETTER_OFFSET = {
    0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4,
    8: 5, 9: 5, 10: 6, 11: 6, 14: 1, 17: 3, 18: 3, 21: 5,
}

GROUP_ORDER = [
    "Suspended Light",
    "Emotional Currents",
    "Faded Memory",
    "Open Horizons",
    "Nocturnal Bloom",
]

GROUP_BLURB = {
    "Suspended Light": "Spacious harmony, patient changes, open intervals, and a little ambiguity.",
    "Emotional Currents": "Inner lines that move one voice at a time, with tension that resolves slowly.",
    "Faded Memory": "Bittersweet modal color, a little chromatic doubt, and chords that do not quite settle.",
    "Open Horizons": "Warm voicings with the top of the pad kept clear for a melody.",
    "Nocturnal Bloom": "Darker harmony, suspended cadences, and registers that open over long loops.",
}


def parse_note(name: str) -> int:
    match = re.fullmatch(r"([A-G])([b#]?)(-?\d+)", name)
    if not match:
        raise ValueError(name)
    letter, acc, octave = match.group(1), match.group(2), int(match.group(3))
    pc = LETTERS[letter]
    if acc == "#":
        pc += 1
    elif acc == "b":
        pc -= 1
    return (octave + 1) * 12 + pc


def pitch_class(root: str) -> int:
    return parse_note(root + "4") % 12


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def beat_str(ticks: int) -> str:
    quant = (Decimal(ticks) / Decimal(TPQ)).quantize(Decimal("0.000000000"), rounding=ROUND_HALF_UP)
    return format(quant, "f")


def encode_mpqn(bpm: int) -> int:
    return int((Decimal(60_000_000) / Decimal(bpm)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def accidental_name(delta: int) -> str:
    return {0: "", 1: "#", -1: "b", 2: "##", -2: "bb"}[delta]


def closest_delta(actual: int, natural: int) -> int:
    delta = (actual - natural) % 12
    if delta > 6:
        delta -= 12
    if abs(delta) > 2:
        raise ValueError(f"accidental {delta} from natural {natural} to {actual}")
    return delta


def _named(letter_index: int, offset: int, actual: int) -> tuple[str, int]:
    letter = LETTER_CYCLE[(letter_index + offset) % 7]
    natural = NATURAL_PC[letter]
    delta = closest_delta(actual, natural)
    return letter + accidental_name(delta), natural + delta


def scale_spelling(tonic: str, mode: str) -> dict[int, tuple[str, int]]:
    """Pitch class to (name without octave, unwrapped pitch class for octave math)."""
    letter_index = LETTER_CYCLE.index(tonic[0])
    tonic_pc = pitch_class(tonic)
    spelling: dict[int, tuple[str, int]] = {}
    for degree, interval in enumerate(MODES[mode]):
        actual = (tonic_pc + interval) % 12
        spelling[actual] = _named(letter_index, degree, actual)
    return spelling


def chord_spelling(root: str, quality: str) -> dict[int, tuple[str, int]]:
    letter_index = LETTER_CYCLE.index(root[0])
    root_pc = pitch_class(root)
    spelling: dict[int, tuple[str, int]] = {}
    for interval in QUALITIES[quality]:
        if interval not in LETTER_OFFSET:
            raise ValueError(f"no letter offset for interval {interval}")
        actual = (root_pc + interval) % 12
        spelling[actual] = _named(letter_index, LETTER_OFFSET[interval], actual)
    return spelling


def pattern_spelling(tonic: str, mode: str, specs: list[dict]) -> dict[int, tuple[str, int]]:
    """Scale spelling wins. Outside tones take the spelling of the chord that uses them."""
    spelling = scale_spelling(tonic, mode)
    scale_pcs = set(spelling)
    for spec in specs:
        for pc, entry in chord_spelling(spec["root"], spec["quality"]).items():
            if pc in scale_pcs:
                continue
            previous = spelling.get(pc)
            if previous is not None and previous != entry:
                raise RuntimeError(f"pitch class {pc} spelled {previous[0]} and {entry[0]}")
            spelling[pc] = entry
    return spelling


def spell_pitch(midi: int, spelling: dict[int, tuple[str, int]]) -> str:
    name, spelled_pc = spelling[midi % 12]
    octave = (midi - spelled_pc) // 12 - 1
    return f"{name}{octave}"


def vlq(n: int) -> bytes:
    buffer = [n & 0x7F]
    n >>= 7
    while n:
        buffer.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(buffer))


def read_vlq(data: bytes, index: int) -> tuple[int, int]:
    value = 0
    while True:
        byte = data[index]
        index += 1
        value = (value << 7) | (byte & 0x7F)
        if not (byte & 0x80):
            return value, index


@dataclass
class HarmEvent:
    number: int
    start: int
    end: int
    symbol: str
    roman: str
    comment: str
    pitches: list[int]
    velocity: dict[int, int]
    entry_delay: dict[int, int] = field(default_factory=dict)

    @property
    def dur(self) -> int:
        return self.end - self.start


@dataclass
class Built:
    pattern: dict
    events: list[HarmEvent]
    notes: list[tuple[int, int, int, int]]  # pitch, start, dur, vel
    pcs: list[int]
    outside: list[int]
    spelling: dict
    mpqn: int
    loop_ticks: int
    filename: str
    hang_used: int


def collection_pcs(tonic: str, mode: str) -> list[int]:
    tonic_pc = pitch_class(tonic)
    return sorted((tonic_pc + step) % 12 for step in MODES[mode])


def chord_symbol(root: str, quality: str) -> str:
    return f"{root}{SUFFIX[quality]}"


def third_interval(quality: str) -> int | None:
    intervals = QUALITIES[quality]
    if 4 in intervals:
        return 4
    if 3 in intervals:
        return 3
    return None


def valid_voicing(notes: tuple[int, ...], strict: bool) -> bool:
    ordered = tuple(sorted(notes))
    if len(ordered) != len(set(ordered)):
        return False
    if len(ordered) < 3 or len(ordered) > 6:
        return False
    if any(n < LO_NOTE or n > HI_NOTE for n in ordered):
        return False
    if sum(n < 50 for n in ordered) > 1:
        return False
    if strict and sum(n < 55 for n in ordered) > 2:
        return False
    for left, right in zip(ordered, ordered[1:]):
        if right - left <= 2:
            return False
    if strict and ordered[-1] - ordered[0] < 7:
        return False
    return True


def voicing_options(root_pc: int, intervals: tuple[int, ...]) -> list[tuple[int, ...]]:
    pcs = [ (root_pc + (interval % 12)) % 12 for interval in intervals ]
    # Preserve a stable, unique order with the root first.
    unique = []
    for pc in pcs:
        if pc not in unique:
            unique.append(pc)
    choices = []
    for pc in unique:
        found = [n for n in range(LO_NOTE, HI_NOTE + 1) if n % 12 == pc]
        if not found:
            return []
        choices.append(found)
    found_options = []
    for combo in product(*choices):
        notes = tuple(sorted(set(combo)))
        if len(notes) != len(unique):
            continue
        if valid_voicing(notes, True) or valid_voicing(notes, False):
            found_options.append(notes)
    if len(unique) <= 3:
        others = choices[1:]
        roots = choices[0]
        for pair in combinations(roots, 2):
            for combo in product(*others) if others else [()]:
                notes = tuple(sorted(set(pair).union(combo)))
                if len(notes) == len(unique) + 1 and (valid_voicing(notes, True) or valid_voicing(notes, False)):
                    found_options.append(notes)
    # Prefer strict voicings. Keep relaxed ones only as backup.
    strict = [n for n in found_options if valid_voicing(n, True)]
    return strict or found_options


def motion(prev: tuple[int, ...], notes: tuple[int, ...]) -> int:
    unused = set(range(len(prev)))
    total = 0
    for note in notes:
        best_index = None
        best_distance = 999
        for index in unused:
            distance = abs(note - prev[index])
            if distance < best_distance:
                best_distance = distance
                best_index = index
        if best_index is None:
            total += 7
        else:
            unused.remove(best_index)
            total += best_distance
    total += 5 * len(unused)
    return total


def register_for(pattern: dict, index: int, count: int) -> tuple[int, int]:
    low, high = pattern["register"]
    if pattern["climb"] and count > 1:
        shift = round(8 * index / (count - 1))
        low += shift
        high = min(HI_NOTE, high + shift)
    return low, high


def score_voicing(
    notes: tuple[int, ...],
    prev: tuple[int, ...] | None,
    root_pc: int,
    third: int | None,
    low: int,
    high: int,
    anchor: str,
    seam: tuple[int, ...] | None,
) -> int:
    score = 0
    if prev is not None:
        score += len(set(prev) & set(notes)) * 140
        score -= motion(prev, notes) * 8
    else:
        if notes[0] % 12 == root_pc:
            score += 30
        elif len(notes) > 1 and notes[1] % 12 == root_pc:
            score += 12
    if any(n % 12 == root_pc for n in notes):
        score += 40
    else:
        score -= 80
    if third is not None and any((n - root_pc) % 12 == third for n in notes):
        score += 20
    for note in notes:
        if low <= note <= high:
            score += 6
        else:
            score -= 10
        if note < 50:
            score -= 8
        if note > 81:
            score -= 6
    bands = {"low": (50, 60), "mid": (52, 65), "high": (57, 70)}
    band_low, band_high = bands[anchor]
    if band_low <= notes[0] <= band_high:
        score += 24
    span = notes[-1] - notes[0]
    if 12 <= span <= 24:
        score += 16
    elif span > 28:
        score -= 10
    if len(notes) == 4:
        score += 6
    elif len(notes) == 5:
        score += 4
    if seam is not None:
        score += len(set(notes) & set(seam)) * 180
    return score


def voice_events(pattern: dict, specs: list[dict]) -> list[tuple[int, ...]]:
    cached = [voicing_options(spec["root_pc"], spec["intervals"]) for spec in specs]
    for index, options in enumerate(cached):
        if not options:
            raise RuntimeError(f"{pattern['id']} event {index + 1} {specs[index]['symbol']} has no legal voicing")
    count = len(specs)
    first_scores = []
    low, high = register_for(pattern, 0, count)
    for option in cached[0]:
        value = score_voicing(option, None, specs[0]["root_pc"], specs[0]["third"], low, high, pattern["anchor"], None)
        first_scores.append((value, option))
    first_scores.sort(key=lambda item: (-item[0], item[1]))
    beam = [(score, (notes,)) for score, notes in first_scores[:10]]
    for index in range(1, count):
        low, high = register_for(pattern, index, count)
        nxt = []
        last = index == count - 1
        for running, voices in beam:
            prev = voices[-1]
            seam = voices[0] if last else None
            ranked = []
            for option in cached[index]:
                value = score_voicing(
                    option, prev, specs[index]["root_pc"], specs[index]["third"],
                    low, high, pattern["anchor"], seam,
                )
                ranked.append((value, option))
            ranked.sort(key=lambda item: (-item[0], item[1]))
            for value, option in ranked[:8]:
                nxt.append((running + value, voices + (option,)))
        nxt.sort(key=lambda item: (-item[0], item[1]))
        beam = nxt[:8]
    return list(beam[0][1])


def velocity_for(pitch: int, event_index: int) -> int:
    value = 68
    if pitch < 55:
        value -= 6
    elif pitch >= 76:
        value -= 8
    value += (event_index % 5) - 2
    return max(52, min(84, value))


def assign_stagger(events: list[HarmEvent], kind: str) -> None:
    spec = {
        "none": [],
        "air": [(0, 240)],
        "bloom": [(0, 360), (1, 180)],
        "inner": [(1, 200)],
    }[kind]
    for index, event in enumerate(events):
        previous = set(events[-1].pitches) if index == 0 else set(events[index - 1].pitches)
        fresh = sorted((pitch for pitch in event.pitches if pitch not in previous), reverse=True)
        delays = {}
        room = event.dur - 360
        for rank, delay in spec:
            if rank < len(fresh) and delay <= room:
                delays[fresh[rank]] = delay
        event.entry_delay = delays


def render_notes(events: list[HarmEvent], loop_ticks: int, gap: int, hang: int) -> tuple[list[tuple[int, int, int, int]], int]:
    """Return notes and the hang length that survived collision checks."""

    def build(hang_ticks: int) -> list[tuple[int, int, int, int]]:
        by_pitch = defaultdict(list)
        for index, event in enumerate(events):
            for pitch in event.pitches:
                by_pitch[pitch].append(index)
        notes = []
        for pitch, indices in by_pitch.items():
            groups = []
            current = [indices[0]]
            for index in indices[1:]:
                if index == current[-1] + 1:
                    current.append(index)
                else:
                    groups.append(current)
                    current = [index]
            groups.append(current)
            for group in groups:
                first = events[group[0]]
                last = events[group[-1]]
                start = first.start + first.entry_delay.get(pitch, 0)
                seam = group[-1] == len(events) - 1 and pitch in events[0].pitches
                if seam:
                    end = loop_ticks
                else:
                    boundary = last.end
                    applied_gap = min(gap, max(40, (boundary - start) // 4))
                    end = boundary - applied_gap
                    if hang_ticks and boundary < loop_ticks:
                        nxt = events[group[-1] + 1]
                        hang_end = min(boundary + hang_ticks, nxt.end, loop_ticks)
                        too_close = any(abs(pitch - other) <= 2 for other in nxt.pitches)
                        if hang_end > boundary and not too_close:
                            end = hang_end
                if end <= start:
                    raise RuntimeError(f"non-positive duration for pitch {pitch}")
                notes.append((pitch, start, end - start, first.velocity[pitch]))
        notes.sort(key=lambda item: (item[1], item[0], item[2]))
        return notes

    def problems(notes: list[tuple[int, int, int, int]]) -> str | None:
        active: dict[int, int] = defaultdict(int)
        changes = []
        for pitch, start, dur, _vel in notes:
            changes.append((start, 1, pitch))
            changes.append((start + dur, -1, pitch))
        changes.sort(key=lambda item: (item[0], item[1]))
        for _time, kind, pitch in changes:
            if kind < 0:
                active[pitch] -= 1
                if active[pitch] == 0:
                    del active[pitch]
            else:
                active[pitch] += 1
                if active[pitch] > 1:
                    return "same-pitch overlap"
                if sum(active.values()) > 12:
                    return "polyphony"
        return None

    notes = build(hang)
    if hang and problems(notes):
        return build(0), 0
    issue = problems(notes)
    if issue:
        raise RuntimeError(issue)
    return notes, hang


def assert_distinct_harmony(ident: str, events: list[HarmEvent]) -> None:
    """Consecutive identical voicings are not new events. The same pitch-class
    set may return only as the last chord, and only when the symbol matches the first."""
    for index in range(1, len(events)):
        if events[index].pitches == events[index - 1].pitches:
            raise RuntimeError(f"{ident} consecutive identical voicing at event {index + 1}")
    classes = [tuple(sorted({pitch % 12 for pitch in event.pitches})) for event in events]
    last = len(events) - 1
    for left in range(len(events)):
        for right in range(left + 1, len(events)):
            if classes[left] != classes[right]:
                continue
            returning = left == 0 and right == last and events[left].symbol == events[right].symbol
            if returning:
                continue
            raise RuntimeError(
                f"{ident} events {left + 1} and {right + 1} share pitch classes "
                f"{classes[left]} ({events[left].symbol} / {events[right].symbol})"
            )


def check_roman(quality: str, roman: str, ident: str) -> None:
    match = re.search(r"[ivIV]+", roman)
    if not match:
        raise RuntimeError(f"{ident} roman {roman}")
    letters = match.group(0)
    if quality in MINOR_Q and not letters.islower():
        raise RuntimeError(f"{ident} minor quality {quality} has roman {roman}")
    if quality in MAJOR_Q and not letters.isupper():
        raise RuntimeError(f"{ident} major quality {quality} has roman {roman}")


def build_pattern(pattern: dict) -> Built:
    ident = pattern["id"]
    if pattern["mode"] not in MODES:
        raise RuntimeError(ident)
    pcs = collection_pcs(pattern["tonic"], pattern["mode"])
    theoretical_outside = set()
    specs = []
    start_beat = 0
    for event_index, event in enumerate(pattern["events"], start=1):
        dur_beats, root, quality, roman, comment = event
        if quality not in QUALITIES:
            raise RuntimeError(f"{ident} unknown quality {quality}")
        check_roman(quality, roman, f"{ident}:{event_index}")
        if "sus" in quality and "no third" not in comment.lower():
            raise RuntimeError(f"{ident}:{event_index} sus comment must say the third is absent")
        intervals = QUALITIES[quality]
        root_pc = pitch_class(root)
        for interval in intervals:
            theoretical_outside.add((root_pc + (interval % 12)) % 12)
        specs.append({
            "dur_beats": dur_beats,
            "root": root,
            "quality": quality,
            "roman": roman,
            "comment": comment,
            "intervals": intervals,
            "root_pc": root_pc,
            "third": third_interval(quality),
            "symbol": chord_symbol(root, quality),
            "start_beat": start_beat,
        })
        start_beat += dur_beats
    if start_beat != pattern["bars"] * 4:
        raise RuntimeError(f"{ident} beats {start_beat} != {pattern['bars'] * 4}")
    outside = tuple(sorted(set(theoretical_outside) - set(pcs)))
    if tuple(pattern["outside"]) != outside:
        raise RuntimeError(f"{ident} outside declared {pattern['outside']} computed {outside}")
    borrowed = pattern["borrowed"]
    if (borrowed == "none") != (outside == ()):
        raise RuntimeError(f"{ident} borrowed/outside mismatch")
    voices = voice_events(pattern, specs)
    loop_ticks = pattern["bars"] * 4 * TPQ
    events: list[HarmEvent] = []
    cursor = 0
    for index, (spec, voiced) in enumerate(zip(specs, voices), start=1):
        dur = spec["dur_beats"] * TPQ
        pitches = list(voiced)
        have = {(pitch - spec["root_pc"]) % 12 for pitch in pitches}
        missing = [interval % 12 for interval in spec["intervals"] if interval % 12 not in have]
        if missing:
            raise RuntimeError(f"{ident}:{index} missing intervals {missing}")
        events.append(HarmEvent(
            number=index,
            start=cursor,
            end=cursor + dur,
            symbol=spec["symbol"],
            roman=spec["roman"],
            comment=spec["comment"],
            pitches=pitches,
            velocity={pitch: velocity_for(pitch, index - 1) for pitch in pitches},
        ))
        cursor += dur
    assert_distinct_harmony(ident, events)
    assign_stagger(events, pattern["stagger"])
    notes, hang_used = render_notes(events, loop_ticks, pattern["gap"], pattern["hang"])
    spelling = pattern_spelling(pattern["tonic"], pattern["mode"], specs)
    for pitch, start, dur, vel in notes:
        if not (ABS_LO <= pitch <= ABS_HI):
            raise RuntimeError(f"{ident} pitch {pitch}")
        if start < 0 or dur <= 0 or start + dur > loop_ticks:
            raise RuntimeError(f"{ident} note bounds")
        if pitch % 12 not in spelling:
            raise RuntimeError(f"{ident} unspelled pitch class {pitch % 12}")
        written = spell_pitch(pitch, spelling)
        if parse_note(written) != pitch:
            raise RuntimeError(f"{ident} spelling {pitch} -> {written}")
    filename = f"{ident}-{slug(pattern['name'])}.mid"
    return Built(
        pattern=pattern,
        events=events,
        notes=notes,
        pcs=pcs,
        outside=list(outside),
        spelling=spelling,
        mpqn=encode_mpqn(pattern["bpm"]),
        loop_ticks=loop_ticks,
        filename=filename,
        hang_used=hang_used,
    )


def midi_bytes(built: Built) -> bytes:
    events = []
    name = f"{built.pattern['id']} {built.pattern['name']}".encode("ascii")
    events.append((0, 0, bytes([0xFF, 0x03, len(name)]) + name))
    tempo = built.mpqn
    events.append((0, 1, bytes([0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF])))
    events.append((0, 2, bytes([0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08])))
    for pitch, start, dur, vel in built.notes:
        events.append((start, 4, bytes([0x90, pitch, vel])))
        events.append((start + dur, 3, bytes([0x80, pitch, 0])))
    events.append((built.loop_ticks, 5, bytes([0xFF, 0x2F, 0x00])))
    events.sort(key=lambda item: (item[0], item[1]))
    track = bytearray()
    last = 0
    for tick, _priority, payload in events:
        track += vlq(tick - last)
        track += payload
        last = tick
    header = b"MThd" + struct.pack(">IHHH", 6, 0, 1, TPQ)
    body = b"MTrk" + struct.pack(">I", len(track)) + bytes(track)
    return header + body


def parse_midi(data: bytes) -> dict:
    if data[0:4] != b"MThd":
        raise RuntimeError("missing MThd")
    _length, fmt, ntrks, division = struct.unpack(">IHHH", data[4:14])
    if data[4:8] != b"\x00\x00\x00\x06":
        raise RuntimeError("bad header length")
    pos = 14
    if data[pos:pos + 4] != b"MTrk":
        raise RuntimeError("missing MTrk")
    track_len = struct.unpack(">I", data[pos + 4:pos + 8])[0]
    pos += 8
    end = pos + track_len
    if end != len(data):
        raise RuntimeError("trailing bytes")
    tick = 0
    index = pos
    open_notes: dict[int, list[tuple[int, int]]] = defaultdict(list)
    notes = []
    metas = []
    statuses = []
    eot_tick = None
    order_errors = []
    last_tick_seen = -1
    last_kind = None
    while index < end:
        delta, index = read_vlq(data, index)
        tick += delta
        status = data[index]
        index += 1
        if status == 0xFF:
            meta_type = data[index]
            index += 1
            length, index = read_vlq(data, index)
            payload = data[index:index + length]
            index += length
            if meta_type == 0x2F:
                eot_tick = tick
                kind = "eot"
            else:
                metas.append((tick, meta_type, payload))
                kind = "meta"
            statuses.append(("meta", meta_type))
        elif status == 0x90 or status == 0x80:
            pitch = data[index]
            vel = data[index + 1]
            index += 2
            kind = "off" if status == 0x80 or vel == 0 else "on"
            if kind == "on":
                open_notes[pitch].append((tick, vel))
            else:
                if not open_notes[pitch]:
                    raise RuntimeError(f"unmatched note-off {pitch} at {tick}")
                start, on_vel = open_notes[pitch].pop(0)
                notes.append((pitch, start, tick - start, on_vel))
            if tick == last_tick_seen and last_kind == "on" and kind == "off":
                order_errors.append(tick)
            last_tick_seen = tick
            last_kind = kind
            statuses.append((kind, status))
        else:
            raise RuntimeError(f"prohibited or unexpected status {status:#x} at {tick}")
    if any(open_notes.values()):
        raise RuntimeError("unmatched note-on")
    return {
        "format": fmt,
        "ntrks": ntrks,
        "division": division,
        "notes": sorted(notes),
        "metas": metas,
        "eot": eot_tick,
        "order_errors": order_errors,
        "raw_note_count": len(notes),
    }


def active_problems(notes: list[tuple[int, int, int, int]]) -> list[str]:
    issues = []
    active: dict[int, int] = defaultdict(int)
    changes = []
    for pitch, start, dur, _vel in notes:
        changes.append((start, 1, pitch))
        changes.append((start + dur, -1, pitch))
    changes.sort(key=lambda item: (item[0], item[1]))
    max_poly = 0
    for _time, kind, pitch in changes:
        if kind < 0:
            active[pitch] -= 1
            if active[pitch] < 0:
                issues.append(f"negative count {pitch}")
            if active[pitch] == 0:
                del active[pitch]
        else:
            active[pitch] += 1
            if active[pitch] > 1:
                issues.append(f"overlap {pitch}")
            max_poly = max(max_poly, sum(active.values()))
    if max_poly > 12:
        issues.append(f"polyphony {max_poly}")
    return issues


def signature(notes: list[tuple[int, int, int]]) -> dict[tuple[int, int], tuple[int, ...]]:
    groups = defaultdict(list)
    for pitch, start, dur in notes:
        groups[(start, dur)].append(pitch)
    return {key: tuple(sorted(value)) for key, value in groups.items()}


def is_constant_transpose(left: dict, right: dict) -> bool:
    if left.keys() != right.keys():
        return False
    diffs = set()
    for key in left:
        a, b = left[key], right[key]
        if len(a) != len(b):
            return False
        for x, y in zip(a, b):
            diffs.add(y - x)
            if len(diffs) > 1:
                return False
    return len(diffs) == 1


def repeated_shorter(notes: list[tuple[int, int, int]], loop: int, bars: int) -> str | None:
    for parts in range(2, bars + 1):
        if loop % parts:
            continue
        span = loop // parts
        if span < TPQ:
            continue
        buckets = []
        for part in range(parts):
            origin = part * span
            segment = []
            for pitch, start, dur in notes:
                end = start + dur
                if end <= origin or start >= origin + span:
                    continue
                clip_start = max(start, origin)
                clip_end = min(end, origin + span)
                segment.append((pitch, clip_start - origin, clip_end - clip_start))
            buckets.append(tuple(sorted(segment)))
        if buckets and all(bucket == buckets[0] for bucket in buckets):
            return f"{parts} identical segments of {span} ticks"
    return None


def seam_pitches(built: Built) -> list[int]:
    if not built.events:
        return []
    return sorted(set(built.events[0].pitches) & set(built.events[-1].pitches))


def boundary_holds(built: Built) -> tuple[int, int]:
    holds = 0
    boundaries = len(built.events)
    for index, event in enumerate(built.events):
        nxt = built.events[(index + 1) % len(built.events)]
        if set(event.pitches) & set(nxt.pitches):
            holds += 1
    return holds, boundaries


def transition_text(built: Built, event: HarmEvent) -> str:
    parts = [event.comment]
    if event.entry_delay:
        staggered = ", ".join(
            f"{spell_pitch(pitch, built.spelling)} +{delay} ticks"
            for pitch, delay in sorted(event.entry_delay.items())
        )
        parts.append(f"Staggered entrances: {staggered}.")
    outgoing = []
    for pitch, start, dur, _vel in built.notes:
        end = start + dur
        if start < event.end and end > event.start and pitch not in event.pitches:
            outgoing.append(spell_pitch(pitch, built.spelling))
    if outgoing:
        parts.append("Outgoing transition tones still sounding in this event: " + ", ".join(sorted(set(outgoing))) + ".")
    else:
        parts.append("No outgoing transition tones.")
    return " ".join(parts)


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(rows)


def json_cell(value) -> str:
    return json.dumps(value, separators=(",", ":"))


def describe_voicing(built: Built) -> str:
    pitches = [pitch for pitch, *_ in built.notes]
    holds, boundaries = boundary_holds(built)
    low = spell_pitch(min(pitches), built.spelling)
    high = spell_pitch(max(pitches), built.spelling)
    return (
        f"{built.pattern['idea']} "
        f"Sounding pitches run from {low} to {high}. "
        f"{holds} of {boundaries} boundaries, counting the loop seam, keep at least one MIDI pitch. "
        f"Low notes stay sparse so a separate bass part has room."
    )


def describe_transition(built: Built) -> str:
    names = [spell_pitch(pitch, built.spelling) for pitch in seam_pitches(built)]
    shared = ", ".join(names) if names else "no identical MIDI pitch"
    hang = f" Departing tones may hang {built.hang_used} ticks when that does not collide." if built.hang_used else ""
    return f"{built.pattern['transition']} Shared seam pitches restarted at tick 0: {shared}.{hang}"


def progression_summary(built: Built) -> str:
    return " - ".join(event.symbol for event in built.events)


def readme_text() -> str:
    return """# Lumen Drift

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
"""


def ledger_line(built: Built) -> str:
    names = []
    for event in built.events:
        spelled = " ".join(spell_pitch(pitch, built.spelling) for pitch in event.pitches)
        names.append(f"{event.symbol} [{spelled}]")
    return f"{built.pattern['id']} {built.pattern['name']}: " + " | ".join(names)


def main() -> None:
    if len(PATTERNS) != 50:
        raise SystemExit(f"expected 50 patterns, found {len(PATTERNS)}")
    ids = [pattern["id"] for pattern in PATTERNS]
    if ids != [f"{index:03d}" for index in range(1, 51)]:
        raise SystemExit(f"IDs are not 001-050 in order: {ids}")
    for group in GROUP_ORDER:
        count = sum(pattern["group"] == group for pattern in PATTERNS)
        if count != 10:
            raise SystemExit(f"{group} has {count}")

    for bpm in range(70, 116):
        mpqn = encode_mpqn(bpm)
        recovered = int((Decimal(60_000_000) / Decimal(mpqn)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        if recovered != bpm:
            raise SystemExit(f"tempo round trip failed for {bpm}")

    built_all = [build_pattern(pattern) for pattern in PATTERNS]

    midi_dir = ROOT / "midi"
    data_dir = ROOT / "data"
    if midi_dir.exists():
        shutil.rmtree(midi_dir)
    midi_dir.mkdir()
    data_dir.mkdir(exist_ok=True)

    index_rows = []
    note_rows = []
    harm_rows = []
    json_patterns = []

    for built in built_all:
        (midi_dir / built.filename).write_bytes(midi_bytes(built))
        outside_cell = json_cell(built.outside) if built.outside else "none"
        index_rows.append({
            "pattern_id": built.pattern["id"],
            "progression_name": built.pattern["name"],
            "collection_group": built.pattern["group"],
            "midi_filename": built.filename,
            "bpm": built.pattern["bpm"],
            "tempo_us_per_quarter": built.mpqn,
            "tonal_center": built.pattern["tonic"],
            "pitch_collection": built.pattern["mode"],
            "pitch_class_set": json_cell(built.pcs),
            "outside_pitch_classes": outside_cell,
            "borrowed_chords": built.pattern["borrowed"],
            "loop_bars": built.pattern["bars"],
            "loop_ticks": built.loop_ticks,
            "harmonic_events": len(built.events),
            "chord_summary": progression_summary(built),
            "voicing_description": describe_voicing(built),
            "transition_approach": describe_transition(built),
            "playback_sound": built.pattern["sound"],
            "optional_treatment": built.pattern["treatment"],
        })
        for pitch, start, dur, vel in built.notes:
            note_rows.append({
                "pattern_id": built.pattern["id"],
                "midi_note": pitch,
                "note_name": spell_pitch(pitch, built.spelling),
                "start_tick": start,
                "duration_ticks": dur,
                "start_beat": beat_str(start),
                "duration_beats": beat_str(dur),
                "velocity": vel,
            })
        for event in built.events:
            harm_rows.append({
                "pattern_id": built.pattern["id"],
                "event_number": event.number,
                "start_tick": event.start,
                "duration_ticks": event.dur,
                "start_beat": beat_str(event.start),
                "duration_beats": beat_str(event.dur),
                "chord_symbol": event.symbol,
                "roman_numeral": event.roman,
                "intended_pitches": json_cell(event.pitches),
                "voicing_and_transition": transition_text(built, event),
            })
        json_patterns.append({
            "id": built.pattern["id"],
            "name": built.pattern["name"],
            "group": built.pattern["group"],
            "filename": built.filename,
            "bpm": built.pattern["bpm"],
            "mpqn": built.mpqn,
            "tonic": built.pattern["tonic"],
            "collection": built.pattern["mode"],
            "pcs": built.pcs,
            "outside": built.outside,
            "borrowed": built.pattern["borrowed"],
            "bars": built.pattern["bars"],
            "loopTicks": built.loop_ticks,
            "summary": progression_summary(built),
            "idea": built.pattern["idea"],
            "voicing": describe_voicing(built),
            "transition": describe_transition(built),
            "sound": built.pattern["sound"],
            "treatment": built.pattern["treatment"],
            "events": [
                {
                    "number": event.number,
                    "startTick": event.start,
                    "durationTicks": event.dur,
                    "symbol": event.symbol,
                    "roman": event.roman,
                    "comment": event.comment,
                    "pitches": event.pitches,
                    "spelling": [spell_pitch(pitch, built.spelling) for pitch in event.pitches],
                    "transition": transition_text(built, event),
                }
                for event in built.events
            ],
            "notes": [
                {
                    "pitch": pitch,
                    "name": spell_pitch(pitch, built.spelling),
                    "start": start,
                    "duration": dur,
                    "velocity": vel,
                }
                for pitch, start, dur, vel in built.notes
            ],
        })

    index_fields = [
        "pattern_id", "progression_name", "collection_group", "midi_filename", "bpm",
        "tempo_us_per_quarter", "tonal_center", "pitch_collection", "pitch_class_set",
        "outside_pitch_classes", "borrowed_chords", "loop_bars", "loop_ticks",
        "harmonic_events", "chord_summary", "voicing_description", "transition_approach",
        "playback_sound", "optional_treatment",
    ]
    note_fields = [
        "pattern_id", "midi_note", "note_name", "start_tick", "duration_ticks",
        "start_beat", "duration_beats", "velocity",
    ]
    harm_fields = [
        "pattern_id", "event_number", "start_tick", "duration_ticks", "start_beat",
        "duration_beats", "chord_symbol", "roman_numeral", "intended_pitches",
        "voicing_and_transition",
    ]
    write_csv(data_dir / "index.csv", index_rows, index_fields)
    write_csv(data_dir / "notes.csv", note_rows, note_fields)
    write_csv(data_dir / "harmony.csv", harm_rows, harm_fields)
    (ROOT / "README.md").write_text(readme_text(), encoding="utf-8")

    collection = {
        "title": "Lumen Drift",
        "groups": [{"name": name, "blurb": GROUP_BLURB[name]} for name in GROUP_ORDER],
        "patterns": json_patterns,
    }
    (data_dir / "collection.json").write_text(json.dumps(collection), encoding="utf-8")
    web_data = ROOT / "web" / "public" / "data"
    web_midi = ROOT / "web" / "public" / "midi"
    web_data.mkdir(parents=True, exist_ok=True)
    if web_midi.exists():
        shutil.rmtree(web_midi)
    shutil.copytree(midi_dir, web_midi)
    (web_data / "collection.json").write_text(json.dumps(collection), encoding="utf-8")
    image_src = Path("/opt/cursor/artifacts/assets")
    if image_src.exists():
        image_dst = ROOT / "web" / "public" / "images"
        image_dst.mkdir(parents=True, exist_ok=True)
        for image in image_src.glob("*.jpg"):
            shutil.copy2(image, image_dst / image.name)

    failures = validate(built_all, index_rows, note_rows, harm_rows)
    payload = payload_sha256(midi_dir, data_dir)
    report = render_report(built_all, failures, payload)
    (ROOT / "VALIDATION-REPORT-Cursor.md").write_text(report, encoding="utf-8")
    document = validation_document(built_all, failures, payload)
    (data_dir / "validation.json").write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    for name in ("index.csv", "notes.csv", "harmony.csv", "validation.json"):
        shutil.copy2(data_dir / name, web_data / name)
    shutil.copy2(ROOT / "VALIDATION-REPORT-Cursor.md", ROOT / "web" / "public" / "VALIDATION-REPORT-Cursor.md")
    if failures:
        print("\n".join(failures))
        raise SystemExit(f"{len(failures)} validation failures")

    zip_path = ROOT / "lumen-drift-collection.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(midi_dir.glob("*.mid")):
            archive.write(path, f"midi/{path.name}")
        for name in ("index.csv", "notes.csv", "harmony.csv"):
            archive.write(data_dir / name, f"data/{name}")
        archive.write(ROOT / "README.md", "README.md")
        archive.write(ROOT / "VALIDATION-REPORT-Cursor.md", "VALIDATION-REPORT-Cursor.md")
    public_zip = ROOT / "web" / "public" / "lumen-drift-collection.zip"
    public_zip.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(zip_path, public_zip)
    print(f"Wrote {len(built_all)} MIDI files, CSV, README, report, {zip_path.name}")
    print(f"payload sha256 {payload}")


def load_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def beats_close(text: str, ticks: int) -> bool:
    parsed = Decimal(text)
    exact = Decimal(ticks) / Decimal(TPQ)
    return abs(parsed - exact) <= Decimal("0.0000000005")


def validate(built_all: list[Built], index_rows: list[dict], note_rows: list[dict], harm_rows: list[dict]) -> list[str]:
    failures = []
    midi_files = sorted((ROOT / "midi").glob("*.mid"))
    if len(midi_files) != 50:
        failures.append(f"MIDI count {len(midi_files)}")
    by_id = {built.pattern["id"]: built for built in built_all}
    parsed_notes_by_id = {}
    for path in midi_files:
        data = path.read_bytes()
        try:
            parsed = parse_midi(data)
        except Exception as exc:  # noqa: BLE001 - report and continue
            failures.append(f"{path.name} parse {exc}")
            continue
        ident = path.name[:3]
        built = by_id[ident]
        if parsed["format"] != 0 or parsed["ntrks"] != 1 or parsed["division"] != TPQ:
            failures.append(f"{ident} header {parsed['format']} {parsed['ntrks']} {parsed['division']}")
        if parsed["eot"] != built.loop_ticks:
            failures.append(f"{ident} eot {parsed['eot']} != {built.loop_ticks}")
        if parsed["order_errors"]:
            failures.append(f"{ident} note-off after note-on at {parsed['order_errors'][:3]}")
        metas = {(tick, meta): payload for tick, meta, payload in parsed["metas"]}
        if (0, 0x03) not in metas or (0, 0x51) not in metas or (0, 0x58) not in metas:
            failures.append(f"{ident} missing tick-0 meta")
        else:
            if metas[(0, 0x03)].decode("ascii") != f"{ident} {built.pattern['name']}":
                failures.append(f"{ident} track name")
            tempo = int.from_bytes(metas[(0, 0x51)], "big")
            if tempo != built.mpqn:
                failures.append(f"{ident} tempo {tempo} != {built.mpqn}")
            if metas[(0, 0x58)] != bytes([4, 2, 24, 8]):
                failures.append(f"{ident} time signature")
        for pitch, start, dur, vel in parsed["notes"]:
            if not (ABS_LO <= pitch <= ABS_HI):
                failures.append(f"{ident} pitch {pitch}")
            if not (1 <= vel <= 127):
                failures.append(f"{ident} velocity {vel}")
            if start < 0 or dur <= 0 or start >= built.loop_ticks or start + dur > built.loop_ticks:
                failures.append(f"{ident} bounds {pitch} {start} {dur}")
        failures.extend(f"{ident} {issue}" for issue in active_problems(parsed["notes"]))
        if sorted(parsed["notes"]) != sorted(built.notes):
            failures.append(f"{ident} parsed notes differ from writer source")
        parsed_notes_by_id[ident] = parsed["notes"]
        if not (2 <= len(built.events) <= 8):
            failures.append(f"{ident} event count")
        cursor = 0
        for event in built.events:
            if event.start != cursor or event.dur <= 0:
                failures.append(f"{ident} partition at {event.number}")
            cursor = event.end
        if cursor != built.loop_ticks:
            failures.append(f"{ident} partition end {cursor}")
        sounding = {pitch % 12 for pitch, *_rest in parsed["notes"]}
        declared_outside = set(built.outside)
        if sounding - set(built.pcs) != declared_outside:
            failures.append(f"{ident} outside pcs sounding {sorted(sounding - set(built.pcs))} declared {built.outside}")
        if set(built.pcs) != set(collection_pcs(built.pattern["tonic"], built.pattern["mode"])):
            failures.append(f"{ident} collection mismatch")

    # CSV equality
    csv_notes = defaultdict(list)
    for row in note_rows:
        csv_notes[row["pattern_id"]].append((
            int(row["midi_note"]), int(row["start_tick"]), int(row["duration_ticks"]), int(row["velocity"])
        ))
        if not beats_close(row["start_beat"], int(row["start_tick"])):
            failures.append(f"{row['pattern_id']} start beat {row['start_beat']}")
        if not beats_close(row["duration_beats"], int(row["duration_ticks"])):
            failures.append(f"{row['pattern_id']} dur beat {row['duration_beats']}")
        if parse_note(row["note_name"]) != int(row["midi_note"]):
            failures.append(f"{row['pattern_id']} name {row['note_name']}")
    for ident, notes in parsed_notes_by_id.items():
        if sorted(csv_notes[ident]) != sorted(notes):
            failures.append(f"{ident} CSV notes != MIDI")

    index_ids = [row["pattern_id"] for row in index_rows]
    if index_ids != [f"{index:03d}" for index in range(1, 51)]:
        failures.append("index IDs")
    for row, built in zip(index_rows, built_all):
        if int(row["bpm"]) != built.pattern["bpm"] or int(row["tempo_us_per_quarter"]) != built.mpqn:
            failures.append(f"{built.pattern['id']} index tempo")
        if int(row["loop_ticks"]) != built.loop_ticks or int(row["loop_bars"]) != built.pattern["bars"]:
            failures.append(f"{built.pattern['id']} index loop")
        if int(row["harmonic_events"]) != len(built.events):
            failures.append(f"{built.pattern['id']} index events")
        if json.loads(row["pitch_class_set"]) != built.pcs:
            failures.append(f"{built.pattern['id']} index pcs")

    harm_by = defaultdict(list)
    for row in harm_rows:
        harm_by[row["pattern_id"]].append(row)
        if not beats_close(row["start_beat"], int(row["start_tick"])):
            failures.append(f"harmony beat {row['pattern_id']} {row['event_number']}")
        if not beats_close(row["duration_beats"], int(row["duration_ticks"])):
            failures.append(f"harmony dur {row['pattern_id']} {row['event_number']}")
    for built in built_all:
        rows = harm_by[built.pattern["id"]]
        if [int(row["start_tick"]) for row in rows] != [event.start for event in built.events]:
            failures.append(f"{built.pattern['id']} harmony ticks")
        if [json.loads(row["intended_pitches"]) for row in rows] != [event.pitches for event in built.events]:
            failures.append(f"{built.pattern['id']} harmony pitches")

    # Duplicates
    signatures = []
    for built in built_all:
        bare = [(pitch, start, dur) for pitch, start, dur, _vel in built.notes]
        signatures.append((built.pattern["id"], signature(bare), bare, built.loop_ticks, built.pattern["bars"]))
    for i, (ident, sig, bare, loop, bars) in enumerate(signatures):
        repeat = repeated_shorter(bare, loop, bars)
        if repeat:
            failures.append(f"{ident} internal repetition {repeat}")
        for other_id, other_sig, _bare, _loop, _bars in signatures[i + 1:]:
            if sig == other_sig:
                failures.append(f"exact duplicate {ident} {other_id}")
            elif is_constant_transpose(sig, other_sig):
                failures.append(f"transposition duplicate {ident} {other_id}")
    return failures


def payload_sha256(midi_dir: Path, data_dir: Path) -> str:
    """Stable hash of the MIDI files and the three CSV tables. The zip also
    contains this report, so a hash of the zip cannot be written inside it."""
    digest = hashlib.sha256()
    for path in sorted(midi_dir.glob("*.mid")):
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
    for name in ("index.csv", "notes.csv", "harmony.csv"):
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update((data_dir / name).read_bytes())
    return digest.hexdigest()


def validation_document(built_all: list[Built], failures: list[str], payload_hash: str) -> dict:
    """Structured report the site renders. Same facts as the Markdown report."""
    romans: dict[tuple[str, ...], list[str]] = defaultdict(list)
    rhythms: dict[tuple[int, ...], list[str]] = defaultdict(list)
    for built in built_all:
        romans[tuple(event.roman for event in built.events)].append(built.pattern["id"])
        rhythms[tuple(event.dur for event in built.events)].append(built.pattern["id"])
    shared_romans = [
        {"ids": ids, "romans": list(key)}
        for key, ids in romans.items()
        if len(ids) > 1
    ]
    shared_rhythms = [
        {"ids": ids, "ticks": list(key)}
        for key, ids in rhythms.items()
        if len(ids) > 1
    ]
    weak = []
    for built in built_all:
        holds, _boundaries = boundary_holds(built)
        if holds == 0:
            weak.append(built.pattern["id"])
    checks = [
        ("files", "File count and groups", "Exactly 50 MIDI files, 10 in each of the five groups, IDs 001-050."),
        ("format", "Format and resolution", "Each file parses as Standard MIDI Format 0, one track, 480 ticks per quarter."),
        ("meta", "Tempo and time signature", "Track name, tempo, and 4/4 time signature are at tick 0. No program change, pitch bend, or controller."),
        ("pairing", "Note pairing", "Every note-on has one note-off. No unmatched note-off. Note-offs are ordered before note-ons at the same tick."),
        ("eot", "End of track", "End of track is the only terminal meta, at the declared loop length, after any note-offs on that tick."),
        ("range", "Pitch, velocity, and bounds", "Pitches are inside 36-96, velocities are 1-127, durations are positive, and no note crosses the loop."),
        ("polyphony", "Overlap and polyphony", "The same MIDI pitch is never active twice. Active notes never exceed 12."),
        ("csv", "Note CSV equality", "Parsed notes match the note CSV in pitch, tick, duration, and velocity."),
        ("beats", "Beat rounding", "Beat columns match ticks / 480 within 0.0000000005 beats."),
        ("tempo", "Tempo encoding", "Tempo meta matches the index and the half-up rounding of 60,000,000 / BPM. Every integer from 70 through 115 round-trips."),
        ("harmony", "Harmonic partitions", "Each loop has 2 to 8 harmonic events whose tick intervals partition the loop."),
        ("collection", "Pitch collections", "Sounding pitch classes outside the named collection match the index. Aeolian is the only name used for natural minor."),
        ("symbols", "Chord symbols", "Chord-symbol intervals are present in the intended voicing. Omissions are written into the symbol."),
        ("romans", "Roman numerals", "Roman numeral case matches chord quality, measured from the parallel major."),
        ("duplicates", "Duplicate detection", "No exact copy, no constant transposition, and no unchanged shorter loop repeated inside a longer file."),
    ]
    status = "pass" if not failures else "fail"
    return {
        "title": "Lumen Drift validation",
        "result": status,
        "payload_sha256": payload_hash,
        "validator": "tools/build_collection.py",
        "summary": {
            "midi_files": len(built_all),
            "note_events": sum(len(built.notes) for built in built_all),
            "harmonic_events": sum(len(built.events) for built in built_all),
            "checks": len(checks),
            "passed": 0 if failures else len(checks),
            "failed": len(failures),
        },
        "checks": [
            {"id": ident, "name": name, "status": status, "detail": detail, "problems": failures if status == "fail" else []}
            for ident, name, detail in checks
        ],
        "shared_roman_sequences": shared_romans,
        "shared_harmonic_rhythms": shared_rhythms,
        "loops_without_a_common_tone_boundary": weak,
        "limitations": [
            "Audio was not rendered.",
            "The loops were not auditioned. The browser synth is a preview, not a hearing test.",
            "Whether a borrowed chord feels nostalgic is a reading of the voicing ledger, not a scored classifier.",
            "A DAW was not asked to cycle the files. Loop length is in the index because a DAW will not infer it.",
            "The digest covers the MIDI files and the three CSV tables. It does not cover this report or the zip.",
        ],
        "reproduce": "python3 tools/build_collection.py",
    }


def render_report(built_all: list[Built], failures: list[str], payload_hash: str) -> str:
    lines = []
    lines.append("# Lumen Drift validation report")
    lines.append("")
    lines.append("Generated by `tools/build_collection.py` after reopening the MIDI files it had just written.")
    lines.append("")
    lines.append("## Result")
    lines.append("")
    if failures:
        lines.append(f"Failed. {len(failures)} problem(s).")
        for failure in failures:
            lines.append(f"- {failure}")
    else:
        lines.append("Automated file checks passed for all 50 MIDI files and the three CSV tables.")
    lines.append("")
    lines.append(f"MIDI and CSV payload SHA-256: `{payload_hash}`")
    lines.append("")
    lines.append("That digest covers the 50 MIDI files and `index.csv`, `notes.csv`, and `harmony.csv`, in sorted name order. It does not cover this report or the zip, because both contain the digest.")
    lines.append("")
    lines.append("## Automated file validation")
    lines.append("")
    lines.append("These checks were implemented and, on a passing run, executed against the parsed files. They are not a listening test.")
    lines.append("")
    checks = [
        "Exactly 50 MIDI files, 10 in each of the five groups, IDs 001-050.",
        "Each file parses as Standard MIDI Format 0, one track, 480 ticks per quarter.",
        "Track name, tempo, and 4/4 time signature are at tick 0. No program change, pitch bend, or controller.",
        "Every note-on has one note-off. No unmatched note-off. Note-offs are ordered before note-ons at the same tick.",
        "End of track is the only terminal meta, at the declared loop length, after any note-offs on that tick.",
        "Pitches are inside 36-96, velocities are 1-127, durations are positive, and no note crosses the loop.",
        "The same MIDI pitch is never active twice. Active notes, counted from note-on inclusive to note-off exclusive, never exceed 12.",
        "Parsed notes match the note CSV in pitch, tick, duration, and velocity.",
        "Beat columns match ticks / 480 within 0.0000000005 beats after half-up rounding to 9 decimal places.",
        "Tempo meta matches the index and the half-up rounding of 60,000,000 / BPM. The integer BPM round-trips for every file and for every integer from 70 through 115.",
        "Each loop has 2 to 8 harmonic events whose tick intervals partition the loop.",
        "Sounding pitch classes outside the named collection match the index. The named collection matches the mode formula. Aeolian is the only name used for natural minor.",
        "Chord-symbol intervals are present in the intended voicing. Omitted thirds and fifths are written into the symbol.",
        "Roman numeral case matches chord quality: lowercase minor-family, uppercase major-family, measured from the parallel major.",
    ]
    for check in checks:
        state = "PASS" if not failures else "SEE FAILURES"
        lines.append(f"- {state}: {check}")
    lines.append("")
    lines.append("## Duplicate detection")
    lines.append("")
    lines.append("Method, implemented and run:")
    lines.append("")
    lines.append("- Build a map from `(start_tick, duration_ticks)` to the sorted tuple of pitches. Velocity and BPM are ignored. Event order among simultaneous notes does not matter.")
    lines.append("- Exact duplicate: the maps are equal.")
    lines.append("- Transposition duplicate: the maps have the same keys and the same group sizes, and every pitch differs by one constant.")
    lines.append("- Internal repetition: for every divisor from 2 through the bar count, split notes at the segment boundaries and compare the resulting `(pitch, local start, local duration)` multisets. A held note that crosses a boundary is split, so a repeated shorter loop still matches. A pedal that continues under changing harmony does not, because the other pitches differ.")
    lines.append("- Shared chord symbols and roman sequences are flagged below for musical review. They are not automatic failures. A shared roman sequence can still be a different piece when the voicing, register, and note rhythm differ. Minor duration or velocity edits are not treated as new pieces, because those edits do not create a new signature under the tests above.")
    lines.append("")
    romans = defaultdict(list)
    rhythms = defaultdict(list)
    both = defaultdict(list)
    for built in built_all:
        roman = tuple(event.roman for event in built.events)
        rhythm = tuple(event.dur for event in built.events)
        romans[roman].append(built.pattern["id"])
        rhythms[rhythm].append(built.pattern["id"])
        both[(roman, rhythm)].append(built.pattern["id"])
    lines.append("Shared roman sequences:")
    shared_roman = {key: value for key, value in romans.items() if len(value) > 1}
    if not shared_roman:
        lines.append("- None.")
    for key, value in shared_roman.items():
        lines.append(f"- {', '.join(value)}: {' - '.join(key)}")
    lines.append("")
    lines.append("Shared harmonic-rhythm duration tuples (ticks):")
    shared_rhythm = {key: value for key, value in rhythms.items() if len(value) > 1}
    if not shared_rhythm:
        lines.append("- None.")
    for key, value in shared_rhythm.items():
        lines.append(f"- {', '.join(value)}: {list(key)}")
    lines.append("")
    lines.append("Shared roman sequence and harmonic rhythm together:")
    shared_both = {key: value for key, value in both.items() if len(value) > 1}
    if not shared_both:
        lines.append("- None.")
    lines.append("")
    lines.append("## Score-based musical review")
    lines.append("")
    lines.append("This section is computed from the voiced pitches. It is not automated aesthetic approval and it is not listening.")
    lines.append("")
    lines.append("| ID | Name | Common-tone boundaries | Seam pitches | Low | High | Notes | Hang ticks |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    weak_seam = []
    for built in built_all:
        holds, boundaries = boundary_holds(built)
        pitches = [pitch for pitch, *_ in built.notes]
        low = min(pitches)
        high = max(pitches)
        if holds == 0:
            weak_seam.append(built.pattern["id"])
        lines.append(
            f"| {built.pattern['id']} | {built.pattern['name']} | {holds}/{boundaries} | {len(seam_pitches(built))} | {low} | {high} | {len(built.notes)} | {built.hang_used} |"
        )
    lines.append("")
    if weak_seam:
        lines.append("Loops with no common MIDI pitch on any boundary, including the seam: " + ", ".join(weak_seam) + ".")
    else:
        lines.append("Every loop keeps at least one MIDI pitch across one or more boundaries, counting the seam as a boundary.")
    lines.append("")
    lines.append("Low-register rule used while voicing: no adjacent seconds (1 or 2 semitones) inside an intended chord, at most one note below MIDI 50, and at most two notes below MIDI 55 in the strict search. The preference window sits inside 50-81. Occasional notes from 48-49 or 82-84 exist only when a chord's seconds cannot be spaced otherwise.")
    lines.append("")
    lines.append("### Voicing ledger")
    lines.append("")
    for built in built_all:
        lines.append(f"- {ledger_line(built)}")
    lines.append("")
    lines.append("## What was not done")
    lines.append("")
    lines.append("- Audio was not rendered.")
    lines.append("- The loops were not auditioned. A browser synth in the listening room can play them later. That is not a claim that listening happened during this build.")
    lines.append("- Semantic review of whether a borrowed chord 'feels' nostalgic is the ledger above, not a classifier with a pass score.")
    lines.append("- DAW loop audition was not run. Loop length is written in the index because a DAW will not infer it from the file alone.")
    lines.append("- The published digest is of the MIDI and CSV payload, not of the zip. Hashing the zip from inside the report would change the zip.")
    lines.append("")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
