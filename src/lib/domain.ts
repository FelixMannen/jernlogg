/** App user id: 'felix' | 'david' | 'erik' for the original three, 'u…' for everyone who signed up later. */
export type UserId = string

/** Defaults for the original three (their profiles may not have a name/colour stored). */
export const LEGACY_USERS: { id: string; name: string; color: string }[] = [
  { id: 'felix', name: 'Felix', color: '#E5483D' },
  { id: 'david', name: 'David', color: '#3D7BEA' },
  { id: 'erik', name: 'Erik', color: '#EDB92E' },
]

export const USER_COLORS = ['#E5483D', '#3D7BEA', '#EDB92E', '#2FB57C', '#A35BE8', '#F07F2E', '#E0559B', '#2BB5C9', '#8FB339', '#B0855A']
export const USER_EMOJIS = ['🦍', '🐻', '🦊', '🐺', '🦁', '🐯', '🦅', '🐂', '🦈', '🔥', '⚡', '🏔️']

export type MuscleGroup = 'Bryst' | 'Rygg' | 'Bein' | 'Skuldre' | 'Armer' | 'Core' | 'Annet'
export const GROUPS: MuscleGroup[] = ['Bryst', 'Rygg', 'Bein', 'Skuldre', 'Armer', 'Core', 'Annet']

export type Equipment = 'Stang' | 'Manualer' | 'Maskin' | 'Kabel' | 'Kroppsvekt' | 'Kettlebell' | 'Annet'

export type Exercise = {
  id: string
  name: string
  alt?: string // alternative / english name for search
  group: MuscleGroup
  equipment: Equipment
  bodyweight?: boolean // reps-focused, weight = added load
  custom?: boolean
  createdBy?: string
}

const E = (id: string, name: string, group: MuscleGroup, equipment: Equipment, alt = '', bodyweight = false): Exercise => ({
  id,
  name,
  group,
  equipment,
  alt,
  bodyweight,
})

