// Tips through the day: what Clawd has noticed about how you work, turned
// into one small suggestion at a time. Personal tips come first, each saying
// what it saw; with nothing to go on, a general Claude Code tip you have not
// seen lately. Pure functions, so the choice is easy to test and tune.

import type { Craft, Day, Feeling } from '../types'

// At most one tip this often, across every session.
export const TIP_GAP_MS = 2 * 60 * 60 * 1000
// A tip shown is not shown again for this long; a general one for longer.
const REPEAT_MS = 14 * 24 * 60 * 60 * 1000
const GENERAL_REPEAT_MS = 30 * 24 * 60 * 60 * 1000
// A tip whose lesson you have practiced comes back this many times slower.
const PRACTICED_SLOWDOWN = 3

// What the tips read: the last week of the journal, summed, and today alone.
export type Signals = {
  week: Day
  today: Day
  craft: Craft
  // Finished turns since the last commit (the mess on his floor).
  sinceCommit: number
  wantsRewrites: boolean
  // Passes in the "Teach me" chat, by lesson.
  practiced: Record<string, number>
  // The skills this session has, by name, and when you last used each.
  skills: string[]
  skillsUsed: Record<string, number>
}

export type Topic = 'Prompting' | 'Context' | 'Planning' | 'Verifying' | 'Workflow' | 'Skills'

export type Tip = { id: string; topic: Topic; lesson: LessonId; text: string }

type Rule = { id: string; topic: Topic; lesson: LessonId; when: (s: Signals) => boolean; text: (s: Signals) => string }

const share = (part: number, whole: number) => (whole === 0 ? 0 : part / whole)

// Most useful first: the first that applies and was not shown lately wins.
// Every text went through the humanizer: plain words, straight quotes, no
// em dashes, nothing a chatbot would say.
const PERSONAL: Rule[] = [
  {
    id: 'vague',
    topic: 'Prompting',
    lesson: 'target',
    when: s => s.week.prompts >= 8 && share(s.week.prompts - s.week.clear, s.week.prompts) >= 0.3,
    text: s =>
      `${s.week.prompts - s.week.clear} of your last ${s.week.prompts} prompts didn't name a file, function or error, so Claude had to go looking first. Start with the target. An @-mention is the fastest way.`,
  },
  {
    id: 'interrupts',
    topic: 'Prompting',
    lesson: 'limits',
    when: s => s.today.interrupts >= 3,
    text: s =>
      `You've stopped Claude ${s.today.interrupts} times today. Put the limits in your first message ("leave the API alone", "keep it under 50 lines") and it starts off in the right direction.`,
  },
  {
    id: 'corrections',
    topic: 'Prompting',
    lesson: 'why',
    when: s => s.today.corrections >= 3,
    text: s => `You corrected Claude ${s.today.corrections} times today. Next time, say what was wrong and why. Claude can use the reason everywhere else in the change too.`,
  },
  {
    id: 'context',
    topic: 'Context',
    lesson: 'context',
    when: s => s.today.contextPeak >= 70,
    text: s => `Context hit ${s.today.contextPeak}% today. Run /compact between tasks, or /clear when you switch topics. Claude stays focused and each turn costs less.`,
  },
  {
    id: 'verify',
    topic: 'Verifying',
    lesson: 'verify',
    when: s => s.craft.prompts >= 12 && share(s.craft.habits.verify, s.craft.prompts) < 0.15,
    text: () => 'Try ending a request with how to check it: "run npm test" or "this should return a 404". Claude keeps at it until the check passes, and you have less to review.',
  },
  {
    id: 'plan',
    topic: 'Planning',
    lesson: 'plan',
    when: s => s.craft.prompts >= 15 && s.craft.habits.plan === 0,
    text: () => 'For bigger changes, ask for a plan before any edits. Fixing a plan takes one sentence. Fixing a finished change takes a lot longer.',
  },
  {
    id: 'commit',
    topic: 'Workflow',
    lesson: 'commit',
    when: s => s.sinceCommit >= 6,
    text: s => `It's been ${s.sinceCommit} turns since your last commit. Commit when things work, and anything Claude does after that is easy to undo.`,
  },
  {
    id: 'waits',
    topic: 'Workflow',
    lesson: 'permissions',
    when: s => s.today.waits >= 8,
    text: s =>
      `Claude waited on your permission ${s.today.waits} times today. If it keeps asking about the same safe commands, allow them for the session so it can keep moving.`,
  },
  {
    id: 'subagents',
    topic: 'Context',
    lesson: 'subagents',
    when: s => s.week.prompts >= 20 && s.week.friends.length === 0,
    text: () => 'For big searches like "find every caller of refund()", ask Claude to use a subagent. You get the answer back, and your session keeps its context for the actual work.',
  },
  {
    id: 'example',
    topic: 'Prompting',
    lesson: 'example',
    when: s => s.craft.prompts >= 15 && s.craft.habits.example === 0,
    text: () => 'Show Claude an example of what you want ("format it like this: ..."). One example usually says more than a paragraph of description.',
  },
  {
    id: 'why',
    topic: 'Prompting',
    lesson: 'why',
    when: s => s.craft.prompts >= 15 && share(s.craft.habits.why, s.craft.prompts) < 0.05,
    text: () => 'Tell Claude why you want something ("so the refund total matches Shopify"). With the reason, it makes better calls on the edge cases you didn\'t mention.',
  },
  {
    id: 'rewrites',
    topic: 'Prompting',
    lesson: 'target',
    when: s => !s.wantsRewrites && s.week.prompts >= 8 && share(s.week.prompts - s.week.clear, s.week.prompts) >= 0.2,
    text: () => 'Turn on suggested rewrites in the Coach tab. Each vague prompt gets a clearer version you can compare with yours.',
  },
]

