import { useEffect, useMemo, useRef, useState } from "react"
import { PadEngine } from "./audio"
import {
  GROUP_ART,
  THEMES,
  asset,
  readStoredMode,
  readStoredTheme,
  type CollectionFile,
  type ModeId,
  type Pattern,
  type ThemeId,
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
  const top = 14
  const pitches = pattern.notes.map((note) => note.pitch)
  const lo = Math.min(...pitches)
  const hi = Math.max(...pitches)
  const span = Math.max(1, hi - lo)
  const innerH = height - 28
  const x = (value: number) => left + (value / pattern.loopTicks) * (width - left - 10)
  const y = (pitch: number) => top + ((hi - pitch) / span) * innerH
  const row = Math.max(4, innerH / (span + 1) - 1)
  return (
    <svg className="roll" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`MIDI piano roll for ${pattern.name}`}>
      {[lo, hi].map((pitch) => (
        <text key={pitch} x={4} y={y(pitch) + 8} fill="currentColor" opacity={0.55} fontSize={10} fontFamily="ui-monospace, monospace">
          {pitch}
        </text>
      ))}
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
      <text x={left} y={14} fill="currentColor" opacity={0.6} fontSize={11} fontFamily="ui-monospace, monospace">
        Intended harmony. Lines are pitches held from one event into the next.
      </text>
      {pattern.events.map((event) => {
        const x0 = x(event.startTick)
        const x1 = x(event.startTick + event.durationTicks)
        return (
          <g key={event.number}>
            <rect x={x0} y={188} width={Math.max(1, x1 - x0 - 2)} height={36} fill="var(--note)" opacity={0.18} />
            <text x={x0 + 4} y={210} fill="currentColor" fontSize={11} fontFamily="ui-monospace, monospace">
              {event.number}. {event.roman}
            </text>
            {event.pitches.map((pitch) => (
              <circle key={pitch} cx={x0 + 8} cy={y(pitch)} r={3.2} fill="var(--note)" />
            ))}
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

export default function App() {
  const [collection, setCollection] = useState<CollectionFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState("001")
  const [group, setGroup] = useState<string>("all")
  const [theme, setTheme] = useState<ThemeId>(readStoredTheme)
  const [mode, setMode] = useState<ModeId>(readStoredMode)
  const [playing, setPlaying] = useState(false)
  const [tick, setTick] = useState(0)
  const [audioError, setAudioError] = useState<string | null>(null)
  const engineRef = useRef<PadEngine | null>(null)

  if (!engineRef.current) {
    engineRef.current = new PadEngine(setPlaying)
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.mode = mode
    try {
      localStorage.setItem("lumen-theme", theme)
      localStorage.setItem("lumen-mode", mode)
    } catch {
      /* ignore */
    }
  }, [theme, mode])

  useEffect(() => {
    let cancel = false
    fetch(asset("data/collection.json"))
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load collection.json (${response.status})`)
        return response.json() as Promise<CollectionFile>
      })
      .then((data) => {
        if (!cancel) setCollection(data)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Could not load the collection")
      })
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    engineRef.current?.stop()
  }, [selectedId])

  useEffect(() => {
    return () => engineRef.current?.stop()
  }, [])

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

  const visible = useMemo(() => {
    if (!collection) return []
    if (group === "all") return collection.patterns
    return collection.patterns.filter((pattern) => pattern.group === group)
  }, [collection, group])

  const pattern = collection?.patterns.find((item) => item.id === selectedId) ?? visible[0]

  function step(direction: number) {
    if (!pattern || visible.length === 0) return
    const index = visible.findIndex((item) => item.id === pattern.id)
    const next = visible[(index + direction + visible.length) % visible.length]
    setSelectedId(next.id)
  }

  async function toggle() {
    if (!pattern || !engineRef.current) return
    setAudioError(null)
    try {
      await engineRef.current.toggle({
        bpm: pattern.bpm,
        loopTicks: pattern.loopTicks,
        notes: pattern.notes,
        sound: pattern.sound,
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
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return
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

  function chooseGroup(name: string) {
    setGroup(name)
    if (!collection) return
    const pool = name === "all" ? collection.patterns : collection.patterns.filter((item) => item.group === name)
    if (!pool.some((item) => item.id === selectedId) && pool[0]) setSelectedId(pool[0].id)
  }

  if (error) {
    return (
      <main className="status shell">
        <div>
          <h1>Lumen Drift</h1>
          <p>{error}</p>
        </div>
      </main>
    )
  }
  if (!collection || !pattern) {
    return (
      <main className="status shell">
        <p>Loading the fifty progressions.</p>
      </main>
    )
  }

  const event = currentEvent(pattern, tick)
  const outside = pattern.outside.length ? pattern.outside.join(", ") : "none"

  return (
    <>
      <a className="skip" href="#stage">
        Skip to the player
      </a>
      <header className="top">
        <div className="shell top-row">
          <a className="brand" href="#top">
            Lumen Drift
            <small>50 nocturnal pad progressions</small>
          </a>
          <button className="mode-toggle" type="button" aria-pressed={mode === "dark"} onClick={() => setMode(mode === "dark" ? "light" : "dark")}>
            {mode === "dark" ? "Dark" : "Light"}
          </button>
        </div>
        <div className="shell theme-row" role="toolbar" aria-label="Themes">
          {THEMES.map(([id, label]) => (
            <button key={id} className="chip" type="button" aria-pressed={theme === id} onClick={() => setTheme(id)}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <main id="top">
        <section className="shell hero">
          <div className="hero-copy">
            <p className="meta-line">Kinetic Gain · MIDI library · listening room</p>
            <h1>Pads that leave room for the rest of the song.</h1>
            <p className="dek">
              Fifty original progressions for nocturnal electronic arrangements. Sustained harmony, small inner movements, and space under the chord for a bass and above it for a melody.
            </p>
            <p className="meta-line">Reference climate, not templates: Brian Eno, Jon Hopkins, Boards of Canada, Tycho.</p>
          </div>
          <figure className="hero-frame">
            <img src={asset("images/hero-lumen-drift.jpg")} alt="A dark room at night, with a sofa, a plant, and a synthesizer facing a wide window and an amber line on the horizon." />
            <figcaption>Listening room, not a replica of a record.</figcaption>
          </figure>
        </section>

        <section className="shell" aria-label="Groups">
          <div className="transport">
            <button className="chip" type="button" aria-pressed={group === "all"} onClick={() => chooseGroup("all")}>
              All fifty
            </button>
          </div>
          <div className="groups">
          {GROUP_ART.map((item) => (
            <button key={item.name} className="group-card" type="button" aria-pressed={group === item.name} onClick={() => chooseGroup(item.name)}>
              <img src={asset(item.image)} alt={item.alt} />
              <div>
                <strong>{item.name}</strong>
                <span>{collection.groups.find((entry) => entry.name === item.name)?.blurb}</span>
              </div>
            </button>
          ))}
          </div>
        </section>

        <section className="shell stage" id="stage">
          <div className="panel list" aria-label="Progressions">
            {visible.map((item) => (
              <button key={item.id} className="piece" type="button" aria-current={item.id === pattern.id} onClick={() => setSelectedId(item.id)}>
                <b>{item.id}</b>
                {item.name}
                <small>
                  {item.tonic} {item.collection} · {item.bpm} bpm · {item.bars} bars
                </small>
              </button>
            ))}
          </div>

          <article className="panel">
            <p className="kicker">
              {pattern.id} · {pattern.group}
            </p>
            <h2>
              {pattern.name}
            </h2>
            <p>{pattern.idea}</p>
            <div className="transport">
              <button className="play" type="button" aria-pressed={playing} onClick={() => void toggle()}>
                {playing ? "Stop" : "Play"}
              </button>
              <span className="meta-line">
                {pattern.bpm} bpm locked · {pattern.bars} bars · {positionLabel(tick)} · {event.symbol}
              </span>
              <a className="ghost" href={asset(`midi/${pattern.filename}`)} download>
                MIDI
              </a>
              <a className="ghost" href={asset("lumen-drift-collection.zip")} download>
                All 50 zip
              </a>
            </div>
            <p className="warn">Space plays. Left and right arrows change progression. The browser synth is a preview. It is not printed in the MIDI.</p>
            {audioError ? <p className="warn">{audioError}</p> : null}

            <p className="kicker">MIDI piano roll</p>
            <PianoRoll pattern={pattern} tick={tick} />

            <p className="kicker">Harmonic rhythm</p>
            <HarmonyDiagram pattern={pattern} />
            <p className="warn">{pattern.summary}</p>

            <dl className="facts">
              <div>
                <dt>Tonal center and collection</dt>
                <dd>
                  {pattern.tonic} {pattern.collection}. Pitch classes, C = 0: {pattern.pcs.join(" ")}.
                </dd>
              </div>
              <div>
                <dt>Outside the collection</dt>
                <dd>
                  {outside}. Borrowed: {pattern.borrowed}.
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
                <dt>Playback suggestion, not MIDI</dt>
                <dd>
                  {pattern.sound}. Treatment: {pattern.treatment}. Tempo meta: {pattern.mpqn} µs per quarter.
                </dd>
              </div>
            </dl>

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
        </section>

        <section className="shell map" aria-label="Collection mindmap">
          <p className="map-climate">Reference climate, not templates. Brian Eno. Jon Hopkins. Boards of Canada. Tycho. None of these loops is labeled as their work.</p>
          <div className="hub">Lumen Drift</div>
          <div className="map-board">
            {GROUP_ART.map((item) => (
              <div className="map-col" key={item.name}>
                <h3>{item.name}</h3>
                {collection.patterns
                  .filter((entry) => entry.group === item.name)
                  .map((entry) => (
                    <button key={entry.id} type="button" aria-current={entry.id === pattern.id} onClick={() => setSelectedId(entry.id)}>
                      <span>{entry.id}</span>
                      {entry.name}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </section>

        <section className="shell essay">
          <div>
            <h2>What you are holding</h2>
            <ol className="points">
              <li>Fifty loopable pad progressions, five groups of ten.</li>
              <li>For producers who want a voiced pad, not a list of chord symbols.</li>
              <li>Common tones are held. The low end stays sparse. The top usually stays open.</li>
              <li>Groups: Suspended Light, Emotional Currents, Faded Memory, Open Horizons, Nocturnal Bloom.</li>
              <li>Find a loop by group, tonic, or tempo.</li>
              <li>Play it, read the voicing, then download the MIDI.</li>
              <li>The download is the action. There is no account.</li>
              <li>This release is a free portfolio library. A paid sound pack does not exist here.</li>
              <li>The listening room is the public page. The source of the files is the repository.</li>
              <li>Add a progression only when it passes the same duplicate and voicing checks.</li>
            </ol>
            <p className="warn">
              A DAW will not infer the loop length. Each file declares 4, 8, or 16 bars in the index. Structural MIDI looping is not a promise of a seamless audio loop: release tails from the end can overlap the start.
            </p>
          </div>
          <figure className="hero-frame">
            <img src={asset("images/medium-hero-lumen-drift.jpg")} alt="A dark room with a piano and a cabinet, looking through a window onto fog and a warm horizon above a tree line." />
            <figcaption>Field notes live in the Medium draft in the repository.</figcaption>
          </figure>
        </section>
      </main>
      <footer className="shell foot">
        <p>
          Lumen Drift. Kinetic Gain. Pitch, timing, and velocity are in the MIDI. Texture is the instrument you load.{" "}
          <a href="https://github.com/mizcausevic-dev/lumen-drift/blob/main/article/lumen-drift-medium-Cursor.md">Field notes</a>
        </p>
      </footer>
    </>
  )
}
