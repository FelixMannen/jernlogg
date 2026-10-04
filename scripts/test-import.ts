// Unit tests for the text import parser: npx tsx scripts/test-import.ts
import { parseWorkoutText, decodeImportParam, extractImportParam } from '../src/lib/importText'
let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`}`)
}
const fromLink = (hash: string) => parseWorkoutText(decodeImportParam(extractImportParam(hash)!))

// 1
let r = fromLink('#/import?d=bruker:David;Benkpress:3x15x80')
eq('1 user', r.user, 'David')
eq('1 sets', r.exercises.map((e) => [e.name, e.sets.length, e.sets[0]]), [['Benkpress', 3, { reps: 15, weight: 80 }]])
eq('1 no date', r.date, undefined)
// 2
r = parseWorkoutText('# Jernlogg v1\ndato: 2026-10-03\nvarighet: 75\nKnebøy: 2x10x60, 8x80, 6x90\nPull-ups: 3x8x0')
eq('2 squat sets', r.exercises[0].sets, [
  { reps: 10, weight: 60 },
  { reps: 10, weight: 60 },
  { reps: 8, weight: 80 },
  { reps: 6, weight: 90 },
])
eq('2 pullups', r.exercises[1].sets.map((s) => s.weight), [0, 0, 0])
eq('2 date', r.date, { y: 2026, m: 10, d: 3, hh: 12, mm: 0 })
eq('2 duration', r.duration, 75)
eq('2 no errors', r.errors.length, 0)
// 3
r = parseWorkoutText('Benkpress: 3x15x80;Benk: tre sett')
eq('3 imported', r.exercises.map((e) => e.name), ['Benkpress'])
eq('3 error line', r.errors.map((e) => [e.line, e.text, e.message]), [[2, 'Benk: tre sett', 'fant ikke sett i formatet SxRxKG eller RxKG']])
// 4
r = parseWorkoutText('bruker:Ola;Benkpress:3X15X82.5')
eq('4 user raw', r.user, 'Ola')
eq('4 weight', r.exercises[0].sets[0].weight, 82.5)
// decoding
eq('plus + percent', decodeImportParam('Sittende+roing:12x80%2C10x80'), 'Sittende roing:12x80,10x80')
eq('utf8 encoded', decodeImportParam('Kneb%C3%B8y:5x5x100'), 'Knebøy:5x5x100')
eq('unencoded æøå', decodeImportParam('Knebøy:5x5x100'), 'Knebøy:5x5x100')
eq('broken percent does not crash', decodeImportParam('notat:100%;Kneb%C3%B8y:5x100'), 'notat:100%;Knebøy:5x100')
eq('newline %0A', parseWorkoutText(decodeImportParam('dato:2026-10-04%2017:00%0ABenkpress:3x5x100')).date, { y: 2026, m: 10, d: 4, hh: 17, mm: 0 })
// misc
r = parseWorkoutText('Benkpress: 3 x 5 x 100 , 1×3×110\nbenkpress: 8x60\nnotat: Tung dag')
eq('spaces, ×, merge same exercise', r.exercises[0].sets.length, 5)
eq('note', r.note, 'Tung dag')
eq('extract stops at other param', extractImportParam('https://x/#/import?d=Benk:1x1x1&utm=a'), 'Benk:1x1x1')
eq('partial bad element', parseWorkoutText('Knebøy: 3x5x100, mye').errors.length, 1)
// running
r = parseWorkoutText('bruker: Felix\nLøp: 8.2km 42min')
eq('run km+min', r.run && [r.run.distanceKm, r.run.durationSec, r.run.routeName], [8.2, 2520, undefined])
r = parseWorkoutText('Løp: Elverunden 41:30')
eq('run route + mm:ss', r.run && [r.run.routeName, r.run.durationSec, r.run.distanceKm], ['Elverunden', 2490, undefined])
r = parseWorkoutText('løp: 1:05:10 halvmaraton? 21,1 km konkurranse')
eq('run h:mm:ss, comma decimal, type', r.run && [r.run.durationSec, r.run.distanceKm, r.run.runType], [3910, 21.1, 'konkurranse'])
r = parseWorkoutText('Løpetur: ca. 5 km, 30 min rolig')
eq('run estimate only on distance', r.run && [r.run.distanceEst, r.run.durationEst, r.run.runType, r.run.durationSec], [true, undefined, 'rolig', 1800])
r = parseWorkoutText('Løp: 1t 15min')
eq('run 1t 15min', r.run?.durationSec, 4500)
r = parseWorkoutText('Løp: 30 min')
eq('run time only', r.run && [r.run.durationSec, r.run.distanceKm], [1800, undefined])
r = parseWorkoutText('Løp: ;Benkpress: 3x5x100')
eq('empty run line is an error, strength still parsed', [r.errors.length, r.exercises.length], [1, 1])
eq('run via link', fromLink('#/import?d=bruker:David;L%C3%B8p:Elverunden+29:15').run?.routeName, 'Elverunden')
console.log(fail ? `\n${fail} FEIL` : '\nAlle tester OK')
process.exit(fail ? 1 : 0)