// What your prompts were about, for the skill tips. A prompt can be about
// more than one thing.
export const THEMES = {
  debug: /\b(bugs?|broken|errors?|fail(s|ing|ed)?|crash(es|ing)?|not working|doesn'?t work|wrong)\b/i,
  review: /\b(review|pull request|pr|merge|ship it|before (i|we) (push|merge))\b/i,
  feature: /\b(add|build|create|implement|new feature|let'?s make|can we (add|make|build))\b/i,
  design: /\b(looks?|design|ui|layout|banner|styling|professional|spacing|colou?rs?)\b/i,
  copy: /\b(wording|copy|tone|rewrite|phrasing|labels?)\b/i,
  tests: /\b(tests?|specs?|coverage|tdd)\b/i,
  refactor: /\b(refactor|clean ?up|simplify|tidy)\b/i,
} as const

export type Theme = keyof typeof THEMES

export function themesOf(text: string): Theme[] {
  return (Object.keys(THEMES) as Theme[]).filter(theme => THEMES[theme].test(text))
}

// The skills worth suggesting for each theme, best first, by the end of
// their name (a plugin's skills are named plugin:skill), and what each does.
const SKILL_HINTS: { theme: Theme; skill: RegExp; does: string }[] = [
  { theme: 'debug', skill: /(^|:)systematic-debugging$/, does: 'Claude finds the root cause before it changes any code' },
  { theme: 'debug', skill: /(^|:)debug(ging)?$/, does: 'Claude works through the bug step by step instead of guessing' },
  { theme: 'review', skill: /(^|:)code-review$/, does: 'Claude reviews the diff for real bugs before you merge' },
  { theme: 'review', skill: /(^|:)requesting-code-review$/, does: 'Claude checks the work against what you asked for before you merge' },
  { theme: 'feature', skill: /(^|:)brainstorming$/, does: 'Claude talks the idea through with you before any code gets written' },
  { theme: 'feature', skill: /(^|:)writing-plans$/, does: 'Claude writes a step-by-step plan you can check first' },
  { theme: 'design', skill: /(^|:)design-critique$/, does: 'Claude checks the design against real layout and hierarchy rules' },
  { theme: 'design', skill: /(^|:)accessibility-review$/, does: 'Claude checks contrast, labels and keyboard use' },
  { theme: 'copy', skill: /(^|:)ux-copy$/, does: 'Claude writes button labels, messages and empty states that read well' },
  { theme: 'copy', skill: /(^|:)humanizer$/, does: 'Claude strips the parts of a text that sound machine-written' },
  { theme: 'tests', skill: /(^|:)test-driven-development$/, does: 'Claude writes the failing test first, then the fix' },
  { theme: 'refactor', skill: /(^|:)simplify$/, does: 'Claude looks over the changed code for simpler shapes and applies them' },
]

const THEME_LINES: Record<Theme, (count: number) => string> = {
  debug: n => `${n} of your prompts this week were about bugs.`,
  review: n => `You asked about reviewing or merging ${n} times this week.`,
  feature: n => `You started on ${n} new features this week.`,
  design: n => `${n} prompts this week were about how something looks.`,
  copy: n => `You worked on wording ${n} times this week.`,
  tests: n => `Tests came up in ${n} prompts this week.`,
  refactor: n => `You asked for ${n} refactors or cleanups this week.`,
}

// A skill fits once its theme came up in three prompts this week, if you
// have it and haven't used it in two weeks.
const SKILL_THEME_MIN = 3
const SKILL_FRESH_MS = 14 * 24 * 60 * 60 * 1000

function skillRules(s: Signals, now: number): Rule[] {
  const isFresh = (name: string) => now - (s.skillsUsed[name] ?? 0) < SKILL_FRESH_MS

  return (Object.keys(THEMES) as Theme[]).flatMap(theme => {
    const count = s.week.themes[theme] ?? 0
    const hints = SKILL_HINTS.filter(one => one.theme === theme)

    if (count < SKILL_THEME_MIN || hints.some(hint => s.skills.some(name => hint.skill.test(name) && isFresh(name)))) {
      return []
    }

    for (const hint of hints) {
      const name = s.skills.find(one => hint.skill.test(one))

      if (name !== undefined) {
        return [{ id: `skill-${theme}`, topic: 'Skills' as const, lesson: 'skills' as const, when: () => true, text: () => `${THEME_LINES[theme](count)} Try /${name}: ${hint.does}.` }]
      }
    }

    return []
  })
}

const GENERAL: Tip[] = [
  { id: 'g-mention', topic: 'Context', lesson: 'target', text: '@-mention a file and Claude gets exactly the context it needs without searching for it.' },
  { id: 'g-claudemd', topic: 'Workflow', lesson: 'claudemd', text: "Put your repo's conventions in CLAUDE.md. Claude reads it every session, so you stop repeating yourself." },
  { id: 'g-test-first', topic: 'Verifying', lesson: 'verify', text: 'Try "write a failing test first, then make it pass." You end up with the fix and a test that proves it.' },
  { id: 'g-screenshot', topic: 'Prompting', lesson: 'example', text: 'Claude can read images. Paste a screenshot of the broken UI or the error dialog instead of describing it.' },
  { id: 'g-review', topic: 'Verifying', lesson: 'verify', text: 'Before you ship, ask Claude "what would you check before merging this?" It\'s a cheap second look.' },
  { id: 'g-clear', topic: 'Context', lesson: 'context', text: "Starting on something unrelated? /clear gives Claude a clean slate, so the old task doesn't bleed into the new one." },
  { id: 'g-small', topic: 'Planning', lesson: 'plan', text: 'Split big requests into steps you can check one at a time. Small steps are easier to review and easier to undo.' },
]

// What "Teach me" opens: the idea behind a tip, a weak prompt beside a
// better one, and ways to practice. Humanized like the tips.
export type LessonId = 'skills' | 'target' | 'limits' | 'why' | 'context' | 'verify' | 'plan' | 'commit' | 'permissions' | 'subagents' | 'example' | 'claudemd'

export type Lesson = { title: string; idea: string; weak: string; strong: string; ways: string[] }

export const LESSONS: Record<LessonId, Lesson> = {
  skills: {
    title: 'Reach for a skill',
    idea: 'A skill is a process someone already wrote down for one kind of work, like debugging, reviewing a diff or checking a design. Start a request with /skill-name and Claude follows that process instead of making one up as it goes. Type / in the prompt box to see the ones you have.',
    weak: 'the refund total is wrong, fix it',
    strong: '/systematic-debugging The refund total in refunds.ts is off by the shipping amount when a discount applies. Find the cause before changing anything.',
    ways: [
      'When a task is a kind of work you do often, type / and look for a skill that covers it.',
      'Before a long debugging or review session, ask Claude "is there a skill for this?"',
    ],
  },
  target: {
    title: 'Name the target',
    idea: "Claude starts every request by working out where to look. Name the file, function or error up front and it skips that search and goes straight to the change. An @-mention is better still, because it attaches the file itself.",
    weak: 'the checkout is broken, can you fix it',
    strong: 'In @src/cart/checkout.ts, applyDiscount() returns NaN when the cart is empty. Make it return 0 and add a test for the empty cart.',
    ways: [
      'Before you send, check that the prompt names at least one file, function or error message.',
      "Paste the exact error text instead of paraphrasing it. Claude can search for the real thing.",
    ],
  },
  limits: {
    title: 'Say the limits first',
    idea: "When you stop Claude halfway, it's usually because it went somewhere you didn't want. Most of the time you knew that limit before you started. Put it in the first message and Claude plans around it.",
    weak: 'add caching to the orders endpoint',
    strong: "Add caching to GET /orders. Keep it in memory (no Redis), don't change the response shape, and keep the change inside orders/controller.ts.",
    ways: [
      'Ask yourself what would make you hit stop, and write that down before anything else.',
      'Name what is off limits: files, APIs, dependencies, behavior that has to stay the same.',
    ],
  },
  why: {
    title: 'Give the reason',
    idea: 'A correction like "no, not that" fixes one spot. A correction with a reason fixes the pattern, because Claude can apply the reason to code you haven\'t looked at yet. The same goes for a first request: the why tells Claude how to handle the cases you didn\'t spell out.',
    weak: 'no, use the other date format',
    strong: 'Use ISO dates (2026-10-23) here. The export goes into a spreadsheet that sorts on this column, so the dates have to sort correctly as text.',
    ways: [
      'After "no" or "instead", add one sentence that starts with "because".',
      'When you ask for something new, say who or what it is for.',
    ],
  },
  context: {
    title: 'Keep the context clean',
    idea: 'Everything in the conversation rides along with every turn. As the window fills, older details get squeezed and each turn costs more. /compact boils the conversation down to a summary. /clear starts over, which is what you want when the next task has nothing to do with the last one.',
    weak: '(150 turns into a refactor) now help me write the release notes',
    strong: '/clear, then: Write release notes for v2.4 from the commits since tag v2.3. Group them into features and bug fixes.',
    ways: [
      'Run /compact when you finish a piece of work and want to keep going in the same area.',
      'Run /clear whenever you switch to something unrelated.',
    ],
  },
  verify: {
    title: 'Say how to check it',
    idea: 'If Claude knows what done looks like, it can check its own work and keep going until the check passes. Without that, it stops when the code looks right, and you are the one who finds out whether it works.',
    weak: 'fix the login bug',
    strong: 'Fix the bug where a valid password gets a 401 from POST /login. Done means npm test -- auth passes and logging in with the seed user returns 200.',
    ways: [
      'End requests with a command to run or a result to expect.',
      'For bugs, ask for a failing test first, then the fix.',
    ],
  },
  plan: {
    title: 'Plan before editing',
    idea: "A plan is a few paragraphs you can read in a minute. If it's wrong, one sentence fixes it. If Claude goes straight to editing with the wrong approach, you end up reviewing and undoing a dozen files.",
    weak: 'migrate the jobs from cron to Temporal',
    strong: 'I want to move our cron jobs to Temporal. Before you edit anything, read jobs/ and write a plan: which jobs move first, what changes in each, and how we roll back. Wait for my OK.',
    ways: [
      'If a change touches more than two or three files, ask for the plan first.',
      'Read the plan for the riskiest step and push back on that one.',
    ],
  },
  commit: {
    title: 'Commit at checkpoints',
    idea: 'A commit is a save point. Commit when the tests pass and whatever Claude does next is one command away from undone. Long stretches without one let a bad turn get tangled up with good work.',
    weak: '(eight turns of changes, nothing committed) now refactor the whole pricing module',
    strong: 'Commit what we have as "Fix discount on empty carts". Then split pricing/ into smaller files.',
    ways: [
      'Commit every time a test run goes green.',
      'Before a risky ask, commit first so you have somewhere to go back to.',
    ],
  },
  permissions: {
    title: 'Allow the safe commands',
    idea: "Every permission prompt stops Claude until you answer. Some are worth the pause, like deleting files or pushing. Running the tests or reading git log usually isn't. Allow the safe ones and keep your attention for the ones that matter.",
    weak: 'Clicking Allow on npm test for the ninth time today.',
    strong: 'Choosing "don\'t ask again" for npm test the first time it comes up, and still reviewing anything that deletes or pushes.',
    ways: [
      'Notice which prompts you approve without reading, and allow those.',
      'Keep prompts for anything that leaves your machine or can\'t be undone.',
    ],
  },
  subagents: {
    title: 'Hand searches to a subagent',
    idea: 'A wide search reads a lot of files, and all of that lands in your context. A subagent does the reading in its own context and sends back only the answer, so your session stays light.',
    weak: 'find everywhere we call refund()',
    strong: 'Use a subagent to find every caller of refund(). Report back file:line for each, with one line on what that caller does.',
    ways: [
      'Use a subagent when the answer is short but finding it means reading a lot.',
      'Ask for a specific shape of report so the answer is easy to use.',
    ],
  },
  example: {
    title: 'Show an example',
    idea: 'Describing a format in words leaves a lot of room for guessing. One example takes most of that away, because Claude can match it. Screenshots work the same way for UI bugs.',
    weak: 'make the log lines more readable',
    strong: 'Change the log lines to look like this: [orders] 12:04:31 created #1042 (3 items, $54.20)',
    ways: [
      'When you catch yourself describing a format, paste one instead.',
      'For a UI problem, paste a screenshot and point at the part that is wrong.',
    ],
  },
  claudemd: {
    title: 'Write it down once',
    idea: 'Anything you repeat every session, like the test command, naming rules or folders to leave alone, belongs in CLAUDE.md. Claude reads it at the start of every session.',
    weak: '(again) remember we use pnpm, not npm',
    strong: 'A line in CLAUDE.md: Use pnpm for everything. Run tests with pnpm test -- --run.',
    ways: [
      'The second time you correct the same thing, add it to CLAUDE.md.',
      'Keep it short. A list of rules beats a long essay.',
    ],
  },
}

// The lesson for one of his nudges: a vague prompt needs a target, a pile
// of asks a plan, a run of interrupts the limits up front.
export const NUDGE_LESSONS: Partial<Record<Feeling, LessonId>> = {
  confused: 'target',
  grumpy: 'target',
  overwhelmed: 'plan',
  dizzy: 'limits',
}

export function lessonById(id: string): Lesson {
  return id in LESSONS ? LESSONS[id as LessonId] : LESSONS.target
}

export function topicOf(id: LessonId): Topic {
  if (id === 'skills') {
    return 'Skills'
  }

  return PERSONAL.find(one => one.lesson === id)?.topic ?? GENERAL.find(one => one.lesson === id)?.topic ?? 'Prompting'
}

// A tip as it reads now: one logged before its wording changed shows the
// current words, where the words take no counts.
export function currentText(id: string, text: string): string {
  const rule = PERSONAL.find(one => one.id === id)

  if (rule !== undefined) {
    return rule.text.length === 0 ? (rule.text as () => string)() : text
  }

  return GENERAL.find(one => one.id === id)?.text ?? text
}

// The lesson behind a shown tip; tips logged before lessons existed fall
// back to naming the target.
export function lessonOf(id: string): { lesson: LessonId; topic: Topic } {
  if (id.startsWith('skill-')) {
    return { lesson: 'skills', topic: 'Skills' }
  }

  const rule = PERSONAL.find(one => one.id === id) ?? GENERAL.find(one => one.id === id)

  return rule === undefined ? { lesson: 'target', topic: 'Prompting' } : { lesson: rule.lesson, topic: rule.topic }
}

// The tip to show now, or null: never within TIP_GAP_MS of the last one, and
// never one shown within its repeat window.
export function chooseTip(signals: Signals, shown: { id: string; at: number }[], now: number): Tip | null {
  const last = shown.reduce((latest, one) => Math.max(latest, one.at), 0)

  if (now - last < TIP_GAP_MS) {
    return null
  }

  const lastShown = (id: string) => shown.filter(one => one.id === id).reduce((latest, one) => Math.max(latest, one.at), 0)
  const isDue = (one: { id: string; lesson: LessonId }, repeat: number) =>
    now - lastShown(one.id) >= ((signals.practiced[one.lesson] ?? 0) > 0 ? repeat * PRACTICED_SLOWDOWN : repeat)
  // The urgent four, then a skill that fits your week, then the rest.
  const rules = [...PERSONAL.slice(0, 4), ...skillRules(signals, now), ...PERSONAL.slice(4)]
  const personal = rules.find(rule => rule.when(signals) && isDue(rule, REPEAT_MS))

  if (personal !== undefined) {
    return { id: personal.id, topic: personal.topic, lesson: personal.lesson, text: personal.text(signals) }
  }

  return GENERAL.find(tip => isDue(tip, GENERAL_REPEAT_MS)) ?? null
}

// The humanizer's rules, for everything Haiku writes in a lesson.
const HUMAN_STYLE = [
  'Write like a person talking to a colleague, not like a chatbot.',
  'Plain words, straight quotes, no em dashes, no emojis, no bold, no headings.',
  'Never open with praise ("Great question", "Nice prompt") and never end with an offer to help or a cheerful summary.',
  'Avoid words like crucial, delve, enhance, key, leverage, robust, seamless, valuable, additionally, and constructions like "not just X but Y".',
  'Do not group things in threes for rhythm. Vary sentence length. Be specific, and use "I" when it fits.',
].join(' ')

// The system prompt for the "Teach me" chat on one lesson.
export function teachSystem(lesson: Lesson): string {
  return [
    'You are Clawd, a small pet who lives above the prompt in Claude Code and coaches the person on writing requests for Claude.',
    `This lesson is "${lesson.title}": ${lesson.idea}`,
    `The lesson's example. Instead of: ${lesson.weak} Try: ${lesson.strong}`,
    'The person will either paste a request they want to send to Claude, or ask a question.',
    'For a request: say in a sentence what already works, then the one or two changes that would help most for this lesson, then the improved request on its own line starting with "Try:".',
    `If the request already does what this lesson teaches and you would not change anything for it, start your reply with exactly ${PASS} and then say in a sentence or two why it works. Be honest: most first tries need something.`,
    'Never invent file names, errors or facts; where something is missing, use a short bracketed placeholder like [which file].',
    'For a question: answer it plainly, with a concrete example from everyday coding work.',
    'Keep the whole reply under 120 words.',
    HUMAN_STYLE,
  ].join('\n')
}

// Asks for a fresh weak and strong pair, unlike the ones already shown.
export function examplePrompt(lesson: Lesson, shown: string[]): string {
  return [
    'Give me one more example for this lesson, about a different kind of task than these:',
    ...[lesson.weak, ...shown].map(one => `- ${one}`),
    'Reply in exactly this shape, with nothing before or after:',
    'Instead of: <a short, weak request>',
    'Try: <the same request, improved for this lesson>',
    '<one sentence on what changed and why it helps>',
  ].join('\n')
}

// How Haiku marks a request that needs nothing more for the lesson.
const PASS = 'PASS:'

// A reply, and whether it passed the request; the mark never shows.
export function verdictOf(text: string): { isPass: boolean; text: string } {
  const trimmed = text.trim()

  return trimmed.startsWith(PASS) ? { isPass: true, text: trimmed.slice(PASS.length).trim() } : { isPass: false, text: trimmed }
}

// The last guard on generated text: straight quotes and no em dashes, in
// case the model slips.
export function plain(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+–\s+/g, ', ')
    .trim()
}

// The lesson as the pane's Markdown: the idea, the pair, ways to practice.
export function lessonText(lesson: Lesson): string {
  return [
    lesson.idea,
    '',
    'Instead of:',
    `> ${lesson.weak}`,
    '',
    'Try:',
    `> ${lesson.strong}`,
    '',
    '### Ways to practice',
    ...lesson.ways.map(one => `- ${one}`),
    '',
    '### Try it on me',
    "Paste a request you're about to send, or ask me anything about this. I'll read it and tell you what I'd change.",
  ].join('\n')
}
