export type Mood =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'running'
  | 'searching'
  | 'delegating'
  | 'waiting'
  | 'done'
  | 'error'
  | 'sleepy'
  | 'celebrating'
  | 'tidying'

export type Phase = 'dawn' | 'day' | 'dusk' | 'night'
export type Weather = 'clear' | 'rain' | 'storm'
// The room's decor for the time of year, from the real date.
export type Season = 'winter' | 'valentine' | 'spring' | 'summer' | 'autumn' | 'halloween' | 'christmas'
export type OutfitId = 'beanie' | 'bowtie' | 'shades' | 'wizard' | 'crown'

// How the way you prompt makes him feel; drawn over his head while he works.
export type Feeling = 'confused' | 'grumpy' | 'overwhelmed' | 'dizzy' | 'proud' | 'inspired' | 'calm' | 'content'

// A prompting habit a prompt showed, counted toward its badge.
export type Habit = 'context' | 'verify' | 'plan' | 'example' | 'why' | 'rewrite' | 'template'

// The person's prompt craft, kept across sessions: XP from how they prompt,
// a count per habit, and the last tips he gave.
export type Craft = {
  xp: number
  prompts: number
  vague: number
  habits: Record<Habit, number>
  tips: { tip: string; at: number }[]
  // Haiku's clearer versions of vague prompts, newest first.
  rewrites: Rewrite[]
}

// A vague prompt and the clearer one Haiku suggested for it.
export type Rewrite = { prompt: string; rewrite: string; at: number }

// One day of the journal, as it happens: what he writes up when the day is
// done. Kept two weeks, by local date (YYYY-MM-DD).
export type Day = {
  turns: number
  commits: { sha: string; message: string }[]
  testsPassed: number
  prs: number
  friends: { kind?: string; line: string }[]
  prompts: number
  clear: number
  tips: Record<string, number>
  badges: string[]
  ranks: string[]
  levels: number[]
  // How the day went, for the tips: turns interrupted, corrections sent,
  // stops for your permission, and the fullest the context got (percent).
  interrupts: number
  corrections: number
  waits: number
  contextPeak: number
  // What the day's prompts were about (debug, review, design…), counted.
  themes: Record<string, number>
}

// What he feels now, the tip that goes with it, and since when.
// prompt: the prompt he reacted to, for a lesson on it.
export type Reaction = { feeling: Feeling; tip: string; at: number; rewrite?: string; prompt?: string }

// One usage meter: how full, and when it resets (rate limits only).
export type Meter = { percent: number; resetsAt?: string }

// The session's context window and the account's limits, as the status line
// has them; null until a reading arrives.
export type Usage = { context: Meter | null; session: Meter | null; week: Meter | null }

// `waiting`: a permission prompt, question or plan approval is open.
// `done`: the main turn ended and the next move is the person's.
// `error`: the main turn ended on an API error or a refusal.
export type Attention = 'waiting' | 'done' | 'error' | null

// What the pet is busy with while a turn runs; null between turns.
export type Activity = 'thinking' | 'reading' | 'writing' | 'running' | 'searching' | 'delegating' | null

// A place in the room: a percentage of its width, plus an offset on the 3x grid.
export type Spot = { pct: number; ux: number; uy: number }

// What a friend (a running subagent) is doing in the room.
export type FriendActivity = 'thinking' | 'reading' | 'writing' | 'running' | 'searching'

// One friend: `from`, `at` and `dur` say where their last walk began, when,
// and how long it takes, so the room draws it while it runs; `isLeaving`
// walks them out the door.
export type Friend = {
  id: string
  color: string
  activity: FriendActivity
  from: Spot | null
  at: number
  dur: number
  isLeaving: boolean
  // From its spawn: the agent type for its name tag, and its task for the
  // tooltip. Absent when the spawn was not heard.
  kind?: string
  task?: string
}

