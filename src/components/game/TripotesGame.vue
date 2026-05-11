<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { GameMode, Participant } from '../../game/types'
import { createId } from '../../game/id'
import { loadParticipants, resetParticipantsStorage, saveParticipants } from '../../game/persistence'
import { predefinedQuestions } from '../../game/predefinedQuestions'

type Step = 'setup' | 'game'

type GameUndo = {
  players: Participant[]
  hostId: string
  questionText: string
  orderIds: string[]
  questionVisible: boolean
}

const step = ref<Step>('setup')
const players = ref<Participant[]>(loadParticipants())
const newName = ref('')

const hostId = ref<string>('')
const questionText = ref('')
const orderIds = ref<string[]>([])
const gameMode = ref<GameMode>('order')
const questionVisible = ref(true)

const modalOpen = ref(false)
const modalTab = ref<'rules' | 'stats'>('stats')

const skipOrderSync = ref(false)
const undoState = ref<GameUndo | null>(null)

watch(
  players,
  (val) => {
    saveParticipants(val)
  },
  { deep: true }
)

const host = computed(() => players.value.find((p) => p.id === hostId.value))

const sortedByPoints = computed(() =>
  players.value.slice().sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
)

function guesserIds(): string[] {
  return players.value.filter((p) => p.id !== hostId.value).map((p) => p.id)
}

watch([hostId, () => players.value.map((p) => p.id).join()], () => {
  if (skipOrderSync.value) return
  const g = guesserIds()
  if (g.length === 0) {
    orderIds.value = []
    return
  }
  const cur = orderIds.value
  const valid = cur.length === g.length && g.every((id) => cur.includes(id))
  if (!valid) {
    orderIds.value = g.slice()
  }
})

function pickRandomHost(): void {
  const list = players.value
  if (list.length === 0) return
  const i = Math.floor(Math.random() * list.length)
  hostId.value = list[i].id
}

function pickRandomQuestion(): void {
  if (predefinedQuestions.length === 0) {
    questionText.value = ''
    return
  }
  const i = Math.floor(Math.random() * predefinedQuestions.length)
  questionText.value = predefinedQuestions[i]
}

function addPlayer(): void {
  const name = newName.value.trim()
  if (!name) return
  const exists = players.value.some((p) => p.name.toLowerCase() === name.toLowerCase())
  if (exists) return
  players.value = [...players.value, { id: createId('p'), name, points: 0 }]
  newName.value = ''
}

function removePlayer(id: string): void {
  players.value = players.value.filter((p) => p.id !== id)
}

function canStartGame(): boolean {
  return players.value.length >= 2
}

function goToGame(): void {
  if (!canStartGame()) return
  pickRandomHost()
  pickRandomQuestion()
  questionVisible.value = true
  step.value = 'game'
}

function goHome(): void {
  step.value = 'setup'
}

function anotherRandomQuestion(): void {
  pickRandomQuestion()
}

function openStatsModal(): void {
  modalTab.value = 'stats'
  modalOpen.value = true
}

function closeModal(): void {
  modalOpen.value = false
}

function moveOrder(index: number, direction: -1 | 1): void {
  const arr = orderIds.value.slice()
  const j = index + direction
  if (j < 0 || j >= arr.length) return
  const t = arr[index]
  arr[index] = arr[j]
  arr[j] = t
  orderIds.value = arr
}

function advanceAfterScore(): void {
  pickRandomHost()
  pickRandomQuestion()
  questionVisible.value = true
}

function captureUndo(): void {
  undoState.value = {
    players: players.value.map((p) => ({ ...p })),
    hostId: hostId.value,
    questionText: questionText.value,
    orderIds: orderIds.value.slice(),
    questionVisible: questionVisible.value
  }
}

function scoreGroupWins(): void {
  const hid = hostId.value
  if (!hid) return
  captureUndo()
  players.value = players.value.map((p) => (p.id === hid ? p : { ...p, points: p.points + 1 }))
  advanceAfterScore()
}

function scoreHostWins(): void {
  const hid = hostId.value
  if (!hid) return
  captureUndo()
  players.value = players.value.map((p) =>
    p.id === hid ? { ...p, points: p.points + 2 } : p
  )
  advanceAfterScore()
}

async function undoLastScore(): Promise<void> {
  const u = undoState.value
  if (!u) return
  skipOrderSync.value = true
  players.value = u.players.map((p) => ({ ...p }))
  hostId.value = u.hostId
  questionText.value = u.questionText
  orderIds.value = u.orderIds.slice()
  questionVisible.value = u.questionVisible
  undoState.value = null
  await nextTick()
  skipOrderSync.value = false
}

function resetScores(): void {
  players.value = players.value.map((p) => ({ ...p, points: 0 }))
}

