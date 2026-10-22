import { createContext, useContext } from "react"
import type { CollectionFile, Pattern, ValidationReport } from "./types"

export type MidiCheck = "checking" | "match" | "mismatch" | "error"

export type LabValue = {
  collection: CollectionFile
  pattern: Pattern
  select: (id: string, scroll?: boolean) => void
  playing: boolean
  toggle: () => void
  tick: number
  report: ValidationReport | null
  midiCheck: MidiCheck
  soundOverride: string
  setSoundOverride: (value: string) => void
}

const LabContext = createContext<LabValue | null>(null)

export const LabProvider = LabContext.Provider

export function useLab(): LabValue {
  const value = useContext(LabContext)
  if (!value) throw new Error("Lab context is missing")
  return value
}
