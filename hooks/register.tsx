import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type {
  Activity,
  Attention,
  Commit,
  Craft,
  Day,
  Drawing,
  Feeling,
  Friend,
  FriendActivity,
  MenuTab,
  Mood,
  Note,
  OutfitId,
  Phase,
  Meter,
  Preview,
  Reaction,
  Rewrite,
  Season,
  Shown,
  ShownTip,
  Quest,
  Stats,
  Usage,
  Weather,
} from '../types'
import { OUTFITS, isOutfitUnlocked } from './catalog'
import { GATES, earnsAt, levelOf, progressOf, turnLevel, xpWorth } from './growth'
import type { Milestones, XpKind } from './growth'
import { NEED_IDS, NEED_NAMES, isThriving, needTip, needsOf, wellbeingOf } from './needs'
import type { Needs } from './needs'
import { QUEST_XP, questFor, questText } from './quests'
import type { QuestId } from './quests'
import {
  BADGES,
  NEEDS_REWRITE,
  RANKS,
  REWRITE_SYSTEM,
  REWRITE_XP,
  TEMPLATES,
  TIPS,
  XP,
  isFromRewrite,
  placeholders,
  rankOf,
  read as readPrompt,
  weigh,
} from './coach'
import { docs } from './docs'
import { EMPTY_DAY, dayKey, heading, isQuiet, journal, prune } from './journal'
import { LESSONS, NUDGE_LESSONS, TIP_GAP_MS, chooseTip, themesOf, currentText, examplePrompt, lessonById, lessonOf, lessonText, plain, teachSystem, topicOf, verdictOf } from './tips'
import type { LessonId } from './tips'
import { CLAWD_SPOT, HEIGHT, MAX_MESS, NEEDS_HEIGHT, PARCEL_PCT, friendSpot, layers, meterReadings, needsHover, needsRow, phaseAt, room } from './room'
import type { FriendView } from './room'
import { SEASONS, seasonOf } from './season'
import { BODIES, MOODS } from './sprite'
import { isUnderway, walkSeconds, whereAt } from './walk'

// Theme keys, so the band follows the person's light or dark theme; a hex
// string such as '#b45309' works here too.
const COLORS = { waiting: 'warning', done: 'success', error: 'error' } as const
// A meter's reading: amber from 80%, red from 95%.
const METER_COLORS = { none: 'inactive', ok: 'text', high: 'warning', full: 'error' } as const

const WEATHER: Record<Exclude<Attention, null> | 'none', Weather> = {
  waiting: 'storm',
  error: 'rain',
  done: 'clear',
  none: 'clear',
}

const LINES: Record<Mood, string> = {
  idle: 'Hanging out',
  thinking: 'Thinking…',
  reading: 'Reading files',
  writing: 'Writing code',
  running: 'Running a command',
  searching: 'Searching',
  delegating: 'Briefing a helper',
  waiting: 'Needs you! Check the prompt',
  done: 'All done. Your turn',
  error: 'Oof, that turn hit an error',
  sleepy: 'Zzz…',
  celebrating: 'Tests pass! Party time',
  tidying: 'Tidying up after that commit',
}

// The terminal has no Svg: a face per mood instead.
const FACES: Record<Mood, string> = {
  idle: '(•ᴗ•)',
  thinking: '(•ᴗ•) …',
  reading: '(•ᴗ•)📖',
  writing: '(•ᴗ•)✎',
  running: '(•̀ᴗ•́)و',
  searching: '(•ᴗ•)🔍',
  delegating: '(•ᴗ•)→(•ᴗ•)',
  waiting: '(°o°)!',
  done: '(^ᴗ^)✧',
  error: '(×_×)',
  sleepy: '(-ᴗ-) zZ',
  celebrating: '\\(^ᴗ^)/ 🎉',
  tidying: '(•ᴗ•)🧹',
}

const ACTIVITIES: Record<string, Exclude<Activity, null>> = {
  Read: 'reading',
  NotebookRead: 'reading',
  Edit: 'writing',
  MultiEdit: 'writing',
  Write: 'writing',
  NotebookEdit: 'writing',
  Bash: 'running',
  BashOutput: 'running',
  PowerShell: 'running',
  Monitor: 'running',
  Grep: 'searching',
  Glob: 'searching',
  WebSearch: 'searching',
  WebFetch: 'searching',
  ToolSearch: 'searching',
  Agent: 'delegating',
  Task: 'delegating',
  SendMessage: 'delegating',
}

// Tools that always stop for the person, whether or not a permission
// dialog is raised for them.
const PERSON_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])

// Test runners whose clean exit is worth a dance.
const TEST_COMMAND =
  /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|npx\s+(?:jest|vitest|mocha|playwright\s+test)|jest|vitest|mocha|pytest|rspec|phpunit|go\s+test|cargo\s+test|make\s+test|claude\s+plugin\s+test|deno\s+test|dotnet\s+test|mvn\s+test|gradle\w*\s+test)\b/

// What tool.call's result carries for Bash, as far as the celebrations read it.
type BashOutcome = {
  stdout?: string
  interrupted?: boolean
  backgroundTaskId?: string
  gitOperation?: { commit?: { sha: string }; pr?: { action: string } }
}

const FRIEND_COLORS = ['#7fb3d5', '#a3d977', '#f7c873', '#c39bd3']
const DEBUG_FRIENDS: FriendActivity[] = ['reading', 'writing', 'running']
const DEBUG_KINDS = ['Explore', 'general-purpose', 'Plan']
const DEBUG_TASKS = ['Find the refund handlers', 'Write the migration', 'Run the test suite']

const PANE = 'clawd'
const ANOTHER_EXAMPLE = 'Show me another example'
const TEACH_TIMEOUT_MS = 30 * 1000
// The "Teach me" chat on a tip's lesson.
const TEACH = 'teach'
const SLEEP_MS = 10 * 60 * 1000
const DANCE_MS = 6000
const SWEEP_MS = 3500
// How long after a file-changing tool the mess is recounted.
const RECOUNT_MS = 1500
// How often a session looks for limits another session read.
const LIMITS_MS = 60 * 1000
// How long an opened package shows its sparkles before it goes.
const UNBOX_MS = 4000
// Tools whose edits leave something for the tests to check.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])
// Tools that may leave files changed.
const CHANGING_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit', 'Bash'])
// He knocks when he starts waiting, then again this often while you are away.
const KNOCK_EVERY_MS = 3 * 60 * 1000
// No second knock within this long of the last one.
const KNOCK_GAP_MS = 8000
const MAX_NOTES = 5
// A feeling stays this long after the turn it came with ends.
const FEELING_MS = 2 * 60 * 1000
const MAX_TIPS = 5
const MAX_REWRITES = 5
// Prompts longer than this are not sent for a rewrite.
const REWRITE_INPUT_MAX = 2000
const REWRITE_TIMEOUT_MS = 30000
// A rewrite put in the prompt box counts if it is sent within this long.
const DRAFT_MS = 30 * 60 * 1000
// Context this full gets a nudge toward /compact or a fresh session.
const CONTEXT_NUDGE = 85
const LIMIT_WARN = 90
const TAB_NAMES: Record<MenuTab, string> = { docs: 'Docs', coach: 'Coach', journal: 'Journal', wardrobe: 'Wardrobe', debug: 'Debug' }
// What can be drafted into the prompt box, and the habit it trains.
type Draft = 'rewrite' | 'template'
const DRAFT_NAMES: Record<Draft, string> = { rewrite: 'rewrite', template: 'template' }
const PERSON_ORIGINS = new Set(['composer', 'bridge', 'sdk'])
const FEELINGS: Feeling[] = ['confused', 'grumpy', 'overwhelmed', 'dizzy', 'proud', 'inspired', 'calm', 'content']
const FEELING_CHOICES: (Feeling | null)[] = [null, ...FEELINGS]
const WELLBEING_CHOICES = [null, 'fine', 'low', 'empty'] as const
const NO_CRAFT: Craft = { xp: 0, prompts: 0, vague: 0, habits: { context: 0, verify: 0, plan: 0, example: 0, why: 0, rewrite: 0, template: 0 }, tips: [], rewrites: [] }
const NO_USAGE: Usage = { context: null, session: null, week: null }
const NOTE_LINE_MAX = 140
const FALL_MS = 1600
// A friend walking out is gone this long after reaching the door.
const LINGER_MS = 400
const MAX_COMMITS = 3
const PHASE_MS = 5 * 60 * 1000
const MAX_LEVEL = 12
// Pixels per band column on desktop: the code font's advance, which the
// surface does not report. Calibrated from the Debug tab and kept.
const CELL_PX = 7.8
const MIN_WIDTH = 320
const DEFAULT_STATS: Stats = { name: 'Clawd', turns: 0, outfit: null, lastTidyTurn: 0, xp: 0 }
const NO_PREVIEW: Preview = {
  mood: null,
  level: null,
  weather: null,
  phase: null,
  friends: null,
  polaroids: null,
  partyHat: null,
  mess: null,
  notes: null,
  season: null,
  feeling: null,
  wellbeing: null,
}
const FIRST_SHOWN: Shown = { mood: 'idle', from: null, at: 0, dur: 0 }

const WEATHERS: (Weather | null)[] = [null, 'clear', 'rain', 'storm']
const PHASES: (Phase | null)[] = [null, 'dawn', 'day', 'dusk', 'night']
const FRIEND_COUNTS: (number | null)[] = [null, 0, 1, 2, 3]
const POLAROID_COUNTS: (number | null)[] = [null, 0, 1, 2, 3]
const PARTY_HATS: (boolean | null)[] = [null, true, false]
const SEASON_CHOICES: (Season | null)[] = [null, ...SEASONS]
const NOTE_COUNTS: (number | null)[] = [null, 0, 1, 2, 3, 4, 5]
const SAMPLE_NOTES: Note[] = [
  { color: '#7fb3d5', kind: 'Explore', line: 'Found 3 refund handlers under functions/models/Order', at: 0 },
  { color: '#a3d977', kind: 'general-purpose', line: 'Migration written and dry-run against staging', at: 0 },
  { color: '#f7c873', kind: 'Plan', line: 'Four steps: types, reconcile, tests, docs', at: 0 },
  { color: '#c39bd3', kind: 'Explore', line: 'No callers left for the old Pub/Sub adapter', at: 0 },
  { color: '#7fb3d5', kind: 'general-purpose', line: 'All 41 tests pass', at: 0 },
]
const MESS_COUNTS: (number | null)[] = [null, ...Array.from({ length: MAX_MESS + 1 }, (_, i) => i)]
const SAMPLE_COMMITS: Commit[] = [
  { sha: 'f5f4665', message: 'Page refund line items past the first 25', at: 0 },
  { sha: 'bcc7e8b', message: 'Keep shipping a claim refunded in liability', at: 0 },
  { sha: '22c2c28', message: 'Keep non-JSON metafield values as strings', at: 0 },
]

