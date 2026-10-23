// Clawd's journal: one entry per day, written in his voice from the day's
// tally. Pure functions, so entries read the same however often they draw.

import type { Day } from '../types'

export const KEEP_DAYS = 14

export const EMPTY_DAY: Day = {
  turns: 0,
  commits: [],
  testsPassed: 0,
  prs: 0,
  friends: [],
  prompts: 0,
  clear: 0,
  tips: {},
  badges: [],
  ranks: [],
  levels: [],
  interrupts: 0,
  corrections: 0,
  waits: 0,
  contextPeak: 0,
  themes: {},
}

// The local date a moment falls on, as YYYY-MM-DD.
export function dayKey(ms: number): string {
  const at = new Date(ms)

  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

// Only the last KEEP_DAYS days, `today` included.
export function prune(days: Record<string, Day>, today: string): Record<string, Day> {
  const cutoff = new Date(`${today}T12:00:00`)
  cutoff.setDate(cutoff.getDate() - (KEEP_DAYS - 1))
  const oldest = dayKey(cutoff.getTime())

  return Object.fromEntries(Object.entries(days).filter(([key]) => key >= oldest && key <= today))
}

export function isQuiet(day: Day): boolean {
  return day.turns === 0 && day.prompts === 0 && day.commits.length === 0 && day.friends.length === 0
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function heading(key: string): string {
  const at = new Date(`${key}T12:00:00`)

  return `${WEEKDAYS[at.getDay()]}, ${MONTHS[at.getMonth()]} ${at.getDate()}`
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

function quote(text: string, max = 60): string {
  const line = text.replace(/\s+/g, ' ').trim()

  return `“${line.length > max ? `${line.slice(0, max - 1)}…` : line}”`
}

// The day in his words: how busy it was, what shipped, who visited, and how
// you prompted. `isToday` writes it as still going.
export function entry(day: Day, isToday: boolean): string {
  if (isQuiet(day)) {
    return isToday ? 'Nothing yet today. I’m ready when you are.' : 'A quiet day. I tidied my room and waited for you.'
  }

  const lines: string[] = []
  const pace = day.turns >= 30 ? 'What a day!' : day.turns >= 10 ? 'A busy one.' : day.turns > 0 ? 'A gentle day.' : 'We mostly talked.'
  lines.push(`${pace} ${isToday ? 'So far we have finished' : 'We finished'} ${plural(day.turns, 'turn')} together.`)

  if (day.commits.length > 0) {
    const named = day.commits.slice(0, 3).map(one => quote(one.message, 48))
    const more = day.commits.length > 3 ? `, and ${plural(day.commits.length - 3, 'more')}` : ''
    lines.push(`You committed ${plural(day.commits.length, 'time')}: ${named.join(', ')}${more}. I swept up after each one.`)
  }

  if (day.testsPassed > 0) {
    lines.push(`The tests passed ${plural(day.testsPassed, 'time')}, so I danced ${day.testsPassed === 1 ? 'once' : `${day.testsPassed} times`}. 🎉`)
  }

  if (day.prs > 0) {
    lines.push(`You opened ${day.prs === 1 ? 'a PR' : `${day.prs} PRs`}, so I wore my party hat.`)
  }

  if (day.friends.length > 0) {
    const notes = day.friends.slice(0, 3).map(one => `${one.kind ?? 'a friend'} reported ${quote(one.line, 52)}`)
    const more = day.friends.length > 3 ? `; ${plural(day.friends.length - 3, 'more friend')} left notes too` : ''
    const said = notes.join('; ')
    lines.push(`${plural(day.friends.length, 'friend')} visited. ${said.charAt(0).toUpperCase()}${said.slice(1)}${more}.`)
  }

  if (day.prompts > 0) {
    const share = Math.round((day.clear / day.prompts) * 100)
    const verdict =
      share >= 85 ? 'You were so clear I hardly had to guess.' : share >= 60 ? 'Mostly clear, with a few guesses.' : 'I was guessing a lot today.'
    lines.push(`${day.clear} of your ${plural(day.prompts, 'prompt')} were clear (${share}%). ${verdict}`)

    const [tip] = Object.entries(day.tips).sort((a, b) => b[1] - a[1])

    if (tip !== undefined) {
      lines.push(`The tip I gave most: ${quote(tip[0], 70)}.`)
    }
  }

  for (const badge of day.badges) {
    lines.push(`You earned the **${badge}** badge! 🏅`)
  }

  for (const rank of day.ranks) {
    lines.push(`Your prompt craft reached **${rank}**.`)
  }

  for (const level of day.levels) {
    lines.push(`I reached **level ${level}**!`)
  }

  return lines.join(' ')
}

// The whole journal: today so far, then every other kept day, newest first.
export function journal(days: Record<string, Day>, today: string): string {
  const past = Object.keys(days)
    .filter(key => key < today)
    .sort()
    .reverse()
  const parts = [`## Today so far · ${heading(today)}`, '', entry(days[today] ?? EMPTY_DAY, true)]

  for (const key of past) {
    parts.push('', `## ${heading(key)}`, '', entry(days[key] ?? EMPTY_DAY, false))
  }

  if (past.length === 0) {
    parts.push('', `_Each evening I write up the day. I keep ${KEEP_DAYS} days._`)
  }

  return parts.join('\n')
}
