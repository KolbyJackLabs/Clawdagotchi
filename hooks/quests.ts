// The daily quest: one small thing to try, delivered as a package by the
// door each morning. Open it to see the quest; finish it for bonus XP.

export type QuestId = 'new-skill' | 'verify' | 'plan' | 'subagent' | 'lesson' | 'example' | 'test-commit' | 'why'

export const QUEST_XP = 10

export const QUESTS: { id: QuestId; text: string }[] = [
  { id: 'new-skill', text: "Use a skill you haven't tried yet" },
  { id: 'verify', text: 'Send a request that says how to check it' },
  { id: 'plan', text: 'Ask for a plan before Claude edits anything' },
  { id: 'subagent', text: 'Hand a search to a subagent' },
  { id: 'lesson', text: 'Get a request passed in a Teach me lesson' },
  { id: 'example', text: 'Show Claude an example of what you want' },
  { id: 'test-commit', text: 'Commit right after your tests pass' },
  { id: 'why', text: 'Tell Claude why you want a change' },
]

export function questText(id: string): string {
  return QUESTS.find(one => one.id === id)?.text ?? 'Try something new with Claude'
}

// Today's quest: the same all day, different most days. A skill quest only
// when there is a skill you have not used.
export function questFor(day: string, hasUntriedSkill: boolean): QuestId {
  const open = QUESTS.filter(one => one.id !== 'new-skill' || hasUntriedSkill)
  const seed = [...day].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 9973, 7)

  return open[seed % open.length]!.id
}