export const BUILTIN_EXERCISES: Exercise[] = [
  // Bryst
  E('benkpress', 'Benkpress', 'Bryst', 'Stang', 'bench press'),
  E('skraa-benk-stang', 'Skrå benkpress (stang)', 'Bryst', 'Stang', 'incline bench press'),
  E('benk-manual', 'Benkpress med manualer', 'Bryst', 'Manualer', 'dumbbell bench press'),
  E('skraa-benk-manual', 'Skrå benk med manualer', 'Bryst', 'Manualer', 'incline dumbbell press'),
  E('flies-manual', 'Flyes med manualer', 'Bryst', 'Manualer', 'dumbbell fly'),
  E('cable-crossover', 'Kabelkryss', 'Bryst', 'Kabel', 'cable crossover fly'),
  E('brystpress-maskin', 'Brystpress i maskin', 'Bryst', 'Maskin', 'chest press machine'),
  E('dips', 'Dips', 'Bryst', 'Kroppsvekt', 'dips', true),
  E('pushups', 'Armhevinger', 'Bryst', 'Kroppsvekt', 'push ups', true),
  // Rygg
  E('markloft', 'Markløft', 'Rygg', 'Stang', 'deadlift'),
  E('pullups', 'Pull-ups', 'Rygg', 'Kroppsvekt', 'chins pullups', true),
  E('chins', 'Chin-ups', 'Rygg', 'Kroppsvekt', 'chin ups', true),
  E('stangroing', 'Stangroing', 'Rygg', 'Stang', 'barbell row bent over'),
  E('manualroing', 'Manualroing', 'Rygg', 'Manualer', 'dumbbell row'),
  E('nedtrekk', 'Nedtrekk', 'Rygg', 'Kabel', 'lat pulldown'),
  E('sittende-roing', 'Sittende roing', 'Rygg', 'Kabel', 'seated cable row'),
  E('t-bar-roing', 'T-bar roing', 'Rygg', 'Stang', 't-bar row'),
  E('face-pull', 'Face pulls', 'Rygg', 'Kabel', 'face pull'),
  E('hyperextensions', 'Rygghev', 'Rygg', 'Kroppsvekt', 'back extension hyperextension', true),
  E('shrugs', 'Skuldertrekk', 'Rygg', 'Manualer', 'shrugs'),
  // Bein
  E('kneboy', 'Knebøy', 'Bein', 'Stang', 'squat back squat'),
  E('frontboy', 'Frontbøy', 'Bein', 'Stang', 'front squat'),
  E('beinpress', 'Beinpress', 'Bein', 'Maskin', 'leg press'),
  E('rumensk-markloft', 'Rumensk markløft', 'Bein', 'Stang', 'romanian deadlift rdl'),
  E('utfall', 'Utfall', 'Bein', 'Manualer', 'lunges'),
  E('bulgarsk-splitt', 'Bulgarsk splittknebøy', 'Bein', 'Manualer', 'bulgarian split squat'),
  E('hip-thrust', 'Hip thrust', 'Bein', 'Stang', 'hip thrust glute'),
  E('beinspark', 'Beinspark', 'Bein', 'Maskin', 'leg extension'),
  E('larcurl', 'Lårcurl', 'Bein', 'Maskin', 'leg curl hamstring'),
  E('tahev', 'Tåhev', 'Bein', 'Maskin', 'calf raise'),
  E('goblet-squat', 'Goblet squat', 'Bein', 'Kettlebell', 'goblet squat'),
  E('hack-squat', 'Hack squat', 'Bein', 'Maskin', 'hack squat'),
  // Skuldre
  E('militaerpress', 'Militærpress', 'Skuldre', 'Stang', 'overhead press ohp'),
  E('skulderpress-manual', 'Skulderpress med manualer', 'Skuldre', 'Manualer', 'dumbbell shoulder press'),
  E('sidehev', 'Sidehev', 'Skuldre', 'Manualer', 'lateral raise'),
  E('fronthev', 'Fronthev', 'Skuldre', 'Manualer', 'front raise'),
  E('omvendt-flyes', 'Omvendt flyes', 'Skuldre', 'Manualer', 'rear delt fly reverse'),
  E('arnold-press', 'Arnold press', 'Skuldre', 'Manualer', 'arnold press'),
  E('skulderpress-maskin', 'Skulderpress i maskin', 'Skuldre', 'Maskin', 'shoulder press machine'),
  E('push-press', 'Push press', 'Skuldre', 'Stang', 'push press'),
  // Armer
  E('bicepscurl-stang', 'Bicepscurl med stang', 'Armer', 'Stang', 'barbell curl'),
  E('bicepscurl-manual', 'Bicepscurl med manualer', 'Armer', 'Manualer', 'dumbbell curl'),
  E('hammercurl', 'Hammercurl', 'Armer', 'Manualer', 'hammer curl'),
  E('preacher-curl', 'Preacher curl', 'Armer', 'Maskin', 'preacher curl scott'),
  E('kabelcurl', 'Kabelcurl', 'Armer', 'Kabel', 'cable curl'),
  E('triceps-pushdown', 'Triceps pushdown', 'Armer', 'Kabel', 'tricep pushdown'),
  E('fransk-press', 'Fransk press', 'Armer', 'Stang', 'skull crusher french press'),
  E('triceps-overhead', 'Triceps over hodet', 'Armer', 'Kabel', 'overhead tricep extension'),
  E('smal-benk', 'Smal benkpress', 'Armer', 'Stang', 'close grip bench press'),
  // Core
  E('planke', 'Planke (sek)', 'Core', 'Kroppsvekt', 'plank', true),
  E('hengende-beinhev', 'Hengende beinhev', 'Core', 'Kroppsvekt', 'hanging leg raise', true),
  E('ab-wheel', 'Ab wheel', 'Core', 'Annet', 'ab rollout', true),
  E('kabel-crunch', 'Kabel-crunch', 'Core', 'Kabel', 'cable crunch'),
  E('russian-twist', 'Russian twist', 'Core', 'Kroppsvekt', 'russian twist', true),
  E('situps', 'Situps', 'Core', 'Kroppsvekt', 'sit ups crunch', true),
  // Annet
  E('kettlebell-swing', 'Kettlebell swing', 'Annet', 'Kettlebell', 'kb swing'),
  E('farmers-walk', 'Farmer’s walk', 'Annet', 'Manualer', 'farmers carry'),
  E('power-clean', 'Power clean', 'Annet', 'Stang', 'clean olympic'),
]

export type SetEntry = {
  uid: string
  weight: number | null
  reps: number | null
  rpe?: number | null
  warmup?: boolean
  done: boolean
  doneAt?: string
}

