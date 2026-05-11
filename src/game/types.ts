export type ParticipantId = string

export type Participant = {
  id: ParticipantId
  name: string
  points: number
}

/** Variante affichée (rappel des règles), le scoring se fait à la main via les boutons. */
export type GameMode = 'order' | 'ranking'