const attention = atom({ plugin: 'clawdagotchi', key: 'attention' } as const, null)
const activity = atom({ plugin: 'clawdagotchi', key: 'activity' } as const, null)
const isAsleep = atom({ plugin: 'clawdagotchi', key: 'isAsleep' } as const, false)
const isHidden = atom({ plugin: 'clawdagotchi', key: 'isHidden' } as const, false)
const stats = atom({ plugin: 'clawdagotchi', key: 'stats' } as const, DEFAULT_STATS)
const friends = atom({ plugin: 'clawdagotchi', key: 'friends' } as const, [])
const shown = atom({ plugin: 'clawdagotchi', key: 'shown' } as const, FIRST_SHOWN)
const phase = atom({ plugin: 'clawdagotchi', key: 'phase' } as const, 'day')
const season = atom({ plugin: 'clawdagotchi', key: 'season' } as const, 'autumn')
const preview = atom({ plugin: 'clawdagotchi', key: 'preview' } as const, NO_PREVIEW)
const menuTab = atom({ plugin: 'clawdagotchi', key: 'menuTab' } as const, 'docs')
const isCelebrating = atom({ plugin: 'clawdagotchi', key: 'isCelebrating' } as const, false)
const commits = atom({ plugin: 'clawdagotchi', key: 'commits' } as const, [])
const partyUntil = atom({ plugin: 'clawdagotchi', key: 'partyUntil' } as const, 0)
const isMuted = atom({ plugin: 'clawdagotchi', key: 'isMuted' } as const, false)
const sweeping = atom({ plugin: 'clawdagotchi', key: 'sweeping' } as const, 0)
const notes = atom({ plugin: 'clawdagotchi', key: 'notes' } as const, [])
const dropped = atom({ plugin: 'clawdagotchi', key: 'dropped' } as const, null)
const feeling = atom({ plugin: 'clawdagotchi', key: 'feeling' } as const, null)
const craft = atom({ plugin: 'clawdagotchi', key: 'craft' } as const, NO_CRAFT)
const usage = atom({ plugin: 'clawdagotchi', key: 'usage' } as const, NO_USAGE)
const wantsRewrites = atom({ plugin: 'clawdagotchi', key: 'wantsRewrites' } as const, false)
const days = atom({ plugin: 'clawdagotchi', key: 'days' } as const, {})
// Whether the band draws the room as stacked layers (the default) or one drawing.
const drawing = atom({ plugin: 'clawdagotchi', key: 'drawing' } as const, 'images')
const tip = atom({ plugin: 'clawdagotchi', key: 'tip' } as const, null)
const wantsTips = atom({ plugin: 'clawdagotchi', key: 'wantsTips' } as const, true)
const teaching = atom({ plugin: 'clawdagotchi', key: 'teaching' } as const, null)
const practiced = atom({ plugin: 'clawdagotchi', key: 'practiced' } as const, {})
const skills = atom({ plugin: 'clawdagotchi', key: 'skills' } as const, [])
const dirty = atom({ plugin: 'clawdagotchi', key: 'dirty' } as const, 0)
const needInputs = atom({ plugin: 'clawdagotchi', key: 'needInputs' } as const, { clearAt: 0, newAt: 0, unchecked: 0 })
const quest = atom({ plugin: 'clawdagotchi', key: 'quest' } as const, null)
const useFloor = atom({ plugin: 'clawdagotchi', key: 'useFloor' } as const, true)
const cellPx = atom({ plugin: 'clawdagotchi', key: 'cellPx' } as const, CELL_PX)

// Open asks by tool name: a PermissionRequest names the tool, not the call,
// so the band clears once a call of each asked tool has finished. Module
// variables start over on reload.
const asked = new Map<string, number>()
let nap: Timer | undefined
let dance: Timer | undefined
let broom: Timer | undefined
let lastKnock = 0
// Vague prompts in a row, and corrections or interrupts in a row.
let vagueStreak = 0
let redirects = 0
let calming: Timer | undefined
// One rewrite at a time.
let isRewriting = false
// The rewrite or template last put in the prompt box, waiting to be filled
// in and sent.
let drafted: { text: string; kind: Draft; at: number } | undefined
// Usage warnings already given, so each fires once per crossing.
const warned = new Set<string>()
let knocking: Timer | undefined
let recount: Timer | undefined
// When this session last took a limits reading, its own or a shared one.
let limitsAt = 0
// Whether the turn under way started from a prompt worth XP: not a reply
// like "yes" or "go on", and typed by the person.
let isTurnWorthXp = false
// Tests passed since the last commit: committing then is a good habit.
let hasPassedSinceCommit = false
// The session's folder, where git counts the mess.
let workdir: string | undefined
let arrivals = 0
// The room's width in pixels as last drawn: walks are timed by distance.
let roomWidth = 740

function moodOf(state: {
  attention: Attention
  activity: Activity
  isAsleep: boolean
  isCelebrating: boolean
  isTidying: boolean
}): Mood {
  if (state.isCelebrating) {
    return 'celebrating'
  }

  if (state.isTidying) {
    return 'tidying'
  }

  if (state.attention === 'waiting') {
    return 'waiting'
  }

  if (state.activity !== null) {
    return state.activity
  }

  if (state.isAsleep) {
    return 'sleepy'
  }

  return state.attention ?? 'idle'
}

async function currentMood($: EngineInterface): Promise<Mood> {
  const debug = await read($, preview)

  return (
    debug.mood ??
    moodOf({
      attention: await read($, attention),
      activity: await read($, activity),
      isAsleep: await read($, isAsleep),
      isCelebrating: await read($, isCelebrating),
      isTidying: (await read($, sweeping)) > 0,
    })
  )
}

// Records a change of mood, so the room walks him from the old spot.
// A change of spot sets off a walk from wherever he is at that moment: his
// spot, or partway along a walk still running, so he never jumps back to
// where that one began. Its length follows the distance.
async function note($: EngineInterface) {
  for (let tries = 0; tries < 3; tries += 1) {
    const mood = await currentMood($)
    const at = await $.clock.now()
    await update($, shown, now => {
      if (now.mood === mood) {
        return now
      }

      const here = whereAt({ from: now.from, to: CLAWD_SPOT[now.mood], at: now.at, dur: now.dur }, at)
      const to = CLAWD_SPOT[mood]

      return { mood, from: here, at, dur: walkSeconds(here, to, roomWidth) }
    })

    if ((await currentMood($)) === mood) {
      return
    }
  }
}

// Plays one of the mod's sounds unless muted; a sound that cannot play is
// skipped quietly.
async function sound($: EngineInterface, asset: 'sounds/knock.wav') {
  if (await read($, isMuted)) {
    return
  }

  void $.audio.play({ asset }).catch(() => undefined)
}

async function set($: EngineInterface, value: Attention) {
  let was: Attention = null
  await update($, attention, now => {
    was = now

    return value
  })
  await note($)

  if (value === 'waiting' && was !== 'waiting') {
    await tally($, day => ({ ...day, waits: day.waits + 1 }))
    await knock($)
    keepKnocking($)
  } else if (value !== 'waiting') {
    knocking?.cancel()
    knocking = undefined
  }
}

// Knock knock on the glass, at most once per KNOCK_GAP_MS.
async function knock($: EngineInterface) {
  const now = await $.clock.now()

  if (now - lastKnock >= KNOCK_GAP_MS) {
    lastKnock = now
    await sound($, 'sounds/knock.wav')
  }
}

function keepKnocking($: EngineInterface) {
  knocking?.cancel()
  knocking = $.clock.every(KNOCK_EVERY_MS, () => void knock($))
}

function ask($: EngineInterface, tool: string) {
  asked.set(tool, (asked.get(tool) ?? 0) + 1)

  return set($, 'waiting')
}

// A finished call settles its own ask; once no ask is open, a waiting that
// a notification raised (it names no tool) clears with it.
async function settle($: EngineInterface, tool: string, isMain: boolean) {
  const count = asked.get(tool) ?? 0

  if (count === 1) {
    asked.delete(tool)
  } else if (count > 1) {
    asked.set(tool, count - 1)
  }

  if (asked.size === 0 && (count > 0 || isMain) && (await read($, attention)) === 'waiting') {
    await set($, null)
  }
}

function clear($: EngineInterface) {
  asked.clear()

  return set($, null)
}

async function busy($: EngineInterface, value: Activity) {
  await update($, activity, () => value)
  await note($)
}

async function wake($: EngineInterface) {
  nap?.cancel()
  nap = undefined
  await update($, isAsleep, () => false)
  await note($)
}

async function fallAsleep($: EngineInterface) {
  await update($, isAsleep, () => true)
  await note($)
}

// Falls asleep after SLEEP_MS with nothing going on.
async function rest($: EngineInterface) {
  await wake($)
  nap?.cancel()
  nap = $.clock.after(SLEEP_MS, () => void fallAsleep($))
}

// Every session shares one pet: a change applies to what the store holds
// now, not to this session's copy, so sessions never undo each other's
// turns and XP.
async function save($: EngineInterface, change: (now: Stats) => Stats) {
  const kept = (await $.store.get('stats')) as Partial<Stats> | null | undefined
  const base = kept !== null && kept !== undefined && typeof kept.xp === 'number' ? { ...(await read($, stats)), ...kept } : await read($, stats)
  const next = change(base)
  await update($, stats, () => next)
  await $.store.set('stats', next)

  return next
}

async function stopDancing($: EngineInterface) {
  await update($, isCelebrating, () => false)
  await note($)
}

async function celebrate($: EngineInterface) {
  dance?.cancel()
  await update($, isCelebrating, () => true)
  await wake($)
  dance = $.clock.after(DANCE_MS, () => void stopDancing($))
}

async function stopSweeping($: EngineInterface) {
  await update($, sweeping, () => 0)
  await note($)
}

// Sweeps `pieces` of mess away, as a commit does.
async function sweep($: EngineInterface, pieces: number) {
  if (pieces === 0) {
    return
  }

  broom?.cancel()
  await update($, sweeping, () => pieces)
  await wake($)
  broom = $.clock.after(SWEEP_MS, () => void stopSweeping($))
}

// One piece of mess per file with uncommitted changes.
function messOf(files: number) {
  return Math.max(0, Math.min(MAX_MESS, files))
}

// Counts the files git sees changed or new in the session's folder; outside
// a repo, or if git fails, the floor stays clean.
async function countDirty($: EngineInterface) {
  try {
    const status = await $.process.run(['git', 'status', '--porcelain'], { cwd: workdir, timeoutMs: 5000 })
    const files = status.exitCode === 0 ? status.stdout.split('\n').filter(line => line.trim() !== '').length : 0
    await update($, dirty, () => files)
  } catch {
    await update($, dirty, () => 0)
  }
}

// After a tool that may have changed files, a recount once things settle.
function recountSoon($: EngineInterface) {
  recount?.cancel()
  recount = $.clock.after(RECOUNT_MS, () => void countDirty($))
}

async function frame($: EngineInterface, commit: Commit) {
  const next = [commit, ...(await read($, commits)).filter(one => one.sha !== commit.sha)].slice(0, MAX_COMMITS)
  await update($, commits, () => next)
  await $.store.set('commits', next)
  const before = messOf(await read($, dirty))
  await save($, now => ({ ...now, lastTidyTurn: now.turns }))
  await countDirty($)
  await sweep($, before)

  // Committing once the tests pass is the habit worth XP.
  if (hasPassedSinceCommit) {
    hasPassedSinceCommit = false
    await grow($, 'habit', 3)
    await finishQuest($, 'test-commit')
  }
}

// A party hat until the end of the day it was earned on.
async function throwParty($: EngineInterface) {
  const midnight = new Date(await $.clock.now())
  midnight.setHours(24, 0, 0, 0)
  const until = midnight.getTime()
  await update($, partyUntil, () => until)
  await $.store.set('partyUntil', until)
}