function wipeAll(): void {
  resetParticipantsStorage()
  players.value = []
  step.value = 'setup'
  hostId.value = ''
  questionText.value = ''
  orderIds.value = []
  undoState.value = null
  closeModal()
}
</script>

<template>
  <div class="tripotes-game">
    <div class="tripotes-appShell">
      <header class="topbar">
        <div class="brand">
          <h1>Tri-potes</h1>
          <p v-if="step === 'setup'">Ajoutez vos potes, puis lancez la soirée.</p>
          <p v-else>À toi de jouer.</p>
        </div>
        <div class="top-actions">
          <button type="button" class="btn" @click="openStatsModal">Stats</button>
          <button v-if="step === 'game'" type="button" class="btn" @click="goHome">Home</button>
        </div>
      </header>

      <!-- Setup -->
      <div v-if="step === 'setup'" class="card">
        <div class="cardPad">
          <h2 class="cardTitle">Les potes</h2>
          <p class="helpInline">Un nom, un clic, une petite carte. Tu peux virer quelqu’un si tu t’es trompé.</p>

          <div class="field add-row">
            <label for="new-name">Nouveau poto</label>
            <div class="add-inline">
              <input
                id="new-name"
                v-model="newName"
                type="text"
                maxlength="40"
                placeholder="Ex : Sam"
                autocomplete="off"
                @keydown.enter.prevent="addPlayer"
              />
              <button type="button" class="btn btnPrimary" @click="addPlayer">Ajouter</button>
            </div>
          </div>

          <div v-if="players.length === 0" class="toast muted" style="margin-top: 14px">
            Zéro poto pour l’instant — commence par en ajouter au moins deux pour jouer.
          </div>

          <div v-else class="name-cards">
            <div v-for="p in players" :key="p.id" class="name-card">
              <span class="name-card__text">{{ p.name }}</span>
              <button type="button" class="name-card__remove" title="Retirer" @click="removePlayer(p.id)">
                ×
              </button>
            </div>
          </div>

          <div class="spacerMd" />

          <button type="button" class="btn btnPrimary" :disabled="!canStartGame" @click="goToGame">
            C’est parti
          </button>
          <p v-if="players.length === 1" class="hint" style="margin-top: 10px">
            Il te faut au moins deux joueurs pour un vrai tripote.
          </p>
        </div>
      </div>

      <!-- Jeu -->
      <div v-else class="card game-card">
        <div class="cardPad">
          <p class="host-line">
            <span class="host-label">Tri-poteur :</span>
            <span class="host-name">{{ host?.name ?? '—' }}</span>
          </p>

          <div class="divider divider--tight" />

          <div class="segmented segmented--compact" role="tablist" aria-label="Mode de jeu">
            <button
              type="button"
              class="segBtn segBtn--compact"
              :class="{ segBtnActive: gameMode === 'order' }"
              @click="gameMode = 'order'"
            >
              Question à deviner
            </button>
            <button
              type="button"
              class="segBtn segBtn--compact"
              :class="{ segBtnActive: gameMode === 'ranking' }"
              @click="gameMode = 'ranking'"
            >
              Classement à refaire
            </button>
          </div>

          <div class="divider divider--tight" />

          <div class="q-row">
            <button type="button" class="btn btn-sm" @click="anotherRandomQuestion">Autre au hasard</button>
            <button
              type="button"
              class="eye-btn"
              :aria-label="questionVisible ? 'Masquer la question' : 'Afficher la question'"
              @click="questionVisible = !questionVisible"
            >
              <!-- œil ouvert -->
              <svg
                v-if="questionVisible"
                class="eye-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <!-- œil fermé -->
              <svg
                v-else
                class="eye-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
          </div>

          <div
            class="question-block"
            :class="{ 'question-block--hidden': !questionVisible }"
            aria-live="polite"
          >
            <template v-if="questionVisible">
              <label for="q-text" class="sr-only">Question</label>
              <textarea
                id="q-text"
                v-model="questionText"
                class="q-textarea"
                placeholder="Écris ou garde celle du hasard…"
                rows="5"
              />
            </template>
            <p v-else class="question-hidden-msg">Masquée</p>
          </div>

          <div class="divider divider--tight" />

          <p class="rank-title">Classement des potos</p>
          <p class="rank-hint">Sans le tri-poteur — utilise ↑ ↓ pour placer l’ordre.</p>

          <div v-if="orderIds.length === 0" class="toast muted">Pas assez de monde pour un classement.</div>
          <div v-else class="orderBuilder">
            <div v-for="(id, idx) in orderIds" :key="id" class="orderRow orderRow--tight">
              <div class="orderPos">#{{ idx + 1 }}</div>
              <div class="orderName">{{ players.find((p) => p.id === id)?.name ?? '—' }}</div>
              <div class="orderActions">
                <button
                  type="button"
                  class="miniBtn"
                  :disabled="idx === 0"
                  aria-label="Monter"
                  @click="moveOrder(idx, -1)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="miniBtn"
                  :disabled="idx === orderIds.length - 1"
                  aria-label="Descendre"
                  @click="moveOrder(idx, 1)"
                >
                  ↓
                </button>
              </div>
            </div>
          </div>

          <div v-if="undoState" class="undo-wrap">
            <button type="button" class="btn btn-sm btn-ghost" @click="undoLastScore">Annuler le dernier résultat</button>
          </div>

          <div class="game-footer">
            <button type="button" class="btn btnSuccess btn-block" @click="scoreGroupWins">
              Les potos gagnent (+1 chacun)
            </button>
            <button type="button" class="btn btnPrimary btn-block" @click="scoreHostWins">
              Le tri-poteur gagne (+2)
            </button>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="modalOpen"
        class="info-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        @click.self="closeModal"
      >
        <div class="info-modal">
          <div class="info-modal__head">
            <h2 id="modal-title" class="cardTitle" style="margin: 0">Stats &amp; règles</h2>
            <button type="button" class="miniBtn" aria-label="Fermer" @click="closeModal">×</button>
          </div>

          <div class="segmented segmented--compact" style="margin: 0 14px 12px" role="tablist">
            <button
              type="button"
              class="segBtn segBtn--compact"
              :class="{ segBtnActive: modalTab === 'stats' }"
              @click="modalTab = 'stats'"
            >
              Stats
            </button>
            <button
              type="button"
              class="segBtn segBtn--compact"
              :class="{ segBtnActive: modalTab === 'rules' }"
              @click="modalTab = 'rules'"
            >
              Règles
            </button>
          </div>

          <div class="info-modal__body">
            <div v-if="modalTab === 'stats'" class="stats-block">
              <p class="helpInline" style="margin-bottom: 12px">
                Les points viennent des deux gros boutons en bas de l’écran de jeu. Tu peux annuler le dernier clic si vous vous êtes trompés.
              </p>
              <ul class="stats-list">
                <li v-for="p in sortedByPoints" :key="p.id" class="stats-row">
                  <span class="stats-name">{{ p.name }}</span>
                  <span class="points">{{ p.points }} pt</span>
                </li>
              </ul>
              <div v-if="players.length === 0" class="toast muted">Aucun joueur enregistré.</div>
              <div class="row" style="margin-top: 16px; justify-content: flex-end; flex-wrap: wrap">
                <button type="button" class="btn" @click="resetScores">Remettre les scores à zéro</button>
                <button type="button" class="btn btnDanger" @click="wipeAll">Tout effacer (potes inclus)</button>
              </div>
            </div>

            <div v-else class="rules-prose">
              <p>
                Salut ! Vous êtes entre potes : le but, c’est de rigoler et d’enchaîner les tours sans vous prendre la tête.
              </p>
              <h3>Ordre à deviner</h3>
              <p>
                Si c’est ton tour de tri-poteur, tu choisis une question (ou tu gardes celle au hasard). Ensuite tu mets les autres dans l’ordre qui colle à ta question — sans la dire à voix haute.
                Tes potes ont le droit de te poser <strong>jusqu’à 4 questions</strong> pour essayer de deviner quelle était ta question.
              </p>
              <p>
                S’ils la trouvent : <strong>chacun d’eux gagne 1 point</strong>, toi tu ne gagnes rien sur ce tour.
                Sinon : <strong>tu gagnes 2 points</strong>, eux rien.
              </p>
              <h3>Classement à refaire</h3>
              <p>
                Là, tu réponds à la question (visible pour tout le monde) et tu fais ton classement des autres.
                Tes potes ont <strong>jusqu’à 3 essais</strong> pour refaire exactement le même classement que toi.
              </p>
              <p>
                S’ils y arrivent : <strong>1 point chacun</strong> (sauf toi). Sinon : <strong>2 points pour toi</strong>.
              </p>
              <p class="muted">
                Tu peux masquer la question sur l’écran si tu passes le téléphone — l’icône œil sert à ça.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.add-inline {
  display: flex;
  gap: 10px;
  align-items: stretch;
  flex-wrap: wrap;
}

