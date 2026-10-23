// Clawd's needs, as in The Sims: each drains on its own and refills through
// a habit that makes you better at Claude. Pure functions over what the
// hooks record.

export type NeedId = 'focus' | 'tidy' | 'clarity' | 'confidence' | 'curiosity'

export const NEED_IDS: NeedId[] = ['focus', 'tidy', 'clarity', 'confidence', 'curiosity']

export type Needs = Record<NeedId, number>

// What the needs are worked out from, kept across sessions: your last clear
// prompt, the last time you tried something new, and Claude's edits since
// anything was last checked.
export type NeedInputs = { clearAt: number; newAt: number; unchecked: number }

const HOUR = 60 * 60 * 1000
// Clarity runs out over a working day without a clear prompt.
const CLARITY_HOURS = 8
// Curiosity runs out over three days without trying anything new.
const CURIOSITY_HOURS = 72
// Ten files uncommitted, or ten edits unchecked, empties Tidy or Confidence.
const MESS_EMPTY = 10
const UNCHECKED_EMPTY = 10
// Context up to this full costs no Focus; at FOCUS_EMPTY it is gone.
const FOCUS_FREE = 30
const FOCUS_EMPTY = 95

// A need under this is low, under EMPTY all but gone.
export const LOW = 35
export const EMPTY = 10

const clamp = (value: number) => Math.round(Math.max(0, Math.min(100, value)))

export function needsOf(inputs: NeedInputs, state: { context: number | null; dirty: number; now: number }): Needs {
  const hours = (at: number) => Math.max(0, state.now - at) / HOUR

  return {
    focus: state.context === null ? 100 : clamp(100 - ((state.context - FOCUS_FREE) * 100) / (FOCUS_EMPTY - FOCUS_FREE)),
    tidy: clamp(100 - (state.dirty * 100) / MESS_EMPTY),
    clarity: clamp(100 - (hours(inputs.clearAt) * 100) / CLARITY_HOURS),
    confidence: clamp(100 - (inputs.unchecked * 100) / UNCHECKED_EMPTY),
    curiosity: clamp(100 - (hours(inputs.newAt) * 100) / CURIOSITY_HOURS),
  }
}

// How he is doing overall: his color follows the lowest need.
export type Wellbeing = 'fine' | 'low' | 'empty'

export function wellbeingOf(needs: Needs): Wellbeing {
  const lowest = Math.min(...NEED_IDS.map(id => needs[id]))

  return lowest < EMPTY ? 'empty' : lowest < LOW ? 'low' : 'fine'
}

// Every need above half: XP earns the bonus.
export function isThriving(needs: Needs): boolean {
  return NEED_IDS.every(id => needs[id] > 50)
}

export const NEED_NAMES: Record<NeedId, string> = {
  focus: 'Focus',
  tidy: 'Tidy',
  clarity: 'Clarity',
  confidence: 'Confidence',
  curiosity: 'Curiosity',
}

// The hover text for a need: where it stands and what refills it.
export function needTip(id: NeedId, value: number, extra: { dirty: number; unchecked: number }): string {
  const head = `${NEED_NAMES[id]} ${value}%.`

  switch (id) {
    case 'focus':
      return `${head} Drains as the context window fills. Run /compact between tasks, or /clear when you switch topics.`
    case 'tidy':
      return `${head} ${extra.dirty === 0 ? 'Nothing is uncommitted.' : `${extra.dirty} file${extra.dirty === 1 ? ' has' : 's have'} uncommitted changes.`} Commit at a good checkpoint.`
    case 'clarity':
      return `${head} Drains over the hours since your last clear prompt. Name the file or function and say how to check it.`
    case 'confidence':
      return `${head} ${extra.unchecked === 0 ? 'Everything Claude changed has been checked.' : `Claude made ${extra.unchecked} edit${extra.unchecked === 1 ? '' : 's'} since anything was checked.`} Run the tests, or ask Claude how it will verify the change.`
    case 'curiosity':
      return `${head} Drains over the days since you tried something new. Use a skill, pass a lesson, hand a search to a subagent, or ask for a plan.`
  }
}
