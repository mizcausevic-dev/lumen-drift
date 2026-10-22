import { useEffect, useMemo, useState } from "react"
import { useLab } from "./lab"
import { asset, GROUP_ART, THEMES, type Pattern, type ThemeId } from "./types"

const GROUP_COLOR: Record<string, string> = {
  "Suspended Light": "#c9a36a",
  "Emotional Currents": "#66fcf1",
  "Faded Memory": "#d4a574",
  "Open Horizons": "#e7d7a8",
  "Nocturnal Bloom": "#b9a0ff",
}

export const PREVIEW_PATCHES = [
  { id: "", label: "File suggestion" },
  { id: "Warm saw-based pad with a slow attack", label: "Warm saw" },
  { id: "Soft, filtered pad with a rounded upper register", label: "Soft filtered" },
  { id: "Airy digital pad with a long release", label: "Airy digital" },
  { id: "Dark pulse-based pad with gentle filter movement", label: "Dark pulse" },
  { id: "Wide, lightly detuned pad with restrained high-frequency content", label: "Wide detuned" },
] as const

const NAV = [
  ["Lab", "#lab"],
  ["Harmony map", "#map"],
  ["Mindmap", "#mindmap"],
  ["Sound", "#sound"],
  ["Pipeline", "#pipeline"],
  ["Validation", "#validation"],
  ["Brief", "#brief"],
] as const

export function soundFamily(sound: string): string {
  if (/dark pulse/i.test(sound)) return "Dark pulse"
  if (/airy/i.test(sound)) return "Airy digital"
  if (/soft, filtered/i.test(sound)) return "Soft filtered"
  if (/wide, lightly detuned/i.test(sound)) return "Wide detuned"
  return "Warm saw"
}

function holds(pattern: Pattern): number {
  return pattern.events.filter((event, index) => {
    const next = pattern.events[(index + 1) % pattern.events.length]
    return event.pitches.some((pitch) => next.pitches.includes(pitch))
  }).length
}

export function SiteNav({ article = false }: { article?: boolean }) {
  return (
    <header className="top">
      <div className="shell nav-line">
        <a className="brand" href={article ? "./" : "#top"}>
          Lumen Drift
          <small>50 nocturnal pad progressions</small>
        </a>
        <nav className="nav-links" aria-label="Primary">
          {article ? (
            <a href="./#lab">Back to the lab</a>
          ) : (
            NAV.map(([label, href]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))
          )}
          <a href={article ? "./" : "article.html"}>{article ? "Lab" : "Article"}</a>
        </nav>
        <a className="ghost" href="https://github.com/mizcausevic-dev/lumen-drift">
          Source
        </a>
      </div>
    </header>
  )
}

export function ThemeBar({
  theme,
  mode,
  setTheme,
  setMode,
}: {
  theme: ThemeId
  mode: "dark" | "light"
  setTheme: (theme: ThemeId) => void
  setMode: (mode: "dark" | "light") => void
}) {
  return (
    <div className="shell theme-row" role="toolbar" aria-label="Themes">
      {THEMES.map(([id, label]) => (
        <button key={id} className="chip" type="button" aria-pressed={theme === id} onClick={() => setTheme(id)}>
          {label}
        </button>
      ))}
      <button className="mode-toggle" type="button" aria-pressed={mode === "dark"} onClick={() => setMode(mode === "dark" ? "light" : "dark")}>
        {mode === "dark" ? "Dark" : "Light"}
      </button>
    </div>
  )
}

