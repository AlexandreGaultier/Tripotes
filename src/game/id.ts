export function createId(prefix = 'id'): string {
  // Id stable mais sans dépendance : ok pour un jeu local.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

