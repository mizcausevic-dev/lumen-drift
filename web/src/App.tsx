import { useEffect, useMemo, useRef, useState } from "react"
import { PadEngine } from "./audio"
import { LabProvider, type MidiCheck } from "./lab"
import { parseMidiNotes, sameNotes } from "./midi"
import {
  ArticleTeaser,
  Brief,
  DropBand,
  HarmonyMap,
  Hero,
  Marquee,
  Mindmap,
  Pipeline,
  SiteFooter,
  SiteNav,
  SoundDesign,
  ThemeBar,
  ValidationPanel,
} from "./sections"
import {
  GROUP_ART,
  asset,
  readStoredMode,
  readStoredTheme,
  type CollectionFile,
  type ModeId,
  type Pattern,
  type ThemeId,
  type ValidationReport,
} from "./types"

function positionLabel(tick: number): string {
  const beats = tick / 480
  const bar = Math.floor(beats / 4) + 1
  const beat = (beats % 4) + 1
  return `${bar}.${beat.toFixed(2)}`
}

function currentEvent(pattern: Pattern, tick: number) {
  return (
    pattern.events.find((event) => tick >= event.startTick && tick < event.startTick + event.durationTicks) ??
    pattern.events[0]
  )
}

function PianoRoll({ pattern, tick }: { pattern: Pattern; tick: number }) {
  const width = 920
  const height = 210
  const left = 40
  const pitches = pattern.notes.map((note) => note.pitch)
  const lo = Math.min(...pitches)
  const hi = Math.max(...pitches)
  const span = Math.max(1, hi - lo)
  const innerH = height - 28
  const x = (value: number) => left + (value / pattern.loopTicks) * (width - left - 10)
  const y = (pitch: number) => 14 + ((hi - pitch) / span) * innerH
  const row = Math.max(4, innerH / (span + 1) - 1)
  return (
    <svg className="roll" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`MIDI piano roll for ${pattern.name}`}>
      {pattern.notes.map((note) => (
        <rect
          key={`${note.pitch}-${note.start}-${note.duration}`}
          x={x(note.start)}
          y={y(note.pitch)}
          width={Math.max(1.5, x(note.start + note.duration) - x(note.start))}
          height={row}
          fill="var(--note)"
          opacity={0.38 + (note.velocity / 127) * 0.55}
        >
          <title>{`${note.name} velocity ${note.velocity}`}</title>
        </rect>
      ))}
      <line x1={x(tick)} x2={x(tick)} y1={6} y2={height - 8} stroke="var(--playhead)" strokeWidth={1.5} />
    </svg>
  )
}

