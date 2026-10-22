export type NoteEvent = {
  pitch: number
  name: string
  start: number
  duration: number
  velocity: number
}

export type HarmEvent = {
  number: number
  startTick: number
  durationTicks: number
  symbol: string
  roman: string
  comment: string
  pitches: number[]
  spelling: string[]
  transition: string
}

export type Pattern = {
  id: string
  name: string
  group: string
  filename: string
  bpm: number
  mpqn: number
  tonic: string
  collection: string
  pcs: number[]
  outside: number[]
  borrowed: string
  bars: number
  loopTicks: number
  summary: string
  idea: string
  voicing: string
  transition: string
  sound: string
  treatment: string
  events: HarmEvent[]
  notes: NoteEvent[]
}

export type CollectionFile = {
  title: string
  groups: { name: string; blurb: string }[]
  patterns: Pattern[]
}

export type ValidationCheck = {
  id: string
  name: string
  status: string
  detail: string
  problems: string[]
}

export type ValidationReport = {
  title: string
  result: string
  payload_sha256: string
  validator: string
  summary: {
    midi_files: number
    note_events: number
    harmonic_events: number
    checks: number
    passed: number
    failed: number
  }
  checks: ValidationCheck[]
  shared_roman_sequences: { ids: string[]; romans: string[] }[]
  shared_harmonic_rhythms: { ids: string[]; ticks: number[] }[]
  loops_without_a_common_tone_boundary: string[]
  limitations: string[]
  reproduce: string
}

export const THEMES = [
  ["bento", "Bento Grid"],
  ["cosmic", "Cosmic Cyber"],
  ["swiss", "Swiss Architect"],
  ["aqua", "Aqua Web 2.0"],
  ["brutal", "Pop Brutalist"],
  ["steel", "Steel Tactical"],
  ["parchment", "Parchment"],
] as const

export type ThemeId = (typeof THEMES)[number][0]
export type ModeId = "dark" | "light"

export const GROUP_ART = [
  {
    name: "Suspended Light",
    image: "images/group-suspended-light.jpg",
    alt: "A pale shaft of light falling between dark columns onto a stone floor.",
  },
  {
    name: "Emotional Currents",
    image: "images/group-emotional-currents.jpg",
    alt: "A dark lake at night with an amber reflection running toward a far shore.",
  },
  {
    name: "Faded Memory",
    image: "images/group-faded-memory.jpg",
    alt: "An empty wooden chair beside a worn window in a dim room.",
  },
  {
    name: "Open Horizons",
    image: "images/group-open-horizons.jpg",
    alt: "A wide grass field under a pale warm sky, with low hills on the horizon.",
  },
  {
    name: "Nocturnal Bloom",
    image: "images/group-nocturnal-bloom.jpg",
    alt: "A white flower in dark foliage, lit by a narrow beam, with violet blooms nearby.",
  },
] as const

export function asset(path: string): string {
  const base = import.meta.env.BASE_URL
  return `${base}${path.replace(/^\//, "")}`
}

export function readStoredTheme(): ThemeId {
  try {
    const value = localStorage.getItem("lumen-theme")
    if (THEMES.some(([id]) => id === value)) return value as ThemeId
  } catch {
    /* private mode */
  }
  return "cosmic"
}

export function readStoredMode(): ModeId {
  try {
    const value = localStorage.getItem("lumen-mode")
    if (value === "light" || value === "dark") return value
  } catch {
    /* private mode */
  }
  return "dark"
}
