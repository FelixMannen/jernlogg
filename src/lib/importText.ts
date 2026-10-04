// Parser for the Jernlogg text format v1 (see feedback from David, 2026-10-04).
// Pure functions – no store access – so it can be unit tested.

export type ParsedSet = { reps: number; weight: number }
export type ParsedExercise = { name: string; sets: ParsedSet[]; line: number }
export type ParseError = { line: number; text: string; message: string }
export type ParseResult = {
  user?: string // raw value of "bruker:"
  date?: { y: number; m: number; d: number; hh: number; mm: number }
  duration?: number // minutes
  note?: string
  exercises: ParsedExercise[]
  errors: ParseError[]
}

/** Decode the d= value of an import link the way an AI tends to produce it. */
export function decodeImportParam(raw: string): string {
  const plus = raw.replace(/\+/g, ' ')
  try {
    return decodeURIComponent(plus)
  } catch {
    // fall back to decoding only the valid %XX sequences one by one
    try {
      return plus.replace(/(%[0-9a-f]{2})+/gi, (m) => {
        try {
          return decodeURIComponent(m)
        } catch {
          return m
        }
      })
    } catch {
      return plus
    }
  }
}

/** Pull the d= payload out of a hash/url/pasted string. Returns null if there is none. */
export function extractImportParam(s: string): string | null {
  const i = s.search(/[?&]d=/)
  if (i < 0) return null
  let rest = s.slice(i + 3)
  // stop at another query parameter (&key=), but keep "&" inside the text otherwise
  const m = rest.match(/&(?=[a-z_]+=)/i)
  if (m && m.index !== undefined) rest = rest.slice(0, m.index)
  return rest
}

const META = new Set(['bruker', 'dato', 'varighet', 'notat'])
const SXRXKG = /^(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)$/i
const RXKG = /^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)$/i

export function parseWorkoutText(text: string): ParseResult {
  const res: ParseResult = { exercises: [], errors: [] }
  const lines = text.split(/\r?\n|;/)
  const byKey = new Map<string, ParsedExercise>()
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) return
    const colon = line.indexOf(':')
    if (colon < 0) {
      res.errors.push({ line: lineNo, text: line, message: 'mangler «:» – forventet «Øvelse: sett» eller «nøkkel: verdi»' })
      return
    }
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    const k = key.toLowerCase()
    if (META.has(k)) {
      if (k === 'bruker') res.user = value
      else if (k === 'notat') res.note = value
      else if (k === 'varighet') {
        const n = value.match(/^(\d+)\s*(min)?$/i)
        if (n) res.duration = parseInt(n[1], 10)
        else res.errors.push({ line: lineNo, text: line, message: 'varighet må være antall minutter (heltall)' })
      } else if (k === 'dato') {
        const d = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2})[:.](\d{2}))?$/)
        if (d) {
          const [y, m, dd] = [parseInt(d[1]), parseInt(d[2]), parseInt(d[3])]
          const hh = d[4] != null ? parseInt(d[4]) : 12
          const mm = d[5] != null ? parseInt(d[5]) : 0
          const test = new Date(y, m - 1, dd, hh, mm)
          if (test.getMonth() === m - 1 && hh < 24 && mm < 60) res.date = { y, m, d: dd, hh, mm }
          else res.errors.push({ line: lineNo, text: line, message: 'ugyldig dato' })
        } else res.errors.push({ line: lineNo, text: line, message: 'dato må være «ÅÅÅÅ-MM-DD HH:MM» eller «ÅÅÅÅ-MM-DD»' })
      }
      return
    }
    if (!key) {
      res.errors.push({ line: lineNo, text: line, message: 'mangler navn på øvelsen før «:»' })
      return
    }
    const sets: ParsedSet[] = []
    const bad: string[] = []
    for (const part of value.split(',').map((p) => p.trim()).filter(Boolean)) {
      let m = part.match(SXRXKG)
      if (m) {
        const n = parseInt(m[1])
        for (let i = 0; i < n; i++) sets.push({ reps: parseInt(m[2]), weight: parseFloat(m[3]) })
        continue
      }
      m = part.match(RXKG)
      if (m) {
        sets.push({ reps: parseInt(m[1]), weight: parseFloat(m[2]) })
        continue
      }
      bad.push(part)
    }
    if (!sets.length) {
      res.errors.push({ line: lineNo, text: line, message: 'fant ikke sett i formatet SxRxKG eller RxKG' })
      return
    }
    if (bad.length) res.errors.push({ line: lineNo, text: line, message: `hoppet over ${bad.map((b) => `«${b}»`).join(', ')} – ikke i formatet SxRxKG eller RxKG` })
    const norm = key.toLowerCase()
    const ex = byKey.get(norm)
    if (ex) ex.sets.push(...sets)
    else {
      const e = { name: key, sets, line: lineNo }
      byKey.set(norm, e)
      res.exercises.push(e)
    }
  })
  return res
}