// A sticky note a friend left on the corkboard: the first line of its
// report, in its color.
export type Note = { color: string; kind?: string; line: string; at: number }

// The mood Clawd last showed, and the walk it set off: where from, when, and
// for how many seconds.
export type Shown = { mood: Mood; from: Spot | null; at: number; dur: number }

// A commit framed on his wall: the short sha and its message.
export type Commit = { sha: string; message: string; at: number }

// Kept across sessions in $.store and mirrored here so the band redraws.
// `lastTidyTurn` is the turn count at the last commit: the mess on his floor
// is one piece per finished turn since.
// xp: growth XP, which levels him (hooks/growth.ts); levelFloor: his level
// under the old turns-only rule, kept so no one is demoted.
export type Stats = { name: string; turns: number; outfit: OutfitId | null; lastTidyTurn: number; xp: number; levelFloor?: number }

// What the needs are worked out from (hooks/needs.ts), kept across sessions.
export type NeedInputs = { clearAt: number; newAt: number; unchecked: number }

// Today's quest: which, and when its package was opened and the quest done.
export type Quest = { day: string; id: string; openedAt: number | null; doneAt: number | null }

// Debug overrides from the menu; null follows the session.
export type Preview = {
  mood: Mood | null
  level: number | null
  weather: Weather | null
  phase: Phase | null
  friends: number | null
  polaroids: number | null
  partyHat: boolean | null
  mess: number | null
  notes: number | null
  season: Season | null
  feeling: Feeling | null
  // How his needs look: his color (fine, low, empty).
  wellbeing: 'fine' | 'low' | 'empty' | null
}

// A tip on show above the room: which, what it says, and when it came. The
// topic labels the banner; tips logged before topics existed have none.
export type ShownTip = { id: string; text: string; at: number; topic?: string }

// The "Teach me" chat: its lesson, what opened it (a tip, a nudge) and each
// thing you sent, with Clawd's reply (null while Haiku is writing it) and
// whether it passed: a request that needed nothing more.
export type Teaching = { lesson: string; topic: string; intro: string; turns: { ask: string; reply: string | null; isPass?: boolean }[] }

export type Drawing = 'images' | 'layered' | 'single'

export type MenuTab = 'docs' | 'coach' | 'journal' | 'wardrobe' | 'debug'

declare module 'claude-code' {
  interface PluginState {
    'clawdagotchi': {
      attention: Attention
      activity: Activity
      isAsleep: boolean
      isHidden: boolean
      stats: Stats
      friends: Friend[]
      shown: Shown
      phase: Phase
      season: Season
      feeling: Reaction | null
      craft: Craft
      usage: Usage
      // Whether vague prompts get a suggested rewrite from Haiku (uses tokens).
      wantsRewrites: boolean
      days: Record<string, Day>
      preview: Preview
      menuTab: MenuTab
      cellPx: number
      // How the band draws the room: stacked images under a hover layer (no
      // flicker), stacked interactive frames, or one interactive drawing.
      drawing: Drawing
      // The tip above the room, until dismissed; and whether tips are on.
      tip: ShownTip | null
      wantsTips: boolean
      // The lesson open in the "Teach me" pane, if any.
      teaching: Teaching | null
      // Passes in the "Teach me" chat, by lesson; kept in the store.
      practiced: Record<string, number>
      // The skills this session has, by name, for the skill tips.
      skills: string[]
      // Files with uncommitted changes in the session's folder, from git.
      dirty: number
      needInputs: NeedInputs
      quest: Quest | null
      // Whether his level keeps the old turns-only level as a floor.
      useFloor: boolean
      isCelebrating: boolean
      commits: Commit[]
      partyUntil: number
      isMuted: boolean
      // While he sweeps: how many pieces of mess are being swept away.
      sweeping: number
      // Oldest on the left; at most five.
      notes: Note[]
      // The note that just fell off the board, while it falls.
      dropped: Note | null
    }
  }
}