export type WorkoutExercise = {
  uid: string
  exerciseId: string
  note?: string
  supersetNext?: boolean // linked with the following exercise
  sets: SetEntry[]
}

export type Workout = {
  userId: UserId
  title: string
  startedAt: string
  endedAt: string | null
  status: 'active' | 'done'
  templateId?: string
  notes?: string
  exercises: WorkoutExercise[]
  feeling?: number // 1-5
  kind?: 'strength' | 'run' // missing = strength (all workouts before running existed)
  run?: RunData
  reopenedFrom?: string // set while a finished workout is being edited (original endedAt)
  private?: boolean // only visible to the owner; counts in own stats, never in groups/leaderboards
}

export type RunType = 'rolig' | 'intervall' | 'terskel' | 'langtur' | 'konkurranse'
export const RUN_TYPES: { id: RunType; label: string }[] = [
  { id: 'rolig', label: 'Rolig' },
  { id: 'intervall', label: 'Intervall' },
  { id: 'terskel', label: 'Terskel' },
  { id: 'langtur', label: 'Langtur' },
  { id: 'konkurranse', label: 'Konkurranse' },
]

export type RunData = {
  distanceKm?: number
  distanceEst?: boolean // «ca.»
  durationSec?: number
  durationEst?: boolean // «ca.»
  routeId?: string
  runType?: RunType
  elevationM?: number
  avgHr?: number
  // stopwatch (while status = 'active')
  pausedAt?: string | null
  pausedMs?: number
}

export type Route = { name: string; distanceKm: number; note?: string; createdBy: UserId }

export type WeeklyGoal = {
  mode: 'total' | 'split' | 'min'
  total?: number // total / min modes
  strength?: number // split
  run?: number // split
  runMin?: number // min mode: at least this many runs
  km?: number // optional running km per week
}

export type TemplateItem = { exerciseId: string; sets: number; reps: number }
export type Template = {
  name: string
  createdBy: UserId
  items: TemplateItem[]
  notes?: string
}

export type Profile = {
  name?: string // display name (set at sign-up / in settings)
  color?: string
  emoji?: string // optional avatar symbol instead of the initial
  restSeconds?: number
  bodyweight?: number
  weeklyGoal?: number // legacy: total sessions per week
  goal?: WeeklyGoal
  restByExercise?: Record<string, number>
  notify?: { reminders: boolean; days: number; hour: number; friends: boolean; tz: string; supplements?: boolean }
}

export type BodyweightEntry = { userId: UserId; date: string; weight: number }
export type Reaction = { workoutId: string; userId: UserId; emoji: string }
export type Comment = { workoutId: string; userId: UserId; text: string; at: string }

export const REACTIONS = ['💪', '🔥', '😤', '👏']
export const FEELINGS = ['😵', '😮‍💨', '🙂', '😎', '🦍']
export const FEELING_LABEL = ['Tung dag', 'Slitsomt', 'Grei', 'Sterk', 'Beist']

export type Feedback = {
  userId: UserId
  text: string
  at: string
  status: 'open' | 'done'
  doneAt?: string
  reply?: string // what was changed (latest attempt)
  attempts?: { reply: string; doneAt: string }[] // earlier attempts that got a complaint
}

/** Felix approves feedback from people outside the original three before Claude acts on it. */
export type FeedbackReview = { feedbackId: string; approved: boolean; text: string; at: string }

export type FeedbackComplaint = {
  feedbackId: string
  userId: UserId
  text: string
  at: string
}

export type Group = {
  name: string
  emoji?: string
  description?: string
  adminId: UserId
  public?: boolean
  inviteCode: string
  inviteEnabled?: boolean
  createdAt: string
  createdBy: UserId
  goal?: GroupGoal
  challenge?: GroupChallenge
}
export type GroupMember = { groupId: string; userId: UserId; joinedAt: string }

/** Felles mål: e.g. «100 km løping i oktober» – everyone's (non-private) workouts in the period add up. */
export type GroupGoal = { metric: 'km' | 'sessions' | 'kg'; target: number; from: string; to: string; title?: string }

/** Ukas utfordring set by the admin. `weekOf` = monday (yyyy-mm-dd); repeat = same challenge every week. */
export type GroupChallenge = {
  kind: 'reps' | 'heaviest' | 'sessions' | 'km' | 'volume'
  exerciseId?: string
  weekOf: string
  repeat?: boolean
}
