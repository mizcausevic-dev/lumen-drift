import type { NoteEvent } from "./types"

export type PadOptions = {
  bpm: number
  loopTicks: number
  notes: NoteEvent[]
  sound: string
  treatment: string
}

const TPQ = 480

function attackSeconds(sound: string): number {
  if (/moderate/i.test(sound)) return 0.07
  if (/slow/i.test(sound)) return 0.62
  return 0.32
}

function releaseSeconds(sound: string): number {
  if (/long release/i.test(sound)) return 1.6
  if (/moderate/i.test(sound)) return 0.35
  return 0.85
}

function filterHz(sound: string): number {
  if (/dark pulse/i.test(sound)) return 720
  if (/airy/i.test(sound)) return 2400
  if (/soft, filtered/i.test(sound)) return 1400
  if (/restrained high/i.test(sound)) return 1600
  return 1100
}

function waveFor(sound: string): OscillatorType {
  if (/pulse/i.test(sound)) return "square"
  if (/soft, filtered/i.test(sound)) return "triangle"
  return "sawtooth"
}

function noise(length: number): Float32Array<ArrayBuffer> {
  const data = new Float32Array(length)
  let state = 0x6d2b79f5
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    data[i] = (state / 0xffffffff) * 2 - 1
  }
  return data
}

function impulse(ctx: AudioContext): AudioBuffer {
  const seconds = 1.7
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    const seed = noise(length)
    for (let i = 0; i < length; i += 1) {
      data[i] = seed[(i + channel * 17) % length] * (1 - i / length) ** 2.6
    }
  }
  return buffer
}

function saturationCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(256)
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(x * 1.8)
  }
  return curve
}

/**
 * Preview synth for the listening room.
 * It is not the MIDI file and it is not a recreation of anyone's recorded pad.
 */
export class PadEngine {
  private ctx: AudioContext | null = null
  private sources: AudioScheduledSourceNode[] = []
  private timer = 0
  private generation = 0
  private origin = 0
  private secondsPerTick = 0
  private loopSeconds = 1
  private nextLoop = 0
  private playing = false
  private readonly onChange: (playing: boolean) => void

  constructor(onChange: (playing: boolean) => void) {
    this.onChange = onChange
  }

  get isPlaying(): boolean {
    return this.playing
  }

  tick(): number {
    if (!this.playing || !this.ctx) return 0
    const elapsed = this.ctx.currentTime - this.origin
    const wrapped = ((elapsed % this.loopSeconds) + this.loopSeconds) % this.loopSeconds
    return wrapped / this.secondsPerTick
  }

  async toggle(options: PadOptions): Promise<void> {
    if (this.playing) {
      this.stop()
      return
    }
    await this.start(options)
  }

  stop(): void {
    this.generation += 1
    this.playing = false
    window.clearInterval(this.timer)
    this.timer = 0
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        /* already stopped */
      }
    }
    this.sources = []
    this.onChange(false)
  }

  private async start(options: PadOptions): Promise<void> {
    const ctx = this.ctx ?? new AudioContext()
    this.ctx = ctx
    if (ctx.state === "suspended") await ctx.resume()
    this.stop()
    const generation = this.generation
    this.secondsPerTick = 60 / options.bpm / TPQ
    this.loopSeconds = options.loopTicks * this.secondsPerTick
    this.origin = ctx.currentTime + 0.06
    this.nextLoop = 0
    this.playing = true
    this.onChange(true)

    const master = ctx.createGain()
    master.gain.value = 0.22
    const filter = ctx.createBiquadFilter()
    filter.type = "lowpass"
    filter.frequency.value = filterHz(options.sound)
    filter.Q.value = 0.6
    filter.connect(master)

    let head: AudioNode = filter
    if (/saturation/i.test(options.treatment)) {
      const shaper = ctx.createWaveShaper()
      shaper.curve = saturationCurve()
      shaper.oversample = "2x"
      filter.disconnect()
      filter.connect(shaper)
      shaper.connect(master)
      head = shaper
    }

    if (/reverb/i.test(options.treatment)) {
      const wet = ctx.createGain()
      wet.gain.value = 0.28
      const convolver = ctx.createConvolver()
      convolver.buffer = impulse(ctx)
      head.connect(convolver)
      convolver.connect(wet)
      wet.connect(master)
    }

    if (/chorus/i.test(options.treatment)) {
      const wet = ctx.createGain()
      wet.gain.value = 0.22
      const delay = ctx.createDelay()
      delay.delayTime.value = 0.016
      head.connect(delay)
      delay.connect(wet)
      wet.connect(master)
    }

    if (/filter/i.test(options.treatment)) {
      const lfo = ctx.createOscillator()
      const depth = ctx.createGain()
      lfo.frequency.value = 0.06
      depth.gain.value = 220
      lfo.connect(depth)
      depth.connect(filter.frequency)
      lfo.start()
      this.sources.push(lfo)
    }

    master.connect(ctx.destination)
    const voiceHead = filter

    const schedule = () => {
      if (generation !== this.generation || !this.ctx) return
      const horizon = this.ctx.currentTime + 2.4
      while (this.origin + this.nextLoop * this.loopSeconds < horizon) {
        this.scheduleLoop(options, this.nextLoop, voiceHead, generation)
        this.nextLoop += 1
        if (this.nextLoop > 200) break
      }
    }
    schedule()
    this.timer = window.setInterval(schedule, 200)
  }

  private scheduleLoop(options: PadOptions, loopIndex: number, destination: AudioNode, generation: number): void {
    const ctx = this.ctx
    if (!ctx || generation !== this.generation) return
    const loopOrigin = this.origin + loopIndex * this.loopSeconds
    const attack = attackSeconds(options.sound)
    const release = releaseSeconds(options.sound)
    const type = waveFor(options.sound)
    const spread = /detun/i.test(options.sound) ? 9 : 4
    const unstable = /pitch/i.test(options.treatment)

    for (const note of options.notes) {
      const when = loopOrigin + note.start * this.secondsPerTick
      if (when < ctx.currentTime - 0.03) continue
      const dur = Math.max(0.05, note.duration * this.secondsPerTick)
      const level = Math.max(0.02, (note.velocity / 127) * 0.16)
      const usedAttack = Math.min(attack, dur * 0.45)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, when)
      gain.gain.exponentialRampToValueAtTime(level, when + usedAttack)
      gain.gain.setValueAtTime(level, when + dur)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur + release)
      gain.connect(destination)

      for (const sign of [-1, 1]) {
        const osc = ctx.createOscillator()
        osc.type = type
        osc.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12)
        const detune = sign * spread
        osc.detune.setValueAtTime(detune, when)
        if (unstable) {
          osc.detune.linearRampToValueAtTime(detune + sign * 7, when + Math.min(dur, 7))
        }
        osc.connect(gain)
        osc.start(when)
        osc.stop(when + dur + release + 0.05)
        this.sources.push(osc)
      }
    }
  }
}