function commitOf(command: string, out: BashOutcome): { sha: string; message: string } | undefined {
  const line = /\[[^\]\s]+(?: \([^)]*\))? ([0-9a-f]{7,40})\] (.+)/.exec(out.stdout ?? '')
  const sha = out.gitOperation?.commit?.sha ?? line?.[1]

  if (sha === undefined) {
    return undefined
  }

  const flag = /-m\s+(["'])([\s\S]*?)\1/.exec(command)?.[2]
  const message = line?.[2] ?? flag?.split('\n')[0] ?? 'A commit'

  return { sha: sha.slice(0, 7), message: message.trim().slice(0, 120) }
}

// Reads a finished call for something to celebrate. Never throws: the call
// already ran, and its result must reach the model whatever happens here.
async function cheer($: EngineInterface, tool: string, input: Record<string, unknown>, ran: { isError?: boolean; deny?: string; result?: unknown }) {
  try {
    if (ran.isError === true || ran.deny !== undefined) {
      return
    }

    if (/create_pull_request$/.test(tool)) {
      await throwParty($)
      await tally($, day => ({ ...day, prs: day.prs + 1 }))

      return
    }

    if (tool !== 'Bash') {
      return
    }

    const command = typeof input.command === 'string' ? input.command : ''
    const out = (ran.result ?? {}) as BashOutcome

    if (out.interrupted === true || out.backgroundTaskId !== undefined) {
      return
    }

    const commit = commitOf(command, out)

    if (commit !== undefined && (out.gitOperation?.commit !== undefined || /\bgit\s+commit\b/.test(command))) {
      await frame($, { ...commit, at: await $.clock.now() })
      await tally($, day => ({ ...day, commits: [...day.commits, { sha: commit.sha, message: commit.message }] }))
    }

    if (out.gitOperation?.pr?.action === 'created' || (out.gitOperation?.pr === undefined && /\bgh\s+pr\s+create\b/.test(command))) {
      await throwParty($)
      await tally($, day => ({ ...day, prs: day.prs + 1 }))
    }

    if (TEST_COMMAND.test(command)) {
      await celebrate($)
      await tally($, day => ({ ...day, testsPassed: day.testsPassed + 1 }))
      // Everything Claude changed has been checked: Confidence refills.
      hasPassedSinceCommit = true
      await touchNeeds($, inputs => ({ ...inputs, unchecked: 0 }))
    }
  } catch {
    // A celebration missed is better than a tool result lost.
  }
}

async function feel($: EngineInterface, next: Reaction | null) {
  calming?.cancel()
  calming = undefined
  await update($, feeling, () => next)
}

async function calmDown($: EngineInterface, at: number) {
  await update($, feeling, now => (now !== null && now.at === at ? null : now))
}

// Reads a prompt the person typed: how it makes him feel, and what it does
// for their prompt craft. A rank or badge earned says so in a toast.
async function coach($: EngineInterface, text: string) {
  if (await creditDraft($, text)) {
    return
  }

  const first = readPrompt(text)

  // A reply to Claude leaves his feeling, and your streaks, as they were.
  if (first.isReply && !first.isCorrection) {
    return
  }

  const reading = weigh(first, { vagueStreak, redirects })
  vagueStreak = reading.isVague ? vagueStreak + 1 : reading.feeling !== null ? 0 : vagueStreak
  redirects = reading.isCorrection ? redirects + 1 : reading.feeling !== null && reading.feeling !== 'dizzy' ? 0 : redirects

  const at = await $.clock.now()
  const before = await read($, craft)
  const after = await update($, craft, now => ({
    xp: Math.max(0, now.xp + (reading.feeling === null ? 0 : XP[reading.feeling])),
    prompts: now.prompts + 1,
    vague: now.vague + (reading.isVague ? 1 : 0),
    habits: { ...now.habits, ...Object.fromEntries(reading.habits.map(habit => [habit, now.habits[habit] + 1])) },
    tips:
      reading.feeling !== null && XP[reading.feeling] < 0 && reading.tip !== null
        ? [{ tip: reading.tip, at }, ...now.tips].slice(0, MAX_TIPS)
        : now.tips,
    rewrites: now.rewrites,
  }))
  await $.store.set('craft', after)
  await feel($, reading.feeling === null || reading.tip === null ? null : { feeling: reading.feeling, tip: reading.tip, at, prompt: text.trim().slice(0, 2000) })

  // Growth: a clear prompt earns craft XP (a vague one costs none) and
  // refills Clarity; saying how to check refills Confidence; each habit may
  // be today's quest.
  if (reading.feeling !== null && XP[reading.feeling] > 0) {
    await grow($, 'craft', XP[reading.feeling])
  }

  await touchNeeds($, inputs => ({
    ...inputs,
    clearAt: reading.isVague ? inputs.clearAt - 60 * 60 * 1000 : at,
    unchecked: reading.habits.includes('verify') ? 0 : inputs.unchecked,
  }))

  if (reading.habits.includes('plan')) {
    await tried($)
  }

  for (const habit of reading.habits) {
    if (habit === 'verify' || habit === 'plan' || habit === 'example' || habit === 'why') {
      await finishQuest($, habit)
    }
  }

  if (reading.feeling !== null && NEEDS_REWRITE.has(reading.feeling) && (await read($, wantsRewrites))) {
    void suggest($, text, at)
  }

  const rank = rankOf(after.xp)
  const rankedUp = rank.index > rankOf(before.xp).index
  const earned = BADGES.filter(badge => before.habits[badge.habit] < badge.goal && after.habits[badge.habit] >= badge.goal).map(badge => badge.name)

  if (rankedUp) {
    $.ui.toast(`Prompt craft: you're now ${/^[AEIOU]/.test(rank.name) ? 'an' : 'a'} ${rank.name}`)
  }

  for (const name of earned) {
    $.ui.toast(`Badge earned: ${name}`)
  }

  const isNudge = reading.feeling !== null && XP[reading.feeling] < 0 && reading.tip !== null
  await tally($, day => ({
    ...day,
    prompts: day.prompts + 1,
    clear: day.clear + (reading.isVague ? 0 : 1),
    corrections: day.corrections + (reading.isCorrection ? 1 : 0),
    themes: themesOf(text).reduce((all, theme) => ({ ...all, [theme]: (all[theme] ?? 0) + 1 }), day.themes),
    tips: isNudge && reading.tip !== null ? { ...day.tips, [reading.tip]: (day.tips[reading.tip] ?? 0) + 1 } : day.tips,
    badges: [...day.badges, ...earned],
    ranks: rankedUp ? [...day.ranks, rank.name] : day.ranks,
  }))
}

// Asks Haiku for a clearer version of a vague prompt, in the background: it
// lands on the tip it came with (if still showing) and in the Coach tab.
// Nothing here may throw into the prompt it came from.
async function suggest($: EngineInterface, text: string, at: number) {
  const prompt = text.trim()

  if (isRewriting || prompt.length > REWRITE_INPUT_MAX) {
    return
  }

  isRewriting = true

  try {
    const reply = await $.model.complete({
      model: 'haiku',
      system: REWRITE_SYSTEM,
      prompt: `The request:\n\n${prompt}`,
      maxTokens: 300,
      effort: 'low',
      timeoutMs: REWRITE_TIMEOUT_MS,
    })

    if (!reply.isAnswered || reply.text.trim() === '') {
      return
    }

    const rewrite = reply.text.trim().replace(/^["'`]+|["'`]+$/g, '')
    const kept: Rewrite = { prompt: prompt.slice(0, 200), rewrite, at }
    const after = await update($, craft, now => ({ ...now, rewrites: [kept, ...now.rewrites].slice(0, MAX_REWRITES) }))
    await $.store.set('craft', after)
    await update($, feeling, now => (now !== null && now.at === at ? { ...now, rewrite } : now))
  } catch {
    // No rewrite this time; the tip still stands.
  } finally {
    isRewriting = false
  }
}

// A sent prompt built from a rewrite he suggested or a starter template: with
// its placeholders filled in it earns XP and its badge (Rewriter, Templater);
// with some left, he says so. Returns whether it was one, so the usual
// reading is skipped.
async function creditDraft($: EngineInterface, text: string): Promise<boolean> {
  const draft = drafted
  const now = await $.clock.now()

  if (draft === undefined || now - draft.at > DRAFT_MS || !isFromRewrite(text, draft.text)) {
    return false
  }

  drafted = undefined
  const left = placeholders(text)

  if (left.length > 0) {
    await feel($, { feeling: 'confused', tip: `Fill in ${left.slice(0, 2).join(' and ')} before sending`, at: now })

    return true
  }

  const before = await read($, craft)
  const after = await update($, craft, was => ({
    ...was,
    xp: was.xp + REWRITE_XP,
    prompts: was.prompts + 1,
    habits: { ...was.habits, [draft.kind]: was.habits[draft.kind] + 1, context: was.habits.context + 1, verify: was.habits.verify + 1 },
  }))
  await $.store.set('craft', after)
  await feel($, { feeling: 'proud', tip: `You filled in the ${DRAFT_NAMES[draft.kind]}: +${REWRITE_XP} craft`, at: now })
  vagueStreak = 0
  await grow($, 'craft', REWRITE_XP)
  await touchNeeds($, inputs => ({ ...inputs, clearAt: now, unchecked: 0 }))

  const badge = BADGES.find(one => one.habit === draft.kind)

  const isBadge = badge !== undefined && before.habits[draft.kind] < badge.goal && after.habits[draft.kind] >= badge.goal
  const rankedUp = rankOf(after.xp).index > rankOf(before.xp).index
  const rank = rankOf(after.xp).name

  if (isBadge) {
    $.ui.toast(`Badge earned: ${badge.name}`)
  }

  if (rankedUp) {
    $.ui.toast(`Prompt craft: you're now ${/^[AEIOU]/.test(rank) ? 'an' : 'a'} ${rank}`)
  }

  await tally($, day => ({
    ...day,
    prompts: day.prompts + 1,
    clear: day.clear + 1,
    badges: isBadge ? [...day.badges, badge.name] : day.badges,
    ranks: rankedUp ? [...day.ranks, rank] : day.ranks,
  }))

  return true
}

// Puts a suggested rewrite or a starter template in the prompt box as a
// draft, never sending it: after what is already there, if anything. Where
// the box cannot take it (the desktop app draws its own), it goes to the
// clipboard instead.
async function useDraft($: EngineInterface, text: string, kind: Draft, surface: string) {
  drafted = { text, kind, at: await $.clock.now() }
  const name = DRAFT_NAMES[kind]
  const Name = `${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`

  try {
    const box = await $.prompt.read().catch(() => ({ text: '' }))
    const hasDraft = box.text.trim() !== ''
    const filled = await $.prompt.fill(hasDraft ? { text: `\n\n${text}`, mode: 'append' } : { text, mode: 'replace' })

    if (filled.isFilled) {
      $.ui.toast(`${Name} is in your prompt box: fill in the [placeholders], then send`)

      return
    }
  } catch {
    // Fall through to the clipboard.
  }

  const copied = await $.ui.copy({ text, surface: surface as never }).catch(() => ({ isCopied: false }))

  if (copied.isCopied) {
    $.ui.toast(`${Name} copied: paste it into your prompt box, fill in the [placeholders], then send`)

    return
  }

  try {
    const result = await $.process.run(['pbcopy'], { stdin: text, timeoutMs: 5000 })

    if (result.exitCode === 0) {
      $.ui.toast(`${Name} copied: paste it into your prompt box, fill in the [placeholders], then send`)

      return
    }
  } catch {
    // No clipboard either.
  }

  $.ui.toast(`Could not reach your prompt box or clipboard; copy the ${name} from the Coach tab`)
}

const DRAWINGS: Drawing[] = ['images', 'layered', 'single']
const DRAWING_NAMES: Record<Drawing, string> = {
  images: 'images (no flicker, default)',
  layered: 'layered frames',
  single: 'one picture',
}

async function nextDrawing($: EngineInterface) {
  const next = await update($, drawing, now => cycle(DRAWINGS, now))
  await $.store.set('drawing', next)
}

async function setRewrites($: EngineInterface, value: boolean) {
  await update($, wantsRewrites, () => value)
  await $.store.set('rewrites', value)
}

function meterOf(percent: number | undefined, resetsAt?: string): Meter | null {
  return percent === undefined ? null : resetsAt === undefined ? { percent } : { percent, resetsAt }
}

// Takes a usage reading, this session's own.
async function measure($: EngineInterface, reading: { context: { percent?: number }; rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[] }) {
  const session = reading.rateLimits.find(one => one.kind === 'five_hour')
  const week = reading.rateLimits.find(one => one.kind === 'seven_day')
  const now = await update($, usage, last => ({
    context: meterOf(reading.context.percent) ?? last.context,
    session: meterOf(session?.percentUsed, session?.resetsAt) ?? last.session,
    week: meterOf(week?.percentUsed, week?.resetsAt) ?? last.week,
  }))

  // The limits are the account's: share this reading with every session.
  if (session !== undefined || week !== undefined) {
    limitsAt = await $.clock.now()
    await $.store.set('limits', { session: now.session, week: now.week, at: limitsAt })
  }

  await warnAbout($, now)
}

// Takes the limits another session read more recently than this one: an
// idle session hears of them only from the sessions that are busy.
async function adoptLimits($: EngineInterface) {
  try {
    const shared = (await $.store.get('limits')) as { session?: Meter | null; week?: Meter | null; at?: number } | null | undefined

    if (shared === null || shared === undefined || typeof shared.at !== 'number' || shared.at <= limitsAt) {
      return
    }

    limitsAt = shared.at
    const now = await update($, usage, last => ({ ...last, session: shared.session ?? last.session, week: shared.week ?? last.week }))
    await warnAbout($, now)
  } catch {
    // The next look tries again.
  }
}

// Context filling up gets a coaching nudge, a limit nearly used up a toast,
// each once per crossing.
async function warnAbout($: EngineInterface, now: Usage) {
  const context = now.context?.percent ?? 0
  const peak = Math.round(context)

  if (peak > 0) {
    await tally($, day => (peak > day.contextPeak ? { ...day, contextPeak: peak } : day))
  }

  if (context >= CONTEXT_NUDGE && !warned.has('context')) {
    warned.add('context')
    await feel($, { feeling: 'overwhelmed', tip: `Context is ${Math.round(context)}% full: /compact, or start fresh`, at: await $.clock.now() })
  } else if (context < CONTEXT_NUDGE - 10) {
    warned.delete('context')
  }

  for (const [kind, meter, label] of [
    ['session', now.session, 'session'],
    ['week', now.week, 'weekly'],
  ] as const) {
    const percent = meter?.percent ?? 0

    if (percent >= LIMIT_WARN && !warned.has(kind)) {
      warned.add(kind)
      $.ui.toast(`Clawd: your ${label} limit is ${Math.round(percent)}% used`)
    } else if (percent < LIMIT_WARN - 10) {
      warned.delete(kind)
    }
  }
}

// The meters' first reading; one that fails waits for the next measure.
async function firstReading($: EngineInterface) {
  try {
    await measure($, await $.session.usage())
  } catch {
    // session.measure fills them in after the first turn.
  }
}

// Adds to today's page of the journal; days past two weeks drop off.
async function tally($: EngineInterface, change: (day: Day) => Day) {
  const today = dayKey(await $.clock.now())
  // A page from before a counter existed reads that counter as zero.
  const next = await update($, days, now => prune({ ...now, [today]: change({ ...EMPTY_DAY, ...now[today] }) }, today))
  await $.store.set('days', next)
}

// On the first look at a new day, says he wrote up the last one.
async function turnThePage($: EngineInterface) {
  const today = dayKey(await $.clock.now())
  const last = await $.store.get('lastDay')

  if (typeof last === 'string' && last !== today) {
    const page = (await read($, days))[last]

    if (page !== undefined && !isQuiet(page)) {
      $.ui.toast(`Clawd wrote in his journal about ${heading(last)}. Menu → Journal`)
    }
  }

  if (last !== today) {
    await $.store.set('lastDay', today)
  }
}

// The sky and the decor follow the real clock and calendar.
async function tick($: EngineInterface) {
  const date = new Date(await $.clock.now())
  await update($, phase, () => phaseAt(date.getHours()))
  await update($, season, () => seasonOf(date.getMonth() + 1))
  await turnThePage($)
  await maybeTip($)
  // Files changed outside Claude count too.
  await countDirty($)
  await deliver($)
}

// Sums the journal's last seven days, today included, for the tips.
function lastWeek(pages: Record<string, Day>, today: string): Day {
  const from = new Date(`${today}T12:00:00`)
  from.setDate(from.getDate() - 6)
  const oldest = dayKey(from.getTime())

  return Object.entries(pages)
    .filter(([key]) => key >= oldest && key <= today)
    .map(([, page]) => ({ ...EMPTY_DAY, ...page }))
    .reduce(
      (sum, page) => ({
        ...sum,
        turns: sum.turns + page.turns,
        prompts: sum.prompts + page.prompts,
        clear: sum.clear + page.clear,
        interrupts: sum.interrupts + page.interrupts,
        corrections: sum.corrections + page.corrections,
        waits: sum.waits + page.waits,
        contextPeak: Math.max(sum.contextPeak, page.contextPeak),
        themes: Object.entries(page.themes).reduce((all, [theme, count]) => ({ ...all, [theme]: (all[theme] ?? 0) + count }), sum.themes),
        friends: [...sum.friends, ...page.friends],
        commits: [...sum.commits, ...page.commits],
      }),
      EMPTY_DAY,
    )
}

// Puts up a tip when one is due: at most one per TIP_GAP_MS across every
// session (the log is in the store), none while one waits to be read.
async function maybeTip($: EngineInterface) {
  try {
    if (!(await read($, wantsTips))) {
      return
    }

    const now = await $.clock.now()
    const showing = await read($, tip)

    if (showing !== null && now - showing.at < TIP_GAP_MS) {
      return
    }

    const kept = await $.store.get('tipLog')
    const log = Array.isArray(kept) ? (kept as ShownTip[]) : []
    const today = dayKey(now)
    const pages = await read($, days)
    const pet = await read($, stats)
    const next = chooseTip(
      {
        week: lastWeek(pages, today),
        today: { ...EMPTY_DAY, ...pages[today] },
        craft: await read($, craft),
        sinceCommit: Math.max(0, pet.turns - pet.lastTidyTurn),
        wantsRewrites: await read($, wantsRewrites),
        practiced: await read($, practiced),
        skills: await read($, skills),
        skillsUsed: await skillsUsed($),
      },
      log,
      now,
    )

    if (next === null) {
      return
    }

    const shown: ShownTip = { id: next.id, text: next.text, topic: next.topic, at: now }
    await $.store.set('tipLog', [...log, shown].slice(-40))
    await update($, tip, () => shown)
  } catch {
    // No tip this time.
  }
}

// How far along the milestones are: lessons passed and skills used.
async function milestonesOf($: EngineInterface): Promise<Milestones> {
  const passes = await read($, practiced)

  return {
    lessonsPracticed: Object.values(passes).reduce((sum, count) => sum + count, 0),
    skillsUsed: Object.keys(await skillsUsed($)).length,
  }
}

// His level: what his XP earns past the milestones, never below the level
// he had under the old turns-only rule while the floor is on.
async function levelNow($: EngineInterface, pet: Stats): Promise<number> {
  const earned = levelOf(pet.xp, await milestonesOf($))

  return (await read($, useFloor)) ? Math.max(earned, pet.levelFloor ?? 1) : earned
}

async function needsNow($: EngineInterface): Promise<Needs> {
  return needsOf(await read($, needInputs), {
    context: (await read($, usage)).context?.percent ?? null,
    dirty: await read($, dirty),
    now: await $.clock.now(),
  })
}

// Adds XP, weighted by his stage and the needs bonus. XP is never taken
// away. A level reached says so; a milestone in the way says what it needs.
async function grow($: EngineInterface, kind: XpKind, base: number) {
  if (base <= 0) {
    return
  }

  const pet = await read($, stats)
  const milestones = await milestonesOf($)
  const before = progressOf(pet.xp, milestones)
  const levelBefore = await levelNow($, pet)
  const gained = xpWorth(kind, base, levelBefore, isThriving(await needsNow($)))

  if (gained <= 0) {
    return
  }

  const after = await save($, now => ({ ...now, xp: now.xp + gained }))
  const levelAfter = await levelNow($, after)
  const progress = progressOf(after.xp, milestones)

  if (levelAfter > levelBefore) {
    $.ui.toast(`${after.name} reached level ${levelAfter}`)
    await tally($, day => ({ ...day, levels: [...day.levels, levelAfter] }))
  } else if (progress.blockedBy !== null && before.blockedBy === null && levelAfter === progress.level) {
    // Held at a gate (and not above it on the old floor): say what opens it.
    $.ui.toast(`${after.name} is ready for level ${progress.level + 1}. To unlock it: ${progress.blockedBy.toLowerCase()}.`)
  }
}

async function touchNeeds($: EngineInterface, change: (now: { clearAt: number; newAt: number; unchecked: number }) => { clearAt: number; newAt: number; unchecked: number }) {
  const next = await update($, needInputs, change)
  await $.store.set('needs', next)
}

// Something new tried: Curiosity refills.
async function tried($: EngineInterface) {
  const now = await $.clock.now()
  await touchNeeds($, inputs => ({ ...inputs, newAt: now }))
}

async function toggleFloor($: EngineInterface) {
  const next = await update($, useFloor, now => !now)
  await $.store.set('useFloor', next)
}

// Debug: a fresh package by the door, today's quest replaced by another.
async function redeliver($: EngineInterface) {
  const now = await $.clock.now()
  const was = await read($, quest)
  const next = { day: dayKey(now), id: questFor(`${dayKey(now)}-${now}`, true), openedAt: null, doneAt: null }
  await update($, quest, () => (was !== null && was.id === next.id ? { ...next, id: questFor(`${now}`, true) } : next))
  await $.store.set('quest', await read($, quest))
}

// The morning's package: a new quest for a new day, unopened.
async function deliver($: EngineInterface) {
  const today = dayKey(await $.clock.now())
  const now = await read($, quest)

  if (now !== null && now.day === today) {
    return
  }

  const used = await skillsUsed($)
  const next = { day: today, id: questFor(today, (await read($, skills)).some(name => used[name] === undefined)), openedAt: null, doneAt: null }
  await update($, quest, () => next)
  await $.store.set('quest', next)
}

async function openParcel($: EngineInterface) {
  const now = await read($, quest)

  if (now === null || now.openedAt !== null) {
    return
  }

  const at = await $.clock.now()
  const opened = { ...now, openedAt: at }
  await update($, quest, () => opened)
  await $.store.set('quest', opened)
  $.ui.toast(`Today's quest: ${questText(now.id)}. Worth ${QUEST_XP} XP.`)
  // Redraw once the sparkles are done, so the box goes.
  $.clock.after(UNBOX_MS + 100, () => void note($))
}

// A quest done, if it is today's and its package is open.
async function finishQuest($: EngineInterface, id: QuestId) {
  const now = await read($, quest)

  if (now === null || now.id !== id || now.openedAt === null || now.doneAt !== null || now.day !== dayKey(await $.clock.now())) {
    return
  }

  const done = { ...now, doneAt: await $.clock.now() }
  await update($, quest, () => done)
  await $.store.set('quest', done)
  $.ui.toast(`Quest done: ${questText(id)}. +${QUEST_XP} XP`)
  await grow($, 'quest', QUEST_XP)
  await tried($)
}

// The skills this session lists, for the skill tips: read from the context
// breakdown, the local estimate, which costs no request.
async function loadSkills($: EngineInterface) {
  try {
    const listed = (await $.session.usage({ breakdown: 'summary' })).context.breakdown?.skills?.skillFrontmatter ?? []
    await update($, skills, () => listed.map(one => one.name))
  } catch {
    // No skill tips this session.
  }
}

async function skillsUsed($: EngineInterface): Promise<Record<string, number>> {
  const kept = await $.store.get('skillsUsed')

  return kept !== null && typeof kept === 'object' && !Array.isArray(kept) ? (kept as Record<string, number>) : {}
}

// A skill you ran, by slash command or through Claude: no tip for it for a while.
async function usedSkill($: EngineInterface, name: string) {
  const used = await skillsUsed($)
  const now = await $.clock.now()
  const last = used[name]
  await $.store.set('skillsUsed', { ...used, [name]: now })
  await tried($)

  // 5 XP the first time, 1 a day after that.
  if (last === undefined) {
    await grow($, 'skill', 5)
    await finishQuest($, 'new-skill')
  } else if (dayKey(last) !== dayKey(now)) {
    await grow($, 'skill', 1)
  }
}

function dismissTip($: EngineInterface) {
  return update($, tip, () => null)
}

// "Teach me": opens a chat beside the session on the lesson behind a tip.
function teach($: EngineInterface, shownTip: ShownTip) {
  const { lesson, topic } = lessonOf(shownTip.id)

  return openLesson($, lesson, topic, currentText(shownTip.id, shownTip.text))
}

// The same from one of his nudges: the lesson for how he feels, with the
// prompt he reacted to already sent for feedback.
async function teachFromNudge($: EngineInterface) {
  const now = await read($, feeling)
  const previewed = (await read($, preview)).feeling
  const felt = previewed ?? now?.feeling ?? null
  // Overwhelmed by a full context rather than a prompt: the context lesson.
  const isContext = felt === 'overwhelmed' && previewed === null && now?.prompt === undefined
  const lesson = felt === null ? undefined : isContext ? 'context' : NUDGE_LESSONS[felt]

  if (lesson === undefined) {
    return
  }

  await openLesson($, lesson, topicOf(lesson), previewed === null ? (now?.tip ?? '') : TIPS[previewed])

  if (previewed === null && now?.prompt !== undefined && now.prompt !== '') {
    await askLesson($, now.prompt)
  }
}

async function openLesson($: EngineInterface, lesson: LessonId, topic: string, intro: string) {
  await update($, teaching, () => ({ lesson, topic, intro, turns: [] }))
  await $.ui.open({ id: TEACH, title: `Teach me: ${LESSONS[lesson].title}`, focus: true, closeOnEscape: true })
}

// One exchange in the lesson chat: a request to check or a question, or a
// fresh example. The turn shows at once; Haiku's reply fills it in. A
// request that needs nothing more is a pass, counted toward the lesson.
async function askLesson($: EngineInterface, text: string, isExample = false) {
  const asked = text.trim()
  const now = await read($, teaching)

  if (now === null || (!isExample && asked === '') || now.turns.some(one => one.reply === null)) {
    return
  }

  const lesson = lessonById(now.lesson)
  const index = now.turns.length
  const examples = now.turns.filter(one => one.ask === ANOTHER_EXAMPLE && one.reply !== null).map(one => one.reply ?? '')
  await update($, teaching, value => (value === null ? null : { ...value, turns: [...value.turns, { ask: isExample ? ANOTHER_EXAMPLE : asked, reply: null }] }))

  let reply = "I couldn't come up with anything just now. Give it another go in a minute."
  let isPass = false

  try {
    const answer = await $.model.complete({
      model: 'haiku',
      system: teachSystem(lesson),
      prompt: isExample ? examplePrompt(lesson, examples) : asked,
      maxTokens: 400,
      effort: 'low',
      timeoutMs: TEACH_TIMEOUT_MS,
    })

    if (answer.isAnswered && answer.text.trim() !== '') {
      const verdict = verdictOf(answer.text)
      reply = plain(verdict.text)
      isPass = verdict.isPass && !isExample
    }
  } catch {
    // The fallback reply stands.
  }

  await update($, teaching, value =>
    value === null ? null : { ...value, turns: value.turns.map((one, at) => (at === index ? { ...one, reply, isPass } : one)) },
  )

  if (isPass) {
    const after = await update($, practiced, value => ({ ...value, [now.lesson]: (value[now.lesson] ?? 0) + 1 }))
    await $.store.set('practiced', after)
    await grow($, 'lesson', 5)
    await tried($)
    await finishQuest($, 'lesson')
  }
}

async function setTips($: EngineInterface, value: boolean) {
  await update($, wantsTips, () => value)
  await $.store.set('wantsTips', value)

  if (!value) {
    await dismissTip($)
  }
}

async function arrive($: EngineInterface, id: string, tag: { kind?: string; task?: string } = {}) {
  const at = await $.clock.now()
  const color = FRIEND_COLORS[arrivals % FRIEND_COLORS.length] ?? '#7fb3d5'
  await update($, friends, now => {
    const known = now.find(one => one.id === id)

    if (known === undefined) {
      arrivals += 1
      const door = friendSpot('door', now.length)
      const dur = walkSeconds(door, friendSpot('thinking', now.length), roomWidth)
      const fresh: Friend = { id, color, activity: 'thinking', from: door, at, dur, isLeaving: false, ...tag }

      return [...now, fresh]
    }

    if (!known.isLeaving) {
      return now.map(one => (one.id === id ? { ...one, ...tag } : one))
    }

    // Back before it was out the door: it turns round from where it is.
    return now.map((one, i) => {
      if (one.id !== id) {
        return one
      }

      const here = whereAt({ from: one.from, to: friendSpot('door', i), at: one.at, dur: one.dur }, at)

      return { ...one, ...tag, activity: 'thinking', isLeaving: false, from: here, at, dur: walkSeconds(here, friendSpot('thinking', i), roomWidth) }
    })
  })
}

async function shift($: EngineInterface, id: string, next: FriendActivity) {
  const at = await $.clock.now()
  await update($, friends, now =>
    now.map((one, i) => {
      if (one.id !== id || one.activity === next || one.isLeaving) {
        return one
      }

      const here = whereAt({ from: one.from, to: friendSpot(one.activity, i), at: one.at, dur: one.dur }, at)

      return { ...one, activity: next, from: here, at, dur: walkSeconds(here, friendSpot(next, i), roomWidth) }
    }),
  )
}

async function goHome($: EngineInterface, id: string, at: number) {
  await update($, friends, now => now.filter(one => !(one.id === id && one.isLeaving && one.at === at)))
}

// The first line of a report, without its Markdown, cut to fit a tooltip.
function firstLine(answer: string): string {
  const line =
    answer
      .split('\n')
      .map(one => one.replace(/^\s*(?:#{1,6}\s+|[-*+>]\s+|\d+[.)]\s+)*/, '').replace(/[*_`]/g, '').trim())
      .find(one => one !== '') ?? ''

  if (line === '') {
    return '(no report)'
  }

  return line.length > NOTE_LINE_MAX ? `${line.slice(0, NOTE_LINE_MAX - 1)}…` : line
}

async function clearDropped($: EngineInterface, at: number) {
  await update($, dropped, now => (now !== null && now.at === at ? null : now))
}

// Pins a finished friend's note; past five, the oldest falls off the board.
async function pin($: EngineInterface, id: string, answer: string) {
  const friend = (await read($, friends)).find(one => one.id === id)
  const at = await $.clock.now()
  const note: Note = { color: friend?.color ?? FRIEND_COLORS[0] ?? '#7fb3d5', kind: friend?.kind, line: firstLine(answer), at }
  let fell: Note | undefined
  const next = await update($, notes, now => {
    const all = [...now, note]
    fell = all.length > MAX_NOTES ? all[0] : undefined

    return all.slice(-MAX_NOTES)
  })
  await $.store.set('notes', next)
  await tally($, day => ({ ...day, friends: [...day.friends, { kind: note.kind, line: note.line }] }))

  if (fell !== undefined) {
    const falling: Note = { ...fell, at }
    await update($, dropped, () => falling)
    $.clock.after(FALL_MS, () => void clearDropped($, at))
  }
}

async function leave($: EngineInterface, id: string) {
  const at = await $.clock.now()
  let dur = 0
  await update($, friends, now =>
    now.map((one, i) => {
      if (one.id !== id) {
        return one
      }

      const here = whereAt({ from: one.from, to: friendSpot(one.activity, i), at: one.at, dur: one.dur }, at)
      dur = walkSeconds(here, friendSpot('door', i), roomWidth)

      return { ...one, isLeaving: true, from: here, at, dur }
    }),
  )
  $.clock.after(dur * 1000 + LINGER_MS, () => void goHome($, id, at))
}

function friendActivityOf(tool: string): FriendActivity | undefined {
  const kind = ACTIVITIES[tool]

  return kind === 'delegating' ? undefined : kind
}

async function mute($: EngineInterface, value: boolean) {
  await update($, isMuted, () => value)
  await $.store.set('muted', value)
}

// The Debug sweep: the room shows clean and the shown mess is swept away,
// his real count untouched.
async function debugSweep($: EngineInterface, pieces: number) {
  await tweak($, () => ({ mess: 0 }))
  await sweep($, pieces)
}

function openMenu($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Clawd' })
}

function setTab($: EngineInterface, tab: MenuTab) {
  return update($, menuTab, () => tab)
}

function wear($: EngineInterface, outfit: OutfitId | null) {
  return save($, now => ({ ...now, outfit }))
}

async function tweak($: EngineInterface, change: (now: Preview) => Partial<Preview>) {
  await update($, preview, now => ({ ...now, ...change(now) }))
  await note($)
}

async function fit($: EngineInterface, step: number) {
  const next = Math.round(((await read($, cellPx)) + step) * 10) / 10
  await update($, cellPx, () => next)
  await $.store.set('cellPx', next)
}

function cycle<T>(list: readonly T[], now: T, step = 1): T {
  const at = list.indexOf(now)
  const next = list[(at + step + list.length) % list.length]

  return next === undefined ? now : next
}

// What he feels and the tip to show, a Debug feeling winning.
async function reactionOf($: EngineInterface, preview: Feeling | null) {
  if (preview !== null) {
    return { feeling: preview, tip: TIPS[preview], rewrite: preview === 'confused' ? 'Fix [what is broken] in [which file] so [expected behavior]; check by [how to verify].' : null }
  }

  const now = await read($, feeling)

  return { feeling: now?.feeling ?? null, tip: now?.tip ?? null, rewrite: now?.rewrite ?? null }
}

function percentText(meter: Meter | null) {
  return meter === null ? '–' : `${Math.round(meter.percent)}%`
}

async function droppedView($: EngineInterface, isLive: boolean, now: number) {
  const fell = isLive ? await read($, dropped) : null

  return fell === null ? null : { ...fell, age: (now - fell.at) / 1000 }
}

// Everything the band and the menu draw from, with the debug overrides on.
async function sceneOf($: EngineInterface) {
  const now = await $.clock.now()
  const state = await read($, attention)
  const pet = await read($, stats)
  const debug = await read($, preview)
  // He is drawn from the walk he is on. A state write lands a moment before
  // its walk is recorded; drawing the new mood in that gap put him at the
  // new spot unwalked, then sent him back to walk there.
  const last = await read($, shown)
  const mood = last.mood
  const framed = debug.polaroids === null ? await read($, commits) : SAMPLE_COMMITS.slice(0, debug.polaroids)
  const hasPartyHat = debug.partyHat ?? now < (await read($, partyUntil))
  const crowd: FriendView[] =
    debug.friends === null
      ? (await read($, friends))
          .filter(one => !one.isLeaving || now - one.at < one.dur * 1000 + LINGER_MS)
          .map(one => ({
            color: one.color,
            activity: one.activity,
            from: isUnderway(one, now) ? one.from : null,
            elapsed: (now - one.at) / 1000,
            dur: one.dur,
            isLeaving: one.isLeaving,
            kind: one.kind,
            task: one.task,
          }))
      : DEBUG_FRIENDS.slice(0, debug.friends).map((kind, i) => ({
          color: FRIEND_COLORS[i] ?? '#7fb3d5',
          activity: kind,
          from: null,
          elapsed: 0,
          dur: 0,
          isLeaving: false,
          kind: DEBUG_KINDS[i],
          task: DEBUG_TASKS[i],
        }))

  return {
    attention: state,
    pet,
    debug,
    scene: {
      name: pet.name,
      status: LINES[mood],
      mood,
      from: isUnderway(last, now) ? last.from : null,
      elapsed: (now - last.at) / 1000,
      dur: last.dur,
      width: roomWidth,
      outfit: pet.outfit,
      level: debug.level ?? (await levelNow($, pet)),
      turns: pet.turns,
      phase: debug.phase ?? (await read($, phase)),
      weather: debug.weather ?? WEATHER[state ?? 'none'],
      season: debug.season ?? (await read($, season)),
      ...(await reactionOf($, debug.feeling)),
      usage: await read($, usage),
      rank: rankOf((await read($, craft)).xp).name,
      friends: crowd,
      commits: framed,
      hasPartyHat,
      mess: debug.mess ?? messOf(await read($, dirty)),
      notes: (debug.notes === null ? await read($, notes) : SAMPLE_NOTES.slice(0, debug.notes)).map(one => ({
        ...one,
        age: debug.notes === null ? (now - one.at) / 1000 : 99,
      })),
      dropped: await droppedView($, debug.notes === null, now),
      sweeping: await read($, sweeping),
      body: BODIES[debug.wellbeing ?? wellbeingOf(await needsNow($))],
      parcel: parcelOf(await read($, quest), now),
    },
  }
}

// Today's package as the room shows it: by the door until opened, then
// opening for a moment, then gone.
function parcelOf(today: Quest | null, now: number): 'waiting' | 'opening' | null {
  if (today === null || today.day !== dayKey(now)) {
    return null
  }

  return today.openedAt === null ? 'waiting' : now - today.openedAt < UNBOX_MS ? 'opening' : null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const kept = (await $.store.get('stats')) as Partial<Stats> | undefined
    // Stats from before growth XP keep the level they had as a floor.
    const migrated = kept === undefined || kept.xp !== undefined ? kept : { ...kept, xp: 0, levelFloor: turnLevel(kept.turns ?? 0) }
    await update($, stats, () => ({ ...DEFAULT_STATS, lastTidyTurn: kept?.turns ?? 0, ...migrated }))

    if (migrated !== kept) {
      await $.store.set('stats', await read($, stats))
    }

    const floorOn = await $.store.get('useFloor')
    await update($, useFloor, () => floorOn !== false)
    const startedAt = await $.clock.now()
    const keptNeeds = (await $.store.get('needs')) as Partial<{ clearAt: number; newAt: number; unchecked: number }> | null | undefined
    await update($, needInputs, () => ({ clearAt: keptNeeds?.clearAt ?? startedAt, newAt: keptNeeds?.newAt ?? startedAt, unchecked: keptNeeds?.unchecked ?? 0 }))
    const keptQuest = await $.store.get('quest')
    await update($, quest, () => (keptQuest !== null && typeof keptQuest === 'object' ? (keptQuest as Quest) : null))
    await update($, isMuted, () => false)
    const muted = await $.store.get('muted')

    if (muted === true) {
      await update($, isMuted, () => true)
    }

    const framed2 = await $.store.get('commits')

    if (Array.isArray(framed2)) {
      await update($, commits, () => (framed2 as Commit[]).slice(0, MAX_COMMITS))
    }

    const skill = (await $.store.get('craft')) as Partial<Craft> | undefined
    // Left by a band-draw log that has since been removed.
    await $.store.delete('bandLog')
    const pages = await $.store.get('days')

    if (pages !== null && typeof pages === 'object' && !Array.isArray(pages)) {
      await update($, days, () => pages as Record<string, Day>)
    }

    const drawn = await $.store.get('drawing')
    await update($, drawing, () => (typeof drawn === 'string' && (DRAWINGS as string[]).includes(drawn) ? (drawn as Drawing) : 'images'))
    const tipsOn = await $.store.get('wantsTips')
    await update($, wantsTips, () => tipsOn !== false)
    await loadSkills($)
    workdir = e.cwd
    await countDirty($)
    const passes = await $.store.get('practiced')
    await update($, practiced, () => (passes !== null && typeof passes === 'object' && !Array.isArray(passes) ? (passes as Record<string, number>) : {}))
    const rewrites = await $.store.get('rewrites')
    await update($, wantsRewrites, () => rewrites === true)

    if (skill !== undefined) {
      await update($, craft, () => ({ ...NO_CRAFT, ...skill, habits: { ...NO_CRAFT.habits, ...skill.habits } }))
    }

    await update($, feeling, () => null)
    await firstReading($)
    const pinned = await $.store.get('notes')

    if (Array.isArray(pinned)) {
      await update($, notes, () => (pinned as Note[]).slice(-MAX_NOTES))
    }

    await update($, dropped, () => null)
    const party = await $.store.get('partyUntil')

    if (typeof party === 'number') {
      await update($, partyUntil, () => party)
    }

    const width = await $.store.get('cellPx')

    if (typeof width === 'number') {
      await update($, cellPx, () => width)
    }

    await $.command.register({
      name: 'pet',
      description: 'Your Claude pet: /pet, /pet menu, /pet name <name>, /pet rewrites on|off, /pet mute, /pet unmute, /pet hide, /pet show',
      argumentHint: '[menu | name <name> | rewrites on|off | mute | unmute | hide | show]',
    })
    // A reload runs this again with every timer gone: drop what they would end.
    await update($, isCelebrating, () => false)
    await update($, sweeping, () => 0)
    await update($, friends, now => now.filter(one => !one.isLeaving))
    await tick($)
    $.clock.every(PHASE_MS, () => void tick($))
    await adoptLimits($)
    $.clock.every(LIMITS_MS, () => void adoptLimits($))

    if ((await read($, attention)) === 'waiting') {
      keepKnocking($)
    }
    await rest($)

    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const [verb = '', ...words] = e.args.trim().split(/\s+/)

    switch (verb.toLowerCase()) {
      case 'tips': {
        const value = words[0]?.toLowerCase()

        if (value !== 'on' && value !== 'off') {
          return { text: `Tips are ${(await read($, wantsTips)) ? 'on' : 'off'}: at most one every 2 hours. /pet tips on|off` }
        }

        await setTips($, value === 'on')

        return { text: value === 'on' ? 'Tips are on: at most one every 2 hours, above the room.' : 'Tips are off.' }
      }
      case 'rewrites': {
        const value = words[0]?.toLowerCase()

        if (value !== 'on' && value !== 'off') {
          return { text: `Suggested rewrites are ${(await read($, wantsRewrites)) ? 'on' : 'off'}. /pet rewrites on|off` }
        }

        await setRewrites($, value === 'on')

        return { text: value === 'on' ? 'Vague prompts now get a clearer rewrite from Haiku (uses a few tokens each).' : 'Suggested rewrites are off.' }
      }
      case 'mute':
        await mute($, true)

        return { text: 'Clawd is muted. /pet unmute turns his sounds back on.' }
      case 'unmute':
        await mute($, false)

        return { text: 'Clawd’s sounds are on.' }
      case 'menu':
        await openMenu($)

        return { text: 'Opened the Clawd menu.' }
      case 'hide':
        await update($, isHidden, () => true)

        return { text: 'Pet hidden. /pet show brings it back.' }
      case 'show':
        await update($, isHidden, () => false)

        return { text: 'Pet is back.' }
      case 'name': {
        const name = words.join(' ').slice(0, 24)

        if (name === '') {
          return { text: 'Usage: /pet name <name>' }
        }

        await save($, now => ({ ...now, name }))

        return { text: `Your pet is now called ${name}.` }
      }
      default: {
        const now = await read($, stats)
        await update($, isHidden, () => false)

        const skill = rankOf((await read($, craft)).xp)

        return {
          text: `${now.name}: level ${await levelNow($, now)}, ${Math.round(now.xp)} XP, ${now.turns} turns together. Your prompt craft: ${skill.name}.`,
        }
      }
    }
  })

  on('session.measure', async ($, e, next) => {
    await measure($, e)

    return next(e)
  })

  // A subagent starting: its type and task become its friend's name tag.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)

    if (started.agentId !== undefined) {
      await arrive($, started.agentId, { kind: e.subagentType, task: e.description })
      await grow($, 'habit', 1)
      await tried($)
      await finishQuest($, 'subagent')
    }

    return started
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    // tool.call already counts the ask of a tool that always stops for the person.
    if (!PERSON_TOOLS.has(e.tool_name)) {
      await ask($, e.tool_name)
    }


    return next(e)
  })

  // A second signal for permission prompts, for when another plugin answers
  // PermissionRequest before this one hears it.
  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt') {
      await set($, 'waiting')
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Skill' && typeof e.skill === 'string') {
      await usedSkill($, e.skill)
    }

    if (PERSON_TOOLS.has(e.tool)) {
      await ask($, e.tool)
    }

    if (e.agentId !== undefined) {
      await arrive($, e.agentId)
      const kind = friendActivityOf(e.tool)

      if (kind !== undefined) {
        await shift($, e.agentId, kind)
      }
    } else if ((await read($, activity)) !== null) {
      // He stays at the last thing he did until the next tool, so quick
      // calls do not send him pacing back and forth.
      await busy($, ACTIVITIES[e.tool] ?? 'thinking')
    }

    try {
      const ran = await next(e)
      await cheer($, e.tool, e as unknown as Record<string, unknown>, ran)

      if (CHANGING_TOOLS.has(e.tool)) {
        recountSoon($)
      }

      // An edit nothing has checked yet drains Confidence.
      if (EDIT_TOOLS.has(e.tool) && ran.isError !== true && ran.deny === undefined) {
        await touchNeeds($, inputs => ({ ...inputs, unchecked: Math.min(10, inputs.unchecked + 1) }))
      }

      return ran
    } finally {
      await settle($, e.tool, e.agentId === undefined)
    }
  })

  on('prompt.submit', async ($, e, next) => {
    // Only what the person typed is coached, a slash command aside: at the
    // terminal, over Remote Control, or in the desktop app (an SDK host).
    const isPerson = e.isMeta !== true && PERSON_ORIGINS.has(e.origin.kind)

    if (isPerson && e.command === undefined) {
      await coach($, e.text)
    }

    // A new turn earns XP when it finishes, unless it began with a reply
    // like "yes" or "go on".
    if (e.turnId === undefined && e.isMeta !== true) {
      isTurnWorthXp = isPerson && (e.command !== undefined || !readPrompt(e.text).isReply)
    }

    // A slash command that is one of your skills counts as using it.
    if (e.command !== undefined && (await read($, skills)).includes(e.command.name)) {
      await usedSkill($, e.command.name)
    }

    // Typed or delivered into a running turn: the turn is not over.
    if (e.turnId !== undefined || e.isMeta === true) {
      return next(e)
    }

    await clear($)
    // A command that starts no turn still leaves him to nap later.
    await rest($)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      asked.clear()
      await update($, attention, () => null)
      await wake($)
      await busy($, 'thinking')
    } else {
      await arrive($, e.agentId)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      await pin($, e.agentId, e.answer)
      await leave($, e.agentId)

      return next(e)
    }

    asked.clear()
    await update($, activity, () => null)

    if (e.isAborted) {
      redirects += 1
      await tally($, day => ({ ...day, interrupts: day.interrupts + 1 }))

      if (redirects >= 2) {
        await feel($, { feeling: 'dizzy', tip: TIPS.dizzy, at: await $.clock.now() })
      }
    }

    const shown = await read($, feeling)

    if (shown !== null) {
      calming?.cancel()
      calming = $.clock.after(FEELING_MS, () => void calmDown($, shown.at))
    }

    // An interrupt means the person is already here.
    await set($, e.isAborted ? null : e.reason === 'answer' ? 'done' : 'error')

    if (e.reason === 'answer') {
      await save($, now => ({ ...now, turns: now.turns + 1 }))
      await tally($, day => ({ ...day, turns: day.turns + 1 }))

      if (isTurnWorthXp) {
        await grow($, 'turn', 1)
      }
    }

    isTurnWorthXp = false

    await rest($)
    await maybeTip($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (await read($, isHidden)) {
      return next(e)
    }

    // While the app holds the band (a survey, its next-step box), its own
    // drawing stays on top and the room goes under it rather than away.
    const held = e.props.hasSurvey ? await next(e) : null

    roomWidth = Math.max(MIN_WIDTH, Math.floor((e.props.bodyColumns - 2) * (await read($, cellPx))))
    const { attention: now, pet, scene } = await sceneOf($)
    const background = now === null ? undefined : COLORS[now]

    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // Today's tip, just above the room, until dismissed: a small card with
    // its topic over the text, and Teach me and ✕ on the right. The
    // terminal skips the border, which would cost two rows.
    const shownTip = (await read($, wantsTips)) ? await read($, tip) : null
    const isTerminal = e.surface === 'terminal'
    const tipRow =
      shownTip === null ? null : (
        <Box width="100%" paddingX={1}>
          <Box
            width="100%"
            flexDirection="row"
            alignItems="center"
            gap={2}
            paddingX={isTerminal ? 0 : 1}
            borderStyle={isTerminal ? undefined : 'round'}
            borderColor={isTerminal ? undefined : 'subtle'}
          >
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text size="caption" weight="semibold" color="claude">
                {`TIP · ${(shownTip.topic ?? lessonOf(shownTip.id).topic).toUpperCase()}`}
              </Text>
              <Text size="footnote">{currentText(shownTip.id, shownTip.text)}</Text>
            </Box>
            <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
              <Button key="tip-teach" variant="secondary" label="Teach me" onPress={() => teach($, shownTip)} />
              <Button key="tip-dismiss" role="dismiss" plain dimColor label="✕" onPress={() => dismissTip($)} />
            </Box>
          </Box>
        </Box>
      )
    // While he is nudging you about a prompt, a lesson on it is a press away.
    const isNudging = scene.feeling !== null && NUDGE_LESSONS[scene.feeling] !== undefined
    const buttons = [
      <Button key="menu" plain label="☰ Menu" onPress={() => openMenu($)} />,
      ...(isNudging ? [<Button key="nudge-teach" plain label="? Teach me" onPress={() => teachFromNudge($)} />] : []),
    ]
    // The bottom bar: the menu first, then his level, your rank, the
    // uncommitted files and today's quest; the usage meters on the right.
    const files = await read($, dirty)
    const today = await read($, quest)
    const questLine =
      today === null || today.openedAt === null || today.day !== dayKey(await $.clock.now())
        ? ''
        : today.doneAt === null
          ? ` · Quest: ${questText(today.id)}`
          : ' · Quest done ✓'
    const metrics = (
      <Box width="100%" paddingX={1} flexDirection="row" flexWrap="wrap" justifyContent="space-between" alignItems="center" columnGap={2}>
        <Box flexDirection="row" alignItems="center" gap={1} flexShrink={1}>
          {buttons}
          <Text size="footnote" dimColor>
            {`Lv ${scene.level} · ${scene.turns} turns · you: ${scene.rank}${files > 0 ? ` · ${files} uncommitted file${files === 1 ? '' : 's'}` : ''}${questLine}`}
          </Text>
        </Box>
        <Box flexDirection="row" gap={2}>
          {meterReadings(scene.usage).map(one => (
            <Text key={`meter-${one.label}`} size="footnote">
              <Text dimColor>{one.label} </Text>
              <Text color={METER_COLORS[one.level]}>{one.text}</Text>
            </Text>
          ))}
        </Box>
      </Box>
    )
    // Between the room and the bottom bar: his needs, each with a tooltip.
    const unchecked = (await read($, needInputs)).unchecked
    const needs = await needsNow($)
    const needViews = NEED_IDS.map(id => ({ name: NEED_NAMES[id], value: needs[id], tip: needTip(id, needs[id], { dirty: files, unchecked }) }))
    // Today's package by the door takes a press to open, as an Svg takes none.
    const parcelButton =
      scene.parcel === 'waiting' ? (
        <Box position="absolute" bottom={2} left={Math.max(0, Math.round(((e.props.bodyColumns - 2) * PARCEL_PCT) / 100) - 3)}>
          <Button key="open-parcel" plain label="📦 Open" onPress={() => openParcel($)} />
        </Box>
      ) : null

    // The terminal's table answers for Svg but draws nothing of it.
    if (e.surface === 'terminal' || !('Svg' in elements)) {
      const color = background === undefined ? undefined : 'inverseText'

      return (
        <Box width="100%" flexDirection="column">
          {held}
          {tipRow}
        <Box width="100%" paddingX={1} flexDirection="row" alignItems="center" gap={1} backgroundColor={background}>
          <Text color={color}>{FACES[scene.mood]}</Text>
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color={color}>
              {pet.name}
            </Text>
            <Text color={color}>{LINES[scene.mood]}</Text>
            {scene.tip !== null && <Text italic>💡 {scene.tip}</Text>}
            {scene.rewrite !== null && <Text dimColor>✍ Try: {scene.rewrite}</Text>}
            <Text dimColor>
              Lv {scene.level} · {scene.turns} turns · you: {scene.rank} · ctx {percentText(scene.usage.context)} · 5h{' '}
              {percentText(scene.usage.session)} · wk {percentText(scene.usage.week)}
            </Text>
            <Text dimColor>{needViews.map(one => `${one.name} ${one.value}%`).join(' · ')}</Text>
          </Box>
          {buttons}
          {scene.parcel === 'waiting' && <Button key="open-parcel" plain label="📦 Open today's package" onPress={() => openParcel($)} />}
        </Box>
        </Box>
      )
    }

    // The room fills the band. An Svg is sized in pixels and the band in
    // columns, less the padding's one on each side.
    const width = roomWidth
    // His name and status are no longer drawn; they stay in the alt text.
    const alt = `${pet.name} in his room: ${scene.status}`

    const mode = await read($, drawing)

    // Stacked, a change of state redraws only the layer it touches. As
    // images (an Svg without isInteractive) a new picture replaces the old
    // one without a blank frame in between; the tooltips ride on an
    // invisible interactive layer on top, whose reloads show nothing.
    if (mode !== 'single') {
      const isImage = mode === 'images'
      const drawn = layers(scene, isImage)

      return (
        <Box width="100%" flexDirection="column">
          {held}
          {tipRow}
          <Box width="100%" paddingX={1} backgroundColor={background}>
            <Box position="relative" width="100%">
              <elements.Svg source={drawn.room} alt={alt} width={width} height={HEIGHT} isInteractive={!isImage} />
              <Box position="absolute" top={0} left={0}>
                <elements.Svg source={drawn.actors} alt={LINES[scene.mood]} width={width} height={HEIGHT} isInteractive={!isImage} />
              </Box>
              {isImage && (
                <Box position="absolute" top={0} left={0}>
                  <elements.Svg source={drawn.hover} alt="" width={width} height={HEIGHT} isInteractive />
                </Box>
              )}
              {parcelButton}
            </Box>
          </Box>
          <Box width="100%" paddingX={1}>
            <Box position="relative" width="100%">
              <elements.Svg source={needsRow(needViews, !isImage)} alt={needViews.map(one => `${one.name} ${one.value}%`).join(', ')} width={width} height={NEEDS_HEIGHT} isInteractive={!isImage} />
              {isImage && (
                <Box position="absolute" top={0} left={0}>
                  <elements.Svg source={needsHover(needViews)} alt="" width={width} height={NEEDS_HEIGHT} isInteractive />
                </Box>
              )}
            </Box>
          </Box>
          {metrics}
        </Box>
      )
    }

    return (
      <Box width="100%" flexDirection="column">
        {held}
        {tipRow}
        <Box width="100%" paddingX={1} backgroundColor={background}>
          <Box position="relative" width="100%">
            <elements.Svg source={room(scene)} alt={alt} width={width} height={HEIGHT} isInteractive />
            {parcelButton}
          </Box>
        </Box>
        <Box width="100%" paddingX={1}>
          <elements.Svg source={needsRow(needViews, true)} alt={needViews.map(one => `${one.name} ${one.value}%`).join(', ')} width={width} height={NEEDS_HEIGHT} isInteractive />
        </Box>
        {metrics}
      </Box>
    )
  })

  // The "Teach me" chat: the lesson behind the tip, then each exchange, then
  // a field to paste a request or ask a question.
  on('ui.render', { component: 'Pane', requestId: TEACH }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Markdown, Text } = elements
    const now = await read($, teaching)

    if (now === null) {
      return <Text dimColor>Press Teach me on a tip to start a lesson.</Text>
    }

    const lesson = lessonById(now.lesson)
    const passes = (await read($, practiced))[now.lesson] ?? 0
    const isThinking = now.turns.some(one => one.reply === null)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text size="caption" weight="semibold" color="claude">
            {`LESSON · ${now.topic.toUpperCase()}${passes > 0 ? ` · PRACTICED ${passes}×` : ''}`}
          </Text>
          <Text size="heading" weight="semibold">
            {lesson.title}
          </Text>
          {now.intro !== '' && <Text dimColor>{now.intro}</Text>}
        </Box>
        <Markdown text={lessonText(lesson)} />
        {now.turns.map((one, at) => (
          <Box key={`turn-${at}`} flexDirection="column" paddingX={1} borderStyle="round" borderColor="subtle">
            <Text size="caption" weight="semibold" dimColor>
              YOU
            </Text>
            <Text>{one.ask}</Text>
            <Text size="caption" weight="semibold" color={one.isPass === true ? 'success' : 'claude'}>
              {one.isPass === true ? 'CLAWD · PASSED, READY TO SEND' : 'CLAWD'}
            </Text>
            {one.reply === null ? (
              <Text dimColor italic>
                Thinking it over...
              </Text>
            ) : (
              <Markdown text={one.reply} />
            )}
          </Box>
        ))}
        {/* The mobile app draws no field yet: the lesson and examples only. */}
        {'Input' in elements && (
          <elements.Input
            key={`teach-input-${now.turns.length}`}
            placeholder={isThinking ? 'Clawd is answering...' : 'Paste a request you want to send, or ask a question'}
            submitLabel="ask"
            rows={3}
            autoFocus
            onSubmit={value => askLesson($, value)}
          />
        )}
        <Box flexDirection="row" gap={1}>
          <Button key="teach-example" variant="secondary" label="Another example" onPress={() => askLesson($, '', true)} />
          <Button key="teach-done" dimColor label="Done" onPress={() => $.ui.close({ id: TEACH })} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const tab = await read($, menuTab)
    const { pet, debug, scene } = await sceneOf($)
    const realLevel = await levelNow($, pet)
    const muted = await read($, isMuted)

    // A row cannot scroll sideways, so in a narrow pane the tabs wrap onto a
    // second line rather than run off the edge; the sound toggle comes last.
    const tabs = (
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {(['docs', 'coach', 'journal', 'wardrobe', 'debug'] as const).map(one => (
          <Button
            key={`tab-${one}`}
            label={TAB_NAMES[one]}
            variant={one === tab ? 'primary' : 'secondary'}
            onPress={() => setTab($, one)}
          />
        ))}
        <Button key="sound" plain label={muted ? '🔕 Sound off' : '🔔 Sound on'} onPress={() => mute($, !muted)} />
      </Box>
    )

    if (tab === 'journal') {
      const today = dayKey(await $.clock.now())

      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          <Markdown text={journal(prune(await read($, days), today), today)} />
        </Box>
      )
    }

    if (tab === 'coach') {
      const skill = await read($, craft)
      const rank = rankOf(skill.xp)
      const meters = await read($, usage)
      const clarity = skill.prompts === 0 ? null : Math.round(((skill.prompts - skill.vague) / skill.prompts) * 100)
      const working = BADGES.filter(badge => skill.habits[badge.habit] < badge.goal).sort(
        (a, b) => skill.habits[a.habit] / a.goal - skill.habits[b.habit] / b.goal,
      )[0]
      const growth = progressOf(pet.xp, await milestonesOf($))
      const shownLevel = await levelNow($, pet)
      const isFloored = shownLevel > growth.level
      const today = await read($, quest)
      const isToday = today !== null && today.day === dayKey(await $.clock.now())
      const lines = [
        `## Next level`,
        '',
        `${pet.name} is level ${shownLevel} (${growth.stage}).` +
          (isFloored ? ` That's his level from before XP, kept as a floor; XP alone has him at level ${growth.level}.` : ''),
        '',
        growth.blockedBy !== null
          ? `He has the XP for level ${growth.level + 1}. To unlock it: ${growth.blockedBy.toLowerCase()}.`
          : `${Math.round(growth.into)} of ${growth.step} XP to level ${growth.level + 1}.`,
        '',
        ...(growth.nextGate === null || growth.blockedBy !== null
          ? []
          : [`Level ${growth.nextGate.level} needs a milestone too: ${growth.nextGate.need.toLowerCase()} (${growth.nextGate.isMet ? 'done' : 'not yet'}).`, '']),
        'What earns XP at this stage:',
        '',
        ...earnsAt(growth.level).map(one => `- ${one}`),
        `- Today's quest (${QUEST_XP})`,
        '',
        'Replies like "yes" or "go on" earn nothing, and XP is never taken away. While every need is above half, XP earns 1.5×.',
        '',
        `**Today's quest:** ${!isToday ? 'on its way.' : today.openedAt === null ? 'a package is waiting by the door. Open it.' : `${questText(today.id)}${today.doneAt === null ? '' : ' ✓ done'}.`}`,
        '',
        `## You: ${rank.name}`,
        '',
        rank.toNext > 0
          ? `${skill.xp} XP, ${rank.toNext} to ${RANKS[rank.index + 1] ?? ''}. Clear prompts earn XP; vague ones cost a little.`
          : `${skill.xp} XP: the top rank.`,
        '',
        clarity === null ? 'No prompts read yet.' : `${skill.prompts} prompts read, ${clarity}% of them clear.`,
        '',
        '## Badges',
        '',
        '| Badge | When you | Progress |',
        '| --- | --- | --- |',
        ...BADGES.map(badge => {
          const count = skill.habits[badge.habit]

          return `| ${count >= badge.goal ? '🏅 ' : ''}${badge.name} | ${badge.about} | ${Math.min(count, badge.goal)}/${badge.goal} |`
        }),
        '',
        working === undefined
          ? 'Every badge earned. Clawd is impressed.'
          : `**Work on next:** ${working.name}. Next prompt, ${working.about.replace(/^(\w+)/, word => ({ named: 'name', said: 'say', asked: 'ask for', gave: 'give' })[word] ?? word)}.`,
        '',
        '## Recent tips',
        '',
        ...(skill.tips.length === 0 ? ['None yet.'] : skill.tips.map(one => `- ${one.tip}`)),
        '',
        '## Usage',
        '',
        `- Context: ${percentText(meters.context)}`,
        `- Session limit (5h): ${percentText(meters.session)}`,
        `- Weekly limit: ${percentText(meters.week)}`,
      ]

      const wants = await read($, wantsRewrites)
      const logged = await $.store.get('tipLog')
      const recentTips = (Array.isArray(logged) ? (logged as ShownTip[]) : []).slice(-5).reverse()
      const passes = await read($, practiced)
      const empty = wants ? 'None yet: the next vague prompt gets one.' : 'Off. Turn them on above to see a clearer version of each vague prompt.'

      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          <Button
            key="rewrites"
            label={wants ? '✍ Suggested rewrites: on (uses Haiku)' : '✍ Suggested rewrites: off'}
            onPress={() => setRewrites($, !wants)}
          />
          <Button
            key="tips"
            label={(await read($, wantsTips)) ? '💡 Tips through the day: on (one per 2 hours at most)' : '💡 Tips through the day: off'}
            onPress={async () => setTips($, !(await read($, wantsTips)))}
          />
          <Markdown text={lines.join('\n')} />
          <Text bold>Recent tips</Text>
          {recentTips.length === 0 && <Text dimColor>None yet: the first comes within a couple of hours of using Claude.</Text>}
          {recentTips.map(one => (
            <Text dimColor>· {currentText(one.id, one.text)}</Text>
          ))}
          <Text bold>Lessons</Text>
          <Text dimColor>Each opens in a pane with examples and a chat. A request Clawd passes as it is counts as practice, and that topic's tips come round less often.</Text>
          {(Object.keys(LESSONS) as LessonId[]).map(id => (
            <Button
              key={`lesson-${id}`}
              plain
              dimColor={(passes[id] ?? 0) === 0}
              label={`${(passes[id] ?? 0) > 0 ? '✓' : '○'} ${LESSONS[id].title}${(passes[id] ?? 0) > 0 ? ` · practiced ${passes[id]}×` : ''}`}
              onPress={() => openLesson($, id, topicOf(id), '')}
            />
          ))}
          <Text bold>Starter templates</Text>
          <Text dimColor>A shape for the usual kinds of work: fill in the [placeholders] and send it.</Text>
          {TEMPLATES.map(one => (
            <Box flexDirection="column">
              <Text>
                <Text bold>{one.name}:</Text> {one.text}
              </Text>
              <Button key={`use-template-${one.id}`} label={`Use ${one.name}`} onPress={press => useDraft($, one.text, 'template', press.surface)} />
            </Box>
          ))}
          <Text bold>Suggested rewrites</Text>
          {skill.rewrites.length === 0 && <Text dimColor>{empty}</Text>}
          {skill.rewrites.map((one, i) => (
            <Box flexDirection="column">
              <Text dimColor>You wrote: {one.prompt.replace(/\n+/g, ' ')}</Text>
              <Text>Try: {one.rewrite}</Text>
              <Button key={`use-rewrite-${i}`} label="Use this rewrite" onPress={press => useDraft($, one.rewrite, 'rewrite', press.surface)} />
            </Box>
          ))}
        </Box>
      )
    }

    if (tab === 'wardrobe') {
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          <Text>
            {pet.name} is level {scene.level}. Outfits unlock as he levels up.
          </Text>
          <Button key="wear-none" plain label={`Nothing${pet.outfit === null ? ' ✓' : ''}`} onPress={() => wear($, null)} />
          {OUTFITS.map(outfit => {
            // The real level: a debug level must not dress him for keeps.
            const isOpen = isOutfitUnlocked(outfit.id, realLevel)

            return (
              <Button
                key={`wear-${outfit.id}`}
                plain
                dimColor={!isOpen}
                label={`${outfit.name}${isOpen ? '' : ` (locked until Lv ${outfit.level})`}${pet.outfit === outfit.id ? ' ✓' : ''}`}
                onPress={() => (isOpen ? wear($, outfit.id) : undefined)}
              />
            )
          })}
        </Box>
      )
    }

    if (tab === 'debug') {
      const auto = (value: unknown) => (value === null ? 'auto' : String(value))

      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          <Text dimColor>Overrides for testing; his real stats are untouched. Each mood change walks him to its spot.</Text>
          <Box flexDirection="row" gap={1} alignItems="center">
            <Button key="mood-prev" label="◀" onPress={() => tweak($, now => ({ mood: cycle(MOODS, now.mood ?? scene.mood, -1) }))} />
            <Text>Mood: {scene.mood}</Text>
            <Button key="mood-next" label="▶" onPress={() => tweak($, now => ({ mood: cycle(MOODS, now.mood ?? scene.mood) }))} />
          </Box>
          <Box flexDirection="row" gap={1} alignItems="center">
            <Button key="level-down" label="−" onPress={() => tweak($, () => ({ level: Math.max(1, scene.level - 1) }))} />
            <Text>Level: {scene.level}</Text>
            <Button key="level-up" label="+" onPress={() => tweak($, () => ({ level: Math.min(MAX_LEVEL, scene.level + 1) }))} />
          </Box>
          <Button key="weather" label={`Weather: ${auto(debug.weather)}`} onPress={() => tweak($, now => ({ weather: cycle(WEATHERS, now.weather) }))} />
          <Button key="drawing" label={`Drawing: ${DRAWING_NAMES[await read($, drawing)]}`} onPress={() => nextDrawing($)} />
          <Button key="feeling" label={`Feeling: ${auto(debug.feeling)}`} onPress={() => tweak($, now => ({ feeling: cycle(FEELING_CHOICES, now.feeling) }))} />
          <Button key="season" label={`Season: ${auto(debug.season)}`} onPress={() => tweak($, now => ({ season: cycle(SEASON_CHOICES, now.season) }))} />
          <Button key="phase" label={`Time of day: ${auto(debug.phase)}`} onPress={() => tweak($, now => ({ phase: cycle(PHASES, now.phase) }))} />
          <Button key="celebrate" label="🎉 Celebrate (as if tests passed)" onPress={() => celebrate($)} />
          <Button key="polaroids" label={`Polaroids: ${auto(debug.polaroids)}`} onPress={() => tweak($, now => ({ polaroids: cycle(POLAROID_COUNTS, now.polaroids) }))} />
          <Button key="party-hat" label={`Party hat: ${debug.partyHat === null ? 'auto' : debug.partyHat ? 'on' : 'off'}`} onPress={() => tweak($, now => ({ partyHat: cycle(PARTY_HATS, now.partyHat) }))} />
          <Button key="notes" label={`Sticky notes: ${auto(debug.notes)}`} onPress={() => tweak($, now => ({ notes: cycle(NOTE_COUNTS, now.notes) }))} />
          <Button key="mess" label={`Mess: ${auto(debug.mess)}`} onPress={() => tweak($, now => ({ mess: cycle(MESS_COUNTS, now.mess) }))} />
          <Button key="sweep" label="🧹 Sweep (as if committed)" onPress={() => debugSweep($, scene.mess)} />
          <Box flexDirection="row" gap={1}>
            <Button key="hear-knock" label="✊ Hear the knock" onPress={() => sound($, 'sounds/knock.wav')} />
          </Box>
          <Button key="friends" label={`Friends: ${auto(debug.friends)}`} onPress={() => tweak($, now => ({ friends: cycle(FRIEND_COUNTS, now.friends) }))} />
          <Box flexDirection="row" gap={1} alignItems="center">
            <Button key="fit-down" label="−" onPress={() => fit($, -0.2)} />
            <Text>Room width: {(await read($, cellPx)).toFixed(1)}px per column</Text>
            <Button key="fit-up" label="+" onPress={() => fit($, 0.2)} />
          </Box>
          <Text dimColor>Widen until the room meets the band's right edge; narrow if it overflows. Kept across sessions.</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            <Button key="wellbeing" label={`Needs color: ${auto(debug.wellbeing)}`} onPress={() => tweak($, now => ({ wellbeing: cycle(WELLBEING_CHOICES, now.wellbeing) }))} />
            <Button key="floor" label={(await read($, useFloor)) ? 'Level floor: on (old level kept)' : 'Level floor: off (XP only)'} onPress={() => toggleFloor($)} />
            <Button key="redeliver" label="📦 Deliver a new package" onPress={() => redeliver($)} />
          </Box>
          <Button key="reset" variant="primary" label="Reset to the session" onPress={() => tweak($, () => NO_PREVIEW)} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {tabs}
        <Markdown text={docs(scene.level)} />
      </Box>
    )
  })
}