function HarmonyDiagram({ pattern }: { pattern: Pattern }) {
  const width = 920
  const height = 250
  const left = 36
  const pitches = [...new Set(pattern.events.flatMap((event) => event.pitches))].sort((a, b) => a - b)
  const lo = pitches[0]
  const hi = pitches[pitches.length - 1]
  const span = Math.max(1, hi - lo)
  const x = (tick: number) => left + (tick / pattern.loopTicks) * (width - left - 12)
  const y = (pitch: number) => 18 + ((hi - pitch) / span) * 150
  return (
    <svg className="score" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Harmonic rhythm and common tones for ${pattern.name}`}>
      {pattern.events.map((event) => {
        const x0 = x(event.startTick)
        const x1 = x(event.startTick + event.durationTicks)
        return (
          <g key={event.number}>
            <rect x={x0} y={188} width={Math.max(1, x1 - x0 - 2)} height={36} fill="var(--note)" opacity={0.18} />
            <text x={x0 + 4} y={210} fill="currentColor" fontSize={11} fontFamily="ui-monospace, monospace">
              {event.number}. {event.roman}
            </text>
          </g>
        )
      })}
      {pattern.events.slice(0, -1).flatMap((event, index) => {
        const next = pattern.events[index + 1]
        return event.pitches
          .filter((pitch) => next.pitches.includes(pitch))
          .map((pitch) => (
            <line
              key={`${event.number}-${pitch}`}
              x1={x(event.startTick) + 8}
              y1={y(pitch)}
              x2={x(next.startTick) + 8}
              y2={y(pitch)}
              stroke="var(--playhead)"
              strokeWidth={1.4}
            />
          ))
      })}
    </svg>
  )
}

function initialId(): string {
  const hash = window.location.hash.replace("#", "")
  return /^\d{3}$/.test(hash) ? hash : "001"
}

export default function App() {
  const [collection, setCollection] = useState<CollectionFile | null>(null)
  const [report, setReport] = useState<ValidationReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState(initialId)
  const [group, setGroup] = useState("all")
  const [bars, setBars] = useState("any")
  const [modeName, setModeName] = useState("any")
  const [borrowedOnly, setBorrowedOnly] = useState(false)
  const [query, setQuery] = useState("")
  const [showNotes, setShowNotes] = useState(false)
  const [theme, setTheme] = useState<ThemeId>(readStoredTheme)
  const [mode, setMode] = useState<ModeId>(readStoredMode)
  const [playing, setPlaying] = useState(false)
  const [tick, setTick] = useState(0)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [midiCheck, setMidiCheck] = useState<MidiCheck>("checking")
  const [soundOverride, setSoundOverride] = useState("")
  const engineRef = useRef<PadEngine | null>(null)
  if (!engineRef.current) engineRef.current = new PadEngine(setPlaying)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.mode = mode
    try {
      localStorage.setItem("lumen-theme", theme)
      localStorage.setItem("lumen-mode", mode)
    } catch {
      /* private mode */
    }
  }, [theme, mode])

  useEffect(() => {
    let cancel = false
    Promise.all([
      fetch(asset("data/collection.json")).then((response) => {
        if (!response.ok) throw new Error(`collection.json ${response.status}`)
        return response.json() as Promise<CollectionFile>
      }),
      fetch(asset("data/validation.json")).then((response) => {
        if (!response.ok) throw new Error(`validation.json ${response.status}`)
        return response.json() as Promise<ValidationReport>
      }),
    ])
      .then(([data, validation]) => {
        if (cancel) return
        setCollection(data)
        setReport(validation)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Could not load the collection")
      })
    return () => {
      cancel = true
    }
  }, [])

  const pattern = collection?.patterns.find((item) => item.id === selectedId) ?? collection?.patterns[0]

  useEffect(() => {
    if (!pattern) return
    let cancel = false
    setMidiCheck("checking")
    fetch(asset(`midi/${pattern.filename}`))
      .then((response) => {
        if (!response.ok) throw new Error(`MIDI ${response.status}`)
        return response.arrayBuffer()
      })
      .then((buffer) => {
        if (cancel) return
        setMidiCheck(sameNotes(parseMidiNotes(buffer), pattern.notes) ? "match" : "mismatch")
      })
      .catch(() => {
        if (!cancel) setMidiCheck("error")
      })
    return () => {
      cancel = true
    }
  }, [pattern])

  useEffect(() => {
    engineRef.current?.stop()
  }, [selectedId])

  useEffect(() => () => engineRef.current?.stop(), [])

  useEffect(() => {
    let frame = 0
    if (!playing) {
      setTick(0)
      return
    }
    const loop = () => {
      setTick(engineRef.current?.tick() ?? 0)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  const modes = useMemo(() => [...new Set(collection?.patterns.map((item) => item.collection) ?? [])], [collection])

  const visible = useMemo(() => {
    if (!collection) return []
    const needle = query.trim().toLowerCase()
    return collection.patterns.filter((item) => {
      if (group !== "all" && item.group !== group) return false
      if (bars !== "any" && String(item.bars) !== bars) return false
      if (modeName !== "any" && item.collection !== modeName) return false
      if (borrowedOnly && item.borrowed === "none") return false
      if (!needle) return true
      return [item.id, item.name, item.tonic, item.collection, item.summary, item.group, String(item.bpm)].join(" ").toLowerCase().includes(needle)
    })
  }, [collection, group, bars, modeName, borrowedOnly, query])

  function select(id: string, scroll = false) {
    setSelectedId(id)
    history.replaceState(null, "", `#${id}`)
    if (scroll) document.getElementById("lab")?.scrollIntoView({ block: "start" })
  }

  function step(direction: number) {
    if (!pattern || visible.length === 0) return
    const index = Math.max(0, visible.findIndex((item) => item.id === pattern.id))
    const next = visible[(index + direction + visible.length) % visible.length]
    select(next.id)
  }

  async function toggle() {
    if (!pattern || !engineRef.current) return
    setAudioError(null)
    try {
      await engineRef.current.toggle({
        bpm: pattern.bpm,
        loopTicks: pattern.loopTicks,
        notes: pattern.notes,
        sound: soundOverride || pattern.sound,
        treatment: pattern.treatment,
      })
    } catch (reason) {
      setAudioError(reason instanceof Error ? reason.message : "Audio could not start")
    }
  }

  const actions = useRef({ toggle, step })
  actions.current = { toggle, step }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return
      if (event.code === "Space") {
        event.preventDefault()
        void actions.current.toggle()
      } else if (event.code === "ArrowRight") {
        event.preventDefault()
        actions.current.step(1)
      } else if (event.code === "ArrowLeft") {
        event.preventDefault()
        actions.current.step(-1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (error) {
    return (
      <main className="status shell">
        <h1>Lumen Drift</h1>
        <p>{error}</p>
        <p>
          <a href={asset("lumen-drift-collection.zip")}>Download the zip without the player</a>
        </p>
      </main>
    )
  }
  if (!collection || !pattern || !report) {
    return (
      <main className="status shell">
        <p>Loading the fifty progressions and the validation report.</p>
      </main>
    )
  }

  const event = currentEvent(pattern, tick)
  const midiLabel =
    midiCheck === "match"
      ? `Parsed ${pattern.filename}: ${pattern.notes.length} notes match the table.`
      : midiCheck === "mismatch"
        ? "The MIDI file does not match the note table."
        : midiCheck === "error"
          ? "The MIDI file could not be parsed."
          : "Checking the MIDI file against the note table."

  return (
    <LabProvider value={{ collection, pattern, select, playing, toggle, tick, report, midiCheck, soundOverride, setSoundOverride }}>
      <a className="skip" href="#lab">
        Skip to the lab
      </a>
      <SiteNav />
      <ThemeBar theme={theme} mode={mode} setTheme={setTheme} setMode={setMode} />
      <main id="top">
        <Hero />
        <Marquee />
        <section className="shell section" id="lab">
          <p className="kicker">01 · Pad lab</p>
          <h2>Audition all fifty. The roll is the file.</h2>
          <p className="dek">
            The player fetches the .mid, parses it in the browser, and checks every note against the table. The synth is only a preview. Space plays. Arrows move through the filtered list.
          </p>
          <div className="filters">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, tonic, chord" aria-label="Search progressions" />
            <select value={bars} onChange={(event) => setBars(event.target.value)} aria-label="Loop length">
              <option value="any">Any length</option>
              <option value="4">4 bars</option>
              <option value="8">8 bars</option>
              <option value="16">16 bars</option>
            </select>
            <select value={modeName} onChange={(event) => setModeName(event.target.value)} aria-label="Pitch collection">
              <option value="any">Any collection</option>
              {modes.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button className="chip" type="button" aria-pressed={borrowedOnly} onClick={() => setBorrowedOnly((value) => !value)}>
              Borrowed only
            </button>
            <span className="meta-line">
              {visible.length} of {collection.patterns.length}
            </span>
          </div>
          <div className="groups">
            <button className="chip" type="button" aria-pressed={group === "all"} onClick={() => setGroup("all")}>
              All
            </button>
            {GROUP_ART.map((item) => (
              <button key={item.name} className="group-card" type="button" aria-pressed={group === item.name} onClick={() => setGroup(item.name)}>
                <img src={asset(item.image)} alt={item.alt} />
                <div>
                  <strong>{item.name}</strong>
                  <span>{collection.groups.find((entry) => entry.name === item.name)?.blurb}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="stage">
            <div className="panel list" aria-label="Progressions">
              {visible.map((item) => (
                <button key={item.id} className="piece" type="button" aria-current={item.id === pattern.id} onClick={() => select(item.id)}>
                  <b>{item.id}</b>
                  {item.name}
                  <small>
                    {item.tonic} {item.collection} · {item.bpm} bpm · {item.bars} bars · {item.events.length} events
                  </small>
                </button>
              ))}
              {visible.length === 0 && <p>No progression matches those filters.</p>}
            </div>
            <article className="panel">
              <p className="kicker">
                {pattern.id} · {pattern.group}
              </p>
              <h2>{pattern.name}</h2>
              <p>{pattern.idea}</p>
              <div className="transport">
                <button className="chip" type="button" onClick={() => step(-1)} aria-label="Previous progression">
                  Previous
                </button>
                <button className="play" type="button" aria-pressed={playing} onClick={() => void toggle()}>
                  {playing ? "Stop" : "Play"}
                </button>
                <button className="chip" type="button" onClick={() => step(1)} aria-label="Next progression">
                  Next
                </button>
                <span className="meta-line">
                  {pattern.bpm} bpm locked · {positionLabel(tick)} · {event.symbol}
                </span>
                <a className="ghost" href={asset(`midi/${pattern.filename}`)} download>
                  MIDI
                </a>
              </div>
              <p className={midiCheck === "match" ? "ok" : "warn"}>{midiLabel}</p>
              {audioError ? <p className="warn">{audioError}</p> : null}
              <p className="kicker">MIDI piano roll</p>
              <PianoRoll pattern={pattern} tick={tick} />
              <p className="kicker">Common tones between events</p>
              <HarmonyDiagram pattern={pattern} />
              <p className="warn">{pattern.summary}</p>
              <dl className="facts">
                <div>
                  <dt>Tonal center</dt>
                  <dd>
                    {pattern.tonic} {pattern.collection}. Pitch classes, C = 0: {pattern.pcs.join(" ")}.
                  </dd>
                </div>
                <div>
                  <dt>Outside / borrowed</dt>
                  <dd>
                    {pattern.outside.length ? pattern.outside.join(", ") : "none"}. {pattern.borrowed}.
                  </dd>
                </div>
                <div>
                  <dt>Voicing</dt>
                  <dd>{pattern.voicing}</dd>
                </div>
                <div>
                  <dt>Loop seam</dt>
                  <dd>{pattern.transition}</dd>
                </div>
                <div>
                  <dt>Suggestion, not in the file</dt>
                  <dd>
                    {pattern.sound}. Treatment: {pattern.treatment}. Tempo meta {pattern.mpqn} µs per quarter.
                    {soundOverride ? ` Preview patch override: ${soundOverride}.` : ""}
                  </dd>
                </div>
              </dl>
              <button className="chip" type="button" aria-pressed={showNotes} onClick={() => setShowNotes((value) => !value)}>
                {showNotes ? "Hide note table" : "Show note table"}
              </button>
              {showNotes && (
                <table className="sheet">
                  <thead>
                    <tr>
                      <th>Note</th>
                      <th>MIDI</th>
                      <th>Start</th>
                      <th>Duration</th>
                      <th>Velocity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pattern.notes.map((note) => (
                      <tr key={`${note.pitch}-${note.start}`}>
                        <td>{note.name}</td>
                        <td>{note.pitch}</td>
                        <td>{note.start}</td>
                        <td>{note.duration}</td>
                        <td>{note.velocity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <ol className="chords">
                {pattern.events.map((item) => (
                  <li key={item.number}>
                    <strong>
                      {item.number}. {item.symbol} · {item.roman}
                    </strong>
                    <div>{item.spelling.join(" ")}</div>
                    <div className="warn">{item.transition}</div>
                  </li>
                ))}
              </ol>
            </article>
          </div>
        </section>
        <HarmonyMap />
        <Mindmap />
        <SoundDesign />
        <Pipeline />
        <ValidationPanel />
        <DropBand />
        <Brief />
        <ArticleTeaser />
      </main>
      <SiteFooter />
    </LabProvider>
  )
}