.add-inline input {
  flex: 1 1 180px;
  min-width: 0;
}

.name-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.name-card {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 10px 14px;
  border-radius: var(--t-radius-md);
  border: 1px solid var(--t-border);
  background: rgba(255, 255, 255, 0.45);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  animation: cardIn 0.35s ease;
}

@media (prefers-color-scheme: dark) {
  .name-card {
    background: rgba(0, 0, 0, 0.2);
  }
}

.name-card__text {
  font-weight: 800;
  color: var(--t-text-strong);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name-card__remove {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid var(--t-border);
  background: rgba(255, 255, 255, 0.4);
  color: var(--t-text-strong);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.15s ease, transform 0.15s ease;
}

.name-card__remove:hover {
  background: var(--t-danger-bg);
  border-color: var(--t-danger-border);
  transform: scale(1.05);
}

.game-card .cardPad {
  padding-bottom: 12px;
}

.host-line {
  margin: 0;
  font-size: 15px;
  color: var(--t-text);
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

.host-label {
  font-weight: 700;
  color: var(--t-text-strong);
}

.host-name {
  font-family: var(--t-heading);
  font-weight: 600;
  font-size: 1.05rem;
  color: var(--t-text-strong);
}

.divider--tight {
  margin: 8px 0;
}

.q-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.btn-sm {
  padding: 8px 10px;
  font-size: 13px;
}

.btn-ghost {
  background: transparent;
  border-style: dashed;
  font-size: 13px;
  font-weight: 700;
}

.eye-btn {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: var(--t-radius-md);
  border: 1px solid var(--t-border);
  background: rgba(255, 255, 255, 0.5);
  color: var(--t-text-strong);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

@media (prefers-color-scheme: dark) {
  .eye-btn {
    background: rgba(0, 0, 0, 0.2);
  }
}

.eye-btn:hover {
  border-color: var(--t-accent-border);
  background: var(--t-accent-bg);
  transform: scale(1.04);
}

.eye-icon {
  width: 22px;
  height: 22px;
}

.q-textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 140px;
  font-size: 1.08rem;
  line-height: 1.45;
  font-weight: 600;
  border-radius: var(--t-radius-md);
  border: 2px solid var(--t-accent-border);
  background: rgba(255, 255, 255, 0.65);
  color: var(--t-text-strong);
  padding: 14px 16px;
  resize: vertical;
  box-shadow: 0 4px 20px rgba(14, 165, 233, 0.08);
}

@media (prefers-color-scheme: dark) {
  .q-textarea {
    background: rgba(0, 0, 0, 0.22);
  }
}

.question-block {
  transition: opacity 0.2s ease;
}

.question-block--hidden .question-hidden-msg {
  margin: 0;
  padding: 20px;
  text-align: center;
  font-weight: 800;
  font-size: 1rem;
  color: var(--t-text-strong);
  border-radius: var(--t-radius-md);
  border: 2px dashed var(--t-border);
  background: rgba(255, 255, 255, 0.35);
}

@media (prefers-color-scheme: dark) {
  .question-block--hidden .question-hidden-msg {
    background: rgba(0, 0, 0, 0.15);
  }
}

.rank-title {
  margin: 0 0 4px;
  font-family: var(--t-heading);
  font-size: 14px;
  font-weight: 600;
  color: var(--t-text-strong);
}

.rank-hint {
  margin: 0 0 10px;
  font-size: 12px;
  opacity: 0.85;
  line-height: 1.3;
}

.orderRow--tight {
  padding: 8px 10px;
  gap: 8px;
  grid-template-columns: 44px 1fr 84px;
}

.undo-wrap {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}

.game-footer {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-block {
  width: 100%;
  box-sizing: border-box;
  justify-content: center;
  text-align: center;
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.info-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
}

.info-modal {
  width: 100%;
  max-width: 520px;
  max-height: min(88vh, 640px);
  border-radius: 20px 20px 12px 12px;
  background: var(--t-bg);
  border: 1px solid var(--t-border);
  box-shadow: var(--t-shadow);
  display: flex;
  flex-direction: column;
  animation: modalUp 0.25s ease;
}

@media (min-width: 640px) {
  .info-overlay {
    align-items: center;
  }

  .info-modal {
    border-radius: 20px;
  }
}

.info-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 8px;
}

.info-modal__body {
  padding: 0 14px 16px;
  overflow-y: auto;
  flex: 1;
}

.rules-prose h3 {
  font-family: var(--t-heading);
  color: var(--t-text-strong);
  font-size: 1.05rem;
  margin: 16px 0 8px;
}

.rules-prose p {
  margin: 0 0 10px;
  line-height: 1.45;
  font-size: 15px;
}

.stats-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-radius: var(--t-radius-md);
  border: 1px solid var(--t-border);
  background: rgba(255, 255, 255, 0.35);
}

@media (prefers-color-scheme: dark) {
  .stats-row {
    background: rgba(0, 0, 0, 0.15);
  }
}

.stats-name {
  font-weight: 800;
  color: var(--t-text-strong);
}

@keyframes modalUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
