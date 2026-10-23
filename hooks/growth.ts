// How Clawd grows: XP from what you do, weighted by the stage he is at, so
// the first levels come from showing up and the later ones from getting
// good at Claude. Pure functions, so the rules are easy to test and tune.

export type Stage = { name: string; from: number }

// Levels 1-3 settle in, 4-6 learn, 7 and up master.
export const STAGES: Stage[] = [
  { name: 'Settling in', from: 1 },
  { name: 'Learning', from: 4 },
  { name: 'Mastery', from: 7 },
]

export type XpKind = 'turn' | 'craft' | 'lesson' | 'skill' | 'habit' | 'quest'

// What each kind of XP is worth at each stage: turns fade out, craft and
// skills grow in.
const WEIGHTS: Record<XpKind, [number, number, number]> = {
  turn: [1, 0.5, 0],
  craft: [0.5, 1, 1.5],
  lesson: [1, 1, 1.5],
  skill: [1, 1, 1.5],
  habit: [1, 1, 1.5],
  quest: [1, 1, 1],
}

// The bonus while every need is above half.
export const NEEDS_BONUS = 1.5

export function stageOf(level: number): 0 | 1 | 2 {
  return level >= STAGES[2]!.from ? 2 : level >= STAGES[1]!.from ? 1 : 0
}

export function xpWorth(kind: XpKind, base: number, level: number, isThriving: boolean): number {
  const xp = base * WEIGHTS[kind][stageOf(level)]

  return kind === 'quest' || !isThriving ? xp : xp * NEEDS_BONUS
}

// The XP from one level to the next: 10, then 15, 20 and so on.
export function stepXp(level: number): number {
  return 10 + 5 * (level - 1)
}

// The XP it takes to reach a level from nothing.
export function xpFor(level: number): number {
  return 10 * (level - 1) + (5 * (level - 1) * (level - 2)) / 2
}

// What you have done toward the milestones that open each stage.
export type Milestones = { lessonsPracticed: number; skillsUsed: number }

// The milestone before each stage: a lesson passed before Learning, three
// different skills before Mastery.
export const GATES: { level: number; met: (m: Milestones) => boolean; need: string }[] = [
  { level: 4, met: m => m.lessonsPracticed >= 1, need: 'Pass a request in a Teach me lesson' },
  { level: 7, met: m => m.skillsUsed >= 3, need: 'Use three different skills' },
]

// The level XP earns, held back at a gate until its milestone is met.
export function levelOf(xp: number, milestones: Milestones): number {
  let level = 1

  while (xp >= xpFor(level + 1)) {
    level += 1
  }

  const blocked = GATES.find(gate => level >= gate.level && !gate.met(milestones))

  return blocked === undefined ? level : blocked.level - 1
}

// The old rule, a level every ten turns: what a level was before XP, kept
// as a floor so no one is demoted.
export function turnLevel(turns: number): number {
  return 1 + Math.floor(turns / 10)
}

export type Progress = {
  level: number
  stage: string
  // XP into this level, and the XP the next one takes.
  into: number
  step: number
  // The milestone holding him back, if XP alone would take him further.
  blockedBy: string | null
  // The next milestone ahead, met or not.
  nextGate: { level: number; need: string; isMet: boolean } | null
}

export function progressOf(xp: number, milestones: Milestones): Progress {
  const level = levelOf(xp, milestones)
  const gate = GATES.find(one => one.level === level + 1 && !one.met(milestones))
  const ahead = GATES.find(one => one.level > level)
  const step = stepXp(level)

  return {
    level,
    stage: STAGES[stageOf(level)]!.name,
    into: Math.min(step, Math.max(0, xp - xpFor(level))),
    step,
    blockedBy: gate !== undefined && xp >= xpFor(level + 1) ? gate.need : null,
    nextGate: ahead === undefined ? null : { level: ahead.level, need: ahead.need, isMet: ahead.met(milestones) },
  }
}

// What earns XP at a stage, for the Coach tab.
export function earnsAt(level: number): string[] {
  const stage = stageOf(level)

  return [
    ['Finished turns (not "yes" or "go on")', WEIGHTS.turn[stage]],
    ['Clear prompts: a target, a way to check, a plan, an example', WEIGHTS.craft[stage]],
    ['Passing a Teach me lesson (5)', WEIGHTS.lesson[stage]],
    ['A skill: 5 the first time, 1 a day after', WEIGHTS.skill[stage]],
    ['Habits: committing after tests pass, handing off to a subagent', WEIGHTS.habit[stage]],
  ]
    .filter(([, weight]) => (weight as number) > 0)
    .map(([what, weight]) => `${what as string}${weight === 1 ? '' : ` (×${weight as number})`}`)
}
