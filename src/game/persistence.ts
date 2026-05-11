import type { Participant } from './types'

const LS_PARTICIPANTS = 'tripotes.participants.v2'

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function loadParticipants(): Participant[] {
  if (!canUseLocalStorage()) return []
  const parsed = safeParseJson<Participant[]>(window.localStorage.getItem(LS_PARTICIPANTS))
  if (!parsed) return []
  return parsed.filter(
    (p) => typeof p?.id === 'string' && typeof p?.name === 'string' && typeof p?.points === 'number'
  )
}

export function saveParticipants(participants: Participant[]): void {
  if (!canUseLocalStorage()) return
  window.localStorage.setItem(LS_PARTICIPANTS, JSON.stringify(participants))
}

export function resetParticipantsStorage(): void {
  if (!canUseLocalStorage()) return
  window.localStorage.removeItem(LS_PARTICIPANTS)
}
