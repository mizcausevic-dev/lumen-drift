import { useEffect, useMemo, useState, type ReactNode } from "react"
import articleMd from "../../article/lumen-drift-medium-Cursor.md?raw"
import { SiteFooter, SiteNav, ThemeBar } from "./sections"
import { readStoredMode, readStoredTheme, type ModeId, type ThemeId } from "./types"

type Inline = { kind: "text" | "strong" | "code" | "link"; text: string; href?: string }

function inline(source: string): Inline[] {
  const parts: Inline[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let cursor = 0
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) parts.push({ kind: "text", text: source.slice(cursor, index) })
    const token = match[0]
    if (token.startsWith("**")) parts.push({ kind: "strong", text: token.slice(2, -2) })
    else if (token.startsWith("`")) parts.push({ kind: "code", text: token.slice(1, -1) })
    else {
      const linked = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (linked) parts.push({ kind: "link", text: linked[1], href: linked[2] })
    }
    cursor = index + token.length
  }
  if (cursor < source.length) parts.push({ kind: "text", text: source.slice(cursor) })
  return parts
}

function InlineText({ source }: { source: string }) {
  return (
    <>
      {inline(source).map((part, index) => {
        if (part.kind === "strong") return <strong key={index}>{part.text}</strong>
        if (part.kind === "code") return <code key={index}>{part.text}</code>
        if (part.kind === "link" && part.href) {
          const href = part.href.includes("medium-hero") ? "images/medium-hero-lumen-drift.jpg" : part.href
          return (
            <a key={index} href={href}>
              {part.text}
            </a>
          )
        }
        return <span key={index}>{part.text}</span>
      })}
    </>
  )
}

function articleBlocks(markdown: string): ReactNode[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const blocks: ReactNode[] = []
  let index = 0
  let key = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }
    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/)
    if (image) {
      const src = image[2].includes("medium-hero") ? "images/medium-hero-lumen-drift.jpg" : image[2]
      blocks.push(<img key={key} src={src} alt={image[1]} />)
      key += 1
      index += 1
      continue
    }
    if (line.startsWith("### ")) {
      blocks.push(<h3 key={key}>{line.slice(4)}</h3>)
      key += 1
      index += 1
      continue
    }
    if (line.startsWith("## ")) {
      const text = line.slice(3)
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      blocks.push(
        <h2 key={key} id={id}>
          {text}
        </h2>,
      )
      key += 1
      index += 1
      continue
    }
    if (line.startsWith("# ")) {
      blocks.push(<h1 key={key}>{line.slice(2)}</h1>)
      key += 1
      index += 1
      continue
    }
    if (line.startsWith("- ")) {
      const items: string[] = []
      while (index < lines.length && lines[index].startsWith("- ")) {
        items.push(lines[index].slice(2))
        index += 1
      }
      blocks.push(
        <ul key={key}>
          {items.map((item) => (
            <li key={item}>
              <InlineText source={item} />
            </li>
          ))}
        </ul>,
      )
      key += 1
      continue
    }
    if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\. /.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\. /, ""))
        index += 1
      }
      blocks.push(
        <ol key={key}>
          {items.map((item) => (
            <li key={item}>
              <InlineText source={item} />
            </li>
          ))}
        </ol>,
      )
      key += 1
      continue
    }
    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() && !lines[index].startsWith("#") && !lines[index].startsWith("- ") && !lines[index].startsWith("!") && !/^\d+\. /.test(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(
      <p key={key}>
        <InlineText source={paragraph.join(" ")} />
      </p>,
    )
    key += 1
  }
  return blocks
}

export default function ArticlePage() {
  const [theme, setTheme] = useState<ThemeId>(readStoredTheme)
  const [mode, setMode] = useState<ModeId>(readStoredMode)
  const [copied, setCopied] = useState(false)
  const [progress, setProgress] = useState(0)
  const blocks = useMemo(() => articleBlocks(articleMd), [])
  const toc = useMemo(() => {
    const found: { id: string; text: string }[] = []
    for (const line of articleMd.split("\n")) {
      if (line.startsWith("## ")) {
        const text = line.slice(3)
        found.push({ text, id: text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })
      }
    }
    return found
  }, [])
  const minutes = Math.max(1, Math.round(articleMd.split(/\s+/).length / 220))

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
    const onScroll = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      setProgress(max > 0 ? Math.min(1, doc.scrollTop / max) : 0)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <>
      <div className="read-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      <SiteNav article />
      <ThemeBar theme={theme} mode={mode} setTheme={setTheme} setMode={setMode} />
      <main className="shell article-layout">
        <article className="prose">
          <p className="warn">
            <a href="./">Back to the lab</a> · repository essay · about {minutes} min · not posted to Medium from this project
          </p>
          {blocks}
          <div className="panel">
            <h2>Take the Markdown</h2>
            <p>Copy the source or download it. The hero image is images/medium-hero-lumen-drift.jpg.</p>
            <div className="transport">
              <button
                className="play"
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(articleMd).then(() => {
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 1600)
                  })
                }}
              >
                {copied ? "Copied" : "Copy Markdown"}
              </button>
              <a href="article/lumen-drift-medium-Cursor.md" download>
                Download .md
              </a>
            </div>
          </div>
        </article>
        <aside className="toc">
          <p className="kicker">On this page</p>
          <ol>
            {toc.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.text}</a>
              </li>
            ))}
          </ol>
          <a className="play" href="./#lab">
            Open the lab
          </a>
        </aside>
      </main>
      <SiteFooter article />
    </>
  )
}
