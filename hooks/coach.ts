// Reads a prompt the way a good collaborator would: does it say what to work
// on, what done looks like, why, and how to check it? Spelling and grammar
// are ignored on purpose; Claude reads past them, while missing context is
// what costs a turn. Pure functions, so the rules are easy to test and tune.

import type { Feeling, Habit } from '../types'

export type Reading = {
  feeling: Feeling | null
  tip: string | null
  // Good habits the prompt showed, each counted toward its badge.
  habits: Habit[]
  isVague: boolean
  isCorrection: boolean
  // A short answer to Claude ("yes", "2") or a slash command: not a new ask.
  isReply: boolean
}

// What a feeling is worth to the person's prompt-craft score.
export const XP: Record<Feeling, number> = {
  proud: 3,
  inspired: 2,
  calm: 2,
  content: 1,
  confused: -1,
  overwhelmed: -1,
  dizzy: -1,
  grumpy: -2,
}

export const TIPS: Record<Feeling, string> = {
  confused: 'Name the file or function, and what done looks like',
  grumpy: 'Still vague: say where, what, and how to check it',
  overwhelmed: 'Lots of asks at once: split them, or ask for a plan first',
  dizzy: 'Lots of redirects: state your constraints up front',
  proud: 'Clear target and a way to verify. Nice',
  inspired: 'Examples and the why make the result land',
  calm: 'Planning first keeps big changes on track',
  content: 'Small, specific follow-ups keep things moving',
}

// Short answers to Claude are not vague: they reply to a question.
const REPLY = /^(?:y|yes|yep|yeah|no|nope|ok|okay|k|sure|go|go ahead|do it|continue|proceed|sounds good|lgtm|looks good|thanks|thank you|ty|perfect|great|nice|cool|stop|wait|[0-9]{1,2}|[a-e])\b[\s!.,]*$/i