export function Hero() {
  const { collection, report, pattern, playing, toggle } = useLab()
  const notes = collection.patterns.reduce((sum, item) => sum + item.notes.length, 0)
  const bpms = collection.patterns.map((item) => item.bpm)
  const borrowed = collection.patterns.filter((item) => item.borrowed !== "none").length
  return (
    <section className="shell hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="meta-line">Kinetic Gain · MIDI library · listening room</p>
        <h1 id="hero-title">Pads that leave room for the rest of the song.</h1>
        <p className="dek">
          Fifty original progressions for nocturnal electronic arrangements. Audition every file here, read the voicing, then drag the same MIDI into a session.
        </p>
        <div className="transport">
          <button className="play" type="button" aria-pressed={playing} onClick={() => void toggle()}>
            {playing ? "Stop" : `Play ${pattern.id} ${pattern.name}`}
          </button>
          <a className="ghost" href={asset("lumen-drift-collection.zip")} download>
            Download the pack
          </a>
          <a href="#validation">
            {report ? `${report.summary.passed}/${report.summary.checks} validation checks passed` : "Validation report"}
          </a>
        </div>
        <p className="meta-line">Reference climate, not templates: Brian Eno, Jon Hopkins, Boards of Canada, Tycho.</p>
      </div>
      <figure className="hero-frame">
        <img
          src={asset("images/hero-lumen-drift.jpg")}
          alt="A dark room at night, with a sofa, a plant, and a synthesizer facing a wide window and an amber line on the horizon."
        />
        <figcaption>Listening room, not a replica of a record.</figcaption>
      </figure>
      <dl className="stat-grid">
        {[
          ["Patterns", String(collection.patterns.length)],
          ["Note events", String(notes)],
          ["Harmonic events", String(report?.summary.harmonic_events ?? collection.patterns.reduce((s, p) => s + p.events.length, 0))],
          ["BPM", `${Math.min(...bpms)}–${Math.max(...bpms)}`],
          ["Groups", "5"],
          ["Borrowed loops", String(borrowed)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function Marquee() {
  const { collection, select } = useLab()
  const names = collection.patterns.map((item) => `${item.id} ${item.name}`)
  const loop = [...names, ...names]
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {loop.map((name, index) => (
          <button key={`${name}-${index}`} type="button" onClick={() => select(name.slice(0, 3), true)}>
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

export function HarmonyMap() {
  const { collection, pattern, select } = useLab()
  const [hover, setHover] = useState<string | null>(null)
  const width = 1000
  const height = 520
  const pad = { l: 64, r: 24, t: 24, b: 48 }
  const points = useMemo(() => {
    const raw = collection.patterns.map((item) => ({
      item,
      xValue: item.events.length / item.bars,
      yValue: holds(item) / item.events.length,
    }))
    const groups = new Map<string, typeof raw>()
    for (const point of raw) {
      const key = `${point.xValue.toFixed(3)}|${point.yValue.toFixed(3)}`
      groups.set(key, [...(groups.get(key) ?? []), point])
    }
    return raw.map((point) => {
      const key = `${point.xValue.toFixed(3)}|${point.yValue.toFixed(3)}`
      const list = groups.get(key) ?? [point]
      const index = list.indexOf(point)
      const angle = (index / list.length) * Math.PI * 2
      const radius = list.length > 1 ? 12 : 0
      const x = pad.l + (point.xValue / 2) * (width - pad.l - pad.r) + Math.cos(angle) * radius
      const y = height - pad.b - point.yValue * (height - pad.t - pad.b) + Math.sin(angle) * radius
      return { ...point, x, y }
    })
  }, [collection])
  const shown = collection.patterns.find((item) => item.id === hover) ?? pattern
  return (
    <section className="shell section" id="map">
      <p className="kicker">02 · Harmony map</p>
      <h2>Fifty loops, plotted by how often the harmony moves and how many tones it keeps.</h2>
      <p className="dek">
        Horizontal is harmonic events per bar, computed from the event table. Vertical is the share of event boundaries, including the loop seam, that keep at least one MIDI pitch. Both numbers come from the files, not from a hand tag.
      </p>
      <div className="split">
        <svg className="score" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Scatter plot of harmonic density and common-tone connection">
          {[0, 0.5, 1].map((value) => (
            <g key={value}>
              <line x1={pad.l} x2={width - pad.r} y1={height - pad.b - value * (height - pad.t - pad.b)} y2={height - pad.b - value * (height - pad.t - pad.b)} stroke="currentColor" opacity={0.15} />
              <text x={pad.l - 8} y={height - pad.b - value * (height - pad.t - pad.b)} textAnchor="end" fill="currentColor" opacity={0.6} fontSize={12}>
                {value.toFixed(1)}
              </text>
            </g>
          ))}
          {[0.25, 0.5, 1, 2].map((value) => (
            <text key={value} x={pad.l + (value / 2) * (width - pad.l - pad.r)} y={height - 16} textAnchor="middle" fill="currentColor" opacity={0.6} fontSize={12}>
              {value}
            </text>
          ))}
          {points.map((point) => {
            const active = point.item.id === pattern.id || point.item.id === hover
            return (
              <g key={point.item.id}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={active ? 8 : 5.5}
                  fill={GROUP_COLOR[point.item.group]}
                  opacity={active ? 1 : 0.8}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(point.item.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => select(point.item.id, true)}
                >
                  <title>{`${point.item.id} ${point.item.name}`}</title>
                </circle>
              </g>
            )
          })}
        </svg>
        <aside className="panel">
          <p className="kicker">{shown.group}</p>
          <h3>
            {shown.id} {shown.name}
          </h3>
          <p>
            {shown.events.length} events in {shown.bars} bars. Common-tone boundaries {holds(shown)}/{shown.events.length}.
          </p>
          <p className="warn">{shown.summary}</p>
          <button className="play" type="button" onClick={() => select(shown.id, true)}>
            Open in the lab
          </button>
        </aside>
      </div>
    </section>
  )
}

export function Mindmap() {
  const { collection, pattern, select, report } = useLab()
  const width = 1100
  const height = 760
  const cx = width / 2
  const cy = height / 2
  return (
    <section className="shell section" id="mindmap">
      <p className="kicker">03 · Mindmap</p>
      <h2>Five rooms, fifty names, and the climate they are not copying.</h2>
      <p className="dek">Click a name to load that progression. The four names outside the tree are a reference climate, not authors of these chords.</p>
      <svg className="score" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Mindmap of the five groups and fifty progressions">
        <text x={cx} y={36} textAnchor="middle" fill="currentColor" opacity={0.7} fontSize={13}>
          Reference climate, not templates: Brian Eno · Jon Hopkins · Boards of Canada · Tycho
        </text>
        <circle cx={cx} cy={cy} r={54} fill="none" stroke="var(--accent)" />
        <text x={cx} y={cy} textAnchor="middle" fill="currentColor" fontSize={16}>
          Lumen Drift
        </text>
        {GROUP_ART.map((group, groupIndex) => {
          const angle = -Math.PI / 2 + (groupIndex * 2 * Math.PI) / 5
          const gx = cx + Math.cos(angle) * 188
          const gy = cy + Math.sin(angle) * 188
          const members = collection.patterns.filter((item) => item.group === group.name)
          return (
            <g key={group.name}>
              <line x1={cx} y1={cy} x2={gx} y2={gy} stroke={GROUP_COLOR[group.name]} opacity={0.7} />
              <text x={gx} y={gy - 14} textAnchor="middle" fill={GROUP_COLOR[group.name]} fontSize={14}>
                {group.name}
              </text>
              {members.map((item, index) => {
                const spread = (index - (members.length - 1) / 2) * 0.085
                const leaf = angle + spread
                const x = cx + Math.cos(leaf) * 330
                const y = cy + Math.sin(leaf) * 300
                const active = item.id === pattern.id
                return (
                  <text
                    key={item.id}
                    x={x}
                    y={y}
                    textAnchor={Math.cos(leaf) >= 0 ? "start" : "end"}
                    fill={active ? "var(--accent)" : "currentColor"}
                    fontSize={12}
                    style={{ cursor: "pointer" }}
                    onClick={() => select(item.id, true)}
                  >
                    {item.id} {item.name}
                  </text>
                )
              })}
            </g>
          )
        })}
      </svg>
      <div className="brief-grid">
        <article className="panel">
          <h3>Conventions</h3>
          <p>C4 is MIDI 60. 480 ticks per quarter. 4/4. Beats start at 0. Primary pad range is 48 to 84.</p>
        </article>
        <article className="panel">
          <h3>Deliverables</h3>
          <p>50 Standard MIDI files, an index, a note table, a harmonic-event table, and one zip.</p>
        </article>
        <article className="panel">
          <h3>Validation</h3>
          <p>
            {report
              ? `${report.summary.passed}/${report.summary.checks} checks passed. ${report.summary.note_events} notes matched the CSV.`
              : "The report loads with the page."}
          </p>
        </article>
        <article className="panel">
          <h3>What stays out</h3>
          <p>No bassline, no lead, no drums, no pitch bend, and no controller lanes. Those parts belong to the rest of the arrangement.</p>
        </article>
      </div>
    </section>
  )
}

export function SoundDesign() {
  const { collection, select, soundOverride, setSoundOverride } = useLab()
  const families = ["Warm saw", "Soft filtered", "Airy digital", "Dark pulse", "Wide detuned"]
  return (
    <section className="shell section" id="sound">
      <p className="kicker">04 · Sound design</p>
      <h2>The MIDI is the harmony. The patch is the sound.</h2>
      <p className="dek">
        No synth settings are written into the files. Each progression carries a playback suggestion, and the lab can preview five plain pad colors. A suggestion does not recreate anyone’s recorded instrument.
      </p>
      <div className="split">
        <figure className="hero-frame caption-stack">
          <img
            src={asset("images/medium-hero-lumen-drift.jpg")}
            alt="A dark room with a piano and a cabinet, looking through a window onto fog and a warm horizon above a tree line."
          />
          <figcaption>
            <strong>Three rules the files follow.</strong> Common tones are one MIDI note. Velocity is gentle and optional. Low notes stay sparse so a bass can sit underneath.
          </figcaption>
        </figure>
        <div className="patch-grid">
          {PREVIEW_PATCHES.map((patch) => (
            <button key={patch.label} className="panel piece" type="button" aria-pressed={soundOverride === patch.id} onClick={() => setSoundOverride(patch.id)}>
              <b>{patch.label}</b>
              <small>{patch.id || "Uses the suggestion stored with the selected progression."}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="brief-grid">
        {families.map((family) => {
          const matches = collection.patterns.filter((item) => soundFamily(item.sound) === family)
          return (
            <article key={family} className="panel">
              <h3>
                {family} · {matches.length}
              </h3>
              <ul className="plain-list">
                {matches.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => select(item.id, true)}>
                      {item.id} {item.name}
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function Pipeline() {
  const { collection } = useLab()
  const harbor = collection.patterns.find((item) => item.id === "001")
  const stages = [
    ["01", "Compose", "tools/progressions.py", "Each loop is a hand-specified list of durations, roots, qualities, and roman numerals. A chord outside the named collection must be declared or the build stops."],
    ["02", "Voice", "voice_events()", "A deterministic search picks octaves inside MIDI 48 to 84. It keeps common tones, refuses adjacent seconds inside a chord, and leaves the low register sparse."],
    ["03", "Encode", "midi_bytes()", "Format 0, one track, channel 1. Name, tempo, and 4/4 sit at tick 0. Note-offs are written before note-ons that share a tick. The end of track is the loop boundary."],
    ["04", "Validate", "parse_midi()", "The script reopens the bytes it just wrote. Notes, tempo, partitions, pitch classes, and duplicate signatures are checked against the tables."],
    ["05", "Package", "CSV · zip", "Index, notes, and harmony tables are written beside the files. The zip is packed only after the implemented checks pass."],
    ["06", "Ship", "Vite · gh-pages", "This page reads the same collection JSON and the same MIDI files as the download. The browser parses the selected .mid and compares it with the note table."],
  ]
  return (
    <section className="shell section" id="pipeline">
      <p className="kicker">05 · Pipeline</p>
      <h2>From a written chord plan to a file a DAW can loop.</h2>
      <p className="dek">The voicing search chooses octaves. It does not choose the chords, the tempo, or the length. Those are written in the plan.</p>
      <ol className="pipeline">
        {stages.map(([n, title, artifact, body]) => (
          <li key={n} className="panel">
            <span className="kicker">{n}</span>
            <h3>{title}</h3>
            <p className="meta-line">{artifact}</p>
            <p>{body}</p>
          </li>
        ))}
      </ol>
      {harbor && (
        <div className="panel decoder">
          <p className="kicker">Live decoder · 001 Glass Harbor</p>
          <p className="warn">
            Each row is an intended chord. The pitches are the voicing in the file. Held tones are one note that crosses the event, so a pitch can be named here without a new note-on at that tick.
          </p>
          <ol className="chords">
            {harbor.events.map((event) => (
              <li key={event.number}>
                <strong>
                  {event.symbol} · {event.roman}
                </strong>
                <div>{event.spelling.join(" ")}</div>
                <div className="warn">
                  Tick {event.startTick} for {event.durationTicks} ticks. {event.comment}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

export function ValidationPanel() {
  const { report } = useLab()
  if (!report) {
    return (
      <section className="shell section" id="validation">
        <p>Loading the validation report.</p>
      </section>
    )
  }
  return (
    <section className="shell section" id="validation">
      <p className="kicker">06 · Validation</p>
      <h2>Checks that ran, and the limits written next to them.</h2>
      <p className="dek">This panel reads data/validation.json, written by the same script that built the MIDI. A failed check would be listed. Nothing here is a projected result.</p>
      <div className="split">
        <div className="panel">
          <p className="stat-inline">
            {report.summary.passed}/{report.summary.checks}
          </p>
          <p className="warn">checks passed</p>
          <dl className="facts">
            <div>
              <dt>MIDI files</dt>
              <dd>{report.summary.midi_files}</dd>
            </div>
            <div>
              <dt>Note events</dt>
              <dd>{report.summary.note_events}</dd>
            </div>
            <div>
              <dt>Harmonic events</dt>
              <dd>{report.summary.harmonic_events}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>{report.summary.failed}</dd>
            </div>
          </dl>
          <p className="warn">Payload SHA-256 {report.payload_sha256}</p>
          <p>
            <a href={asset("data/validation.json")}>Raw validation JSON</a>
          </p>
          <p>
            <a href={asset("VALIDATION-REPORT-Cursor.md")}>Markdown report</a>
          </p>
        </div>
        <div>
          <ol className="chords">
            {report.checks.map((check) => (
              <li key={check.id}>
                <strong>
                  {check.status === "pass" ? "Pass" : "Fail"} · {check.name}
                </strong>
                <div className="warn">{check.detail}</div>
              </li>
            ))}
          </ol>
          <div className="panel">
            <h3>Limits</h3>
            <ul>
              {report.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="warn">
              Shared roman sequences: {report.shared_roman_sequences.length ? report.shared_roman_sequences.map((item) => item.ids.join(", ")).join("; ") : "none"}. Shared harmonic rhythms:{" "}
              {report.shared_harmonic_rhythms.length ? report.shared_harmonic_rhythms.map((item) => item.ids.join(", ")).join("; ") : "none"}.
            </p>
            <pre className="code">{report.reproduce}</pre>
          </div>
        </div>
      </div>
    </section>
  )
}

export function DropBand() {
  const [size, setSize] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    fetch(asset("lumen-drift-collection.zip"), { method: "HEAD" })
      .then((response) => {
        const length = Number(response.headers.get("content-length"))
        if (alive && response.ok && length > 0) setSize(length)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  return (
    <section className="shell drop" aria-labelledby="drop-title">
      <p className="kicker">The download</p>
      <h2 id="drop-title">Take all fifty into the session.</h2>
      <p>
        One zip with 50 Standard MIDI files, the index, the note table, the harmonic-event table, the README, and the validation report. Loop length is in the index. A DAW will not infer it.
      </p>
      <div className="transport">
        <a className="play" href={asset("lumen-drift-collection.zip")} download>
          Download the zip{size ? ` · ${(size / 1024).toFixed(0)} KB` : ""}
        </a>
        <a href={asset("data/index.csv")} download>
          Index CSV
        </a>
        <a href={asset("data/notes.csv")} download>
          Notes CSV
        </a>
        <a href={asset("data/harmony.csv")} download>
          Harmony CSV
        </a>
      </div>
    </section>
  )
}

const POINTS = [
  ["01", "What it is", "Fifty loopable pad progressions and a browser lab that plays the same MIDI the zip contains."],
  ["02", "Who it is for", "Producers writing nocturnal electronic music who want a voiced pad, not a list of chord symbols."],
  ["03", "Why it is useful", "Common tones are held, the low end stays sparse, and the documentation says which notes are outside the scale."],
  ["04", "How it is built", "A Python script with no third-party packages writes the MIDI, checks the bytes it wrote, and publishes the tables this page reads."],
  ["05", "How people find it", "Search phrases such as MIDI pad progressions, synthwave chords, and darkwave harmony, plus the essay and the GitHub topics."],
  ["06", "How people use it", "Filter by group, mode, and length. Read the voicing. Play a preview. Download one file or the pack."],
  ["07", "How they convert", "The download is the action. There is no account and no mailing list."],
  ["08", "Money", "This release is free. A paid pack with finished sounds does not exist, and this page does not invent a price."],
  ["09", "Launch", "The source is on GitHub. This page is the GitHub Pages build. The essay is in the repository and has not been posted to Medium from here."],
  ["10", "After launch", "Add a progression only when it passes the same duplicate and voicing checks. Transposing these files is not a new composition."],
]

const KPIS = [
  ["Pack downloads per visit", "Not measured", "No analytics are installed. A later privacy notice would have to come first."],
  ["Loops played through once", "Not measured", "The player does not report completion anywhere."],
  ["Essay to lab clicks", "Not measured", "The article link is a normal page link, with no tracker."],
]

export function Brief() {
  return (
    <section className="shell section" id="brief">
      <p className="kicker">07 · Product brief</p>
      <h2>What this is, and what it refuses to pretend.</h2>
      <ol className="brief-grid">
        {POINTS.map(([n, title, body]) => (
          <li key={n} className="panel">
            <span className="kicker">{n}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>
      <div className="panel">
        <h3>Measures that are not wired</h3>
        <p className="warn">This site sets no cookies and loads no analytics. The table is a plan, not a dashboard.</p>
        <table className="sheet">
          <thead>
            <tr>
              <th>Question</th>
              <th>Status</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {KPIS.map(([question, status, why]) => (
              <tr key={question}>
                <td>{question}</td>
                <td>{status}</td>
                <td>{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ArticleTeaser() {
  return (
    <section className="shell essay">
      <div>
        <p className="kicker">08 · Field notes</p>
        <h2>Lumen Drift: MIDI pad progressions that leave room for bass and melody</h2>
        <p>The long essay is the writing in the repository: what a pad part is for, how the five groups differ, and which checks ran. It was not posted to Medium from this project.</p>
        <p>
          <a className="play" href="article.html">
            Read the essay
          </a>
        </p>
      </div>
      <figure className="hero-frame">
        <img
          src={asset("images/group-open-horizons.jpg")}
          alt="A wide grass field under a pale warm sky, with low hills on the horizon."
        />
      </figure>
    </section>
  )
}

export function SiteFooter({ article = false }: { article?: boolean }) {
  return (
    <footer className="shell foot">
      <div>
        <strong>Lumen Drift</strong>
        <p>Fifty pad progressions and the script that checks them. Built for Miz Causevic at Kinetic Gain.</p>
      </div>
      <div>
        <p className="kicker">Project</p>
        <p>
          <a href="https://github.com/mizcausevic-dev/lumen-drift">Source on GitHub</a>
        </p>
        <p>
          <a href={article ? "./article.html" : "article.html"}>The essay</a>
        </p>
        <p>
          <a href={article ? "./#validation" : "#validation"}>Validation</a>
        </p>
      </div>
      <div>
        <p className="kicker">Fine print</p>
        <p>Illustrations were generated for this project. They contain no title text.</p>
        <p>No cookies, no analytics, no forms. The theme is stored in this browser. Audio is synthesized locally and is not part of the MIDI.</p>
      </div>
    </footer>
  )
}
