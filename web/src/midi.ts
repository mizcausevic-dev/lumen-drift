import type { NoteEvent } from "./types"

function readVlq(bytes: Uint8Array, index: number): [number, number] {
  let value = 0
  while (index < bytes.length) {
    const byte = bytes[index]
    index += 1
    value = (value << 7) | (byte & 0x7f)
    if ((byte & 0x80) === 0) return [value, index]
  }
  throw new Error("truncated MIDI")
}

/** Parse the note list from a Format 0 file written by this project. */
export function parseMidiNotes(buffer: ArrayBuffer): NoteEvent[] {
  const bytes = new Uint8Array(buffer)
  const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (head !== "MThd") throw new Error("not a Standard MIDI file")
  let pos = 14
  const track = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3])
  if (track !== "MTrk") throw new Error("missing track")
  const length = new DataView(buffer).getUint32(pos + 4)
  pos += 8
  const end = pos + length
  let tick = 0
  const open: { pitch: number; tick: number; velocity: number }[] = []
  const notes: NoteEvent[] = []
  while (pos < end) {
    const [delta, next] = readVlq(bytes, pos)
    pos = next
    tick += delta
    const status = bytes[pos]
    pos += 1
    if (status === 0xff) {
      const type = bytes[pos]
      pos += 1
      const [metaLength, after] = readVlq(bytes, pos)
      pos = after + metaLength
      if (type === 0x2f) break
      continue
    }
    if (status !== 0x90 && status !== 0x80) throw new Error(`unexpected MIDI status ${status}`)
    const pitch = bytes[pos]
    const velocity = bytes[pos + 1]
    pos += 2
    if (status === 0x90 && velocity > 0) {
      open.push({ pitch, tick, velocity })
    } else {
      const index = open.findIndex((note) => note.pitch === pitch)
      if (index < 0) throw new Error(`note-off without note-on for ${pitch}`)
      const started = open.splice(index, 1)[0]
      notes.push({
        pitch,
        name: "",
        start: started.tick,
        duration: tick - started.tick,
        velocity: started.velocity,
      })
    }
  }
  if (open.length) throw new Error("unmatched note-on")
  return notes
}

export function sameNotes(parsed: NoteEvent[], expected: NoteEvent[]): boolean {
  const key = (note: NoteEvent) => `${note.pitch}:${note.start}:${note.duration}:${note.velocity}`
  const left = parsed.map(key).sort()
  const right = expected.map(key).sort()
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}
