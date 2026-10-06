// Who's who: display names/colours come from profiles; "people I can see" = me + everyone in my groups.
import { getDoc, list, getVersion, type Doc } from './store'
import { LEGACY_USERS, USER_COLORS, type Profile, type Group, type GroupMember } from './domain'

export type UserInfo = { id: string; name: string; color: string; emoji?: string; ink: string }

export function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#1a1400' : '#fff'
}

function hashColor(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0
  return USER_COLORS[Math.abs(h) % USER_COLORS.length]
}

export function userById(id: string): UserInfo {
  const p = getDoc<Profile>(`profile:${id}`)?.data
  const legacy = LEGACY_USERS.find((u) => u.id === id)
  const name = p?.name?.trim() || legacy?.name || 'Tidligere medlem'
  const color = p?.color || legacy?.color || hashColor(id)
  return { id, name, color, emoji: p?.emoji || undefined, ink: inkFor(color) }
}

let memoV = -1
let memo: { groups: Doc<Group>[]; members: Doc<GroupMember>[] } | null = null
function snapshot() {
  const v = getVersion()
  if (!memo || v !== memoV) {
    memoV = v
    memo = { groups: list<Group>('groups'), members: list<GroupMember>('group_members') }
  }
  return memo
}

/** Groups I'm a member of (newest first, Jernlogg-gjengen first). */
export function myGroups(me: string): Doc<Group>[] {
  const s = snapshot()
  const mine = new Set(s.members.filter((m) => m.data.userId === me).map((m) => m.data.groupId))
  return s.groups.filter((g) => mine.has(g.id)).sort((a, b) => (a.id === 'g_jernlogg' ? -1 : b.id === 'g_jernlogg' ? 1 : a.data.createdAt.localeCompare(b.data.createdAt)))
}

export function groupMembers(groupId: string): GroupMember[] {
  return snapshot()
    .members.filter((m) => m.data.groupId === groupId)
    .map((m) => m.data)
    .sort((a, b) => (a.joinedAt || '').localeCompare(b.joinedAt || ''))
}

/** Me first, then everyone who shares a group with me (alphabetical). */
export function knownUsers(me: string): string[] {
  const ids = new Set<string>()
  for (const g of myGroups(me)) for (const m of groupMembers(g.id)) ids.add(m.userId)
  ids.delete(me)
  return [me, ...[...ids].sort((a, b) => userById(a).name.localeCompare(userById(b).name, 'nb'))]
}

/** Users to show for a scope: 'alle' (everyone I can see) or a group id. */
export function usersInScope(me: string, scope: string): string[] {
  if (scope === 'alle' || !scope) return knownUsers(me)
  const ids = groupMembers(scope).map((m) => m.userId)
  return ids.includes(me) ? [me, ...ids.filter((i) => i !== me)] : ids
}