const FILE = /(?:^|[\s(`'"])(?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)*\.(?:tsx?|jsx?|mjs|cjs|py|go|rb|rs|java|kt|swift|c|cc|cpp|h|cs|php|json|ya?ml|toml|md|sql|css|scss|html|sh|env)\b/i
const PATH = /(?:^|\s)(?:\.{0,2}\/|~\/)?[\w.-]+\/[\w./-]+/
const MENTION = /(?:^|\s)@[\w./-]+/
const CODE = /`[^`]+`/
const IDENTIFIER = /\b(?:[a-z]+[A-Z][\w]*|[a-z]+_[a-z_]+|[A-Z][a-z]+[A-Z][\w]*)\b/
const ERROR = /\b(?:\w*Error|Exception|Traceback|panic|stack trace|exit code|failed with|FAIL)\b|:\d+:\d+/
const LINK = /https?:\/\/\S+/

const VERIFY = /\b(?:tests?|specs?|verify|check that|make sure|should (?:pass|return|show|equal)|expect(?:ed)?|acceptance|done when|until it passes|typecheck|lint)\b/i
const WHY = /\b(?:because|so that|in order to|the goal is|the reason|we need .{0,30} (?:for|to))\b/i
const EXAMPLE = /\b(?:e\.g\.|for example|for instance|such as|like this|example)\b|```/i
const PLAN = /\b(?:plan|outline|propose|approach|before (?:you |we )?(?:change|edit|write|code|touch)|don'?t (?:change|edit|write) (?:anything|code) yet|think through)\b/i
const FOLLOW_UP = /^(?:that (?:worked|works|fixed|looks)|great,? now|now (?:let'?s|can you|do)|next,? |nice,? (?:now|next)|perfect,? (?:now|next))/i

const VAGUE_WORD = /\b(?:it|this|that|stuff|thing|things|something|somehow|whatever|better|nicer|properly|etc)\b/gi
const VAGUE_START = /^(?:fix|do|make|change|update|handle|improve|clean ?up|redo|try|work on|look at|sort out)\b/i
const CORRECTION = /^(?:no[,.!\s]|nope|not that|wrong|that'?s (?:not|wrong)|stop|undo|revert|you (?:broke|missed)|that broke)/i
const ASKS = /\b(?:also|and then|plus|additionally|as well as|on top of that)\b/gi

const words = (text: string) => text.split(/\s+/).filter(Boolean)

export function hasAnchor(text: string): boolean {
  return [FILE, PATH, MENTION, CODE, IDENTIFIER, ERROR, LINK].some(rule => rule.test(text))
}

// What a prompt shows, before the session's history weighs in.
export function read(text: string): Reading {
  const prompt = text.trim()
  const count = words(prompt).length
  const isCorrection = CORRECTION.test(prompt)
  if (prompt === '' || prompt.startsWith('/') || REPLY.test(prompt)) {
    return { feeling: null, tip: null, habits: [], isVague: false, isCorrection, isReply: true }
  }

  const habits: Habit[] = []
  const anchored = hasAnchor(prompt)

  if (anchored) {
    habits.push('context')
  }

  if (VERIFY.test(prompt)) {
    habits.push('verify')
  }

  if (WHY.test(prompt)) {
    habits.push('why')
  }

  if (EXAMPLE.test(prompt)) {
    habits.push('example')
  }

  if (PLAN.test(prompt)) {
    habits.push('plan')
  }

  const asks = prompt.match(ASKS)?.length ?? 0
  const vagueWords = prompt.match(VAGUE_WORD)?.length ?? 0
  const isVague = !anchored && !habits.includes('verify') && (count <= 4 || (count <= 14 && (VAGUE_START.test(prompt) || vagueWords >= 2)))

  const feeling: Feeling | null = isCorrection
    ? null
    : asks >= 4 && !habits.includes('plan')
      ? 'overwhelmed'
      : isVague
        ? 'confused'
        : habits.includes('plan')
          ? 'calm'
          : anchored && habits.includes('verify')
            ? 'proud'
            : habits.includes('example') || habits.includes('why')
              ? 'inspired'
              : FOLLOW_UP.test(prompt)
                ? 'content'
                : anchored && count >= 6
                  ? 'proud'
                  : null

  return { feeling, tip: feeling === null ? null : TIPS[feeling], habits, isVague, isCorrection, isReply: false }
}

// The session's history on top: a second vague prompt in a row is grumpy,
// and a run of corrections or interrupts is dizzying.
export function weigh(reading: Reading, history: { vagueStreak: number; redirects: number }): Reading {
  if (reading.isVague && history.vagueStreak >= 1) {
    return { ...reading, feeling: 'grumpy', tip: TIPS.grumpy }
  }

  if (history.redirects >= 2 && (reading.isCorrection || reading.feeling === null)) {
    return { ...reading, feeling: 'dizzy', tip: TIPS.dizzy }
  }

  return reading
}

// Feelings worth a suggested rewrite: the prompt left Claude guessing.
export const NEEDS_REWRITE = new Set<Feeling>(['confused', 'grumpy', 'overwhelmed'])

// What Haiku is asked to do with a vague prompt.
export const REWRITE_SYSTEM = [
  'You help a developer write clearer requests to an AI coding agent.',
  'Rewrite the request you are given so the agent can act on it without guessing: say what to change, where, what done looks like, and how to check it.',
  'Keep their intent and their wording where it is already clear. Never invent file names, errors or facts:',
  'where something is missing, put a short bracketed placeholder such as [which file], [expected behavior] or [how to verify].',
  'If it asks for several things, list them as short numbered steps.',
  'Reply with the rewritten request only: plain text, no preamble, no quotes, at most three sentences or five steps.',
].join(' ')

// The person's prompt-craft rank, from their XP.
export const RANKS = ['Novice', 'Apprentice', 'Journeyman', 'Adept', 'Expert', 'Master'] as const
export const XP_PER_RANK = 25

export function rankOf(xp: number) {
  const index = Math.min(RANKS.length - 1, Math.floor(Math.max(0, xp) / XP_PER_RANK))

  return { name: RANKS[index] ?? 'Novice', index, toNext: index === RANKS.length - 1 ? 0 : (index + 1) * XP_PER_RANK - xp }
}

export const BADGES: { habit: Habit; name: string; goal: number; about: string }[] = [
  { habit: 'context', name: 'Context Giver', goal: 10, about: 'named a file, function, error or link' },
  { habit: 'verify', name: 'Verifier', goal: 5, about: 'said how to check the result' },
  { habit: 'plan', name: 'Planner', goal: 5, about: 'asked for a plan before changes' },
  { habit: 'example', name: 'Show-er', goal: 5, about: 'gave an example of what you want' },
  { habit: 'why', name: 'Explainer', goal: 5, about: 'said why you want it' },
  { habit: 'rewrite', name: 'Rewriter', goal: 3, about: 'sent a suggested rewrite with its placeholders filled in' },
  { habit: 'template', name: 'Templater', goal: 3, about: 'sent a starter template with its placeholders filled in' },
]

// Starter prompts for the usual kinds of work, each saying where, what done
// looks like and how to check it, with [placeholders] to fill in.
export const TEMPLATES: { id: string; name: string; text: string }[] = [
  {
    id: 'bug',
    name: 'Bug fix',
    text: "Fix a bug: [what goes wrong] when [steps or input]. Expected: [expected behavior]. It's in [file or function]; the error is [error message, if any]. Make the smallest fix, add a test that fails before it, and check by running [test command].",
  },
  {
    id: 'feature',
    name: 'New feature',
    text: "Add [feature] to [file or module] so that [who] can [do what]. Done when [acceptance criteria]. Follow the pattern in [similar existing code], and don't change [what to leave alone]. Verify with [test command or manual check].",
  },
  {
    id: 'refactor',
    name: 'Refactor',
    text: 'Refactor [file or function] to [goal] because [why]. Keep behavior identical, with no API changes outside [scope]. Run [test command] before and after; it must pass unchanged.',
  },
  {
    id: 'investigate',
    name: 'Investigate',
    text: "Investigate [problem or question] in [area of the codebase]. Don't change any code yet. Report what you find, the likely cause with file and line references, and 2–3 ways to fix it with their trade-offs.",
  },
]

// XP for sending a suggested rewrite with every placeholder filled in.
export const REWRITE_XP = 3

const PLACEHOLDER = /\[[^\]\n]{1,60}\]/g

export function placeholders(text: string): string[] {
  return text.match(PLACEHOLDER) ?? []
}

// Whether a sent prompt is a suggested rewrite the person worked from: most
// of the rewrite's own words (placeholders aside) are still there.
export function isFromRewrite(sent: string, rewrite: string): boolean {
  const words = (text: string) =>
    text
      .replace(PLACEHOLDER, ' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(word => word.length > 2)
  const theirs = new Set(words(sent))
  const ours = words(rewrite)

  return ours.length > 0 && ours.filter(word => theirs.has(word)).length / ours.length >= 0.6
}
