// The Docs tab of Clawd's menu, written for the level he is at.

import { ITEMS, OUTFITS } from './catalog'
import { QUEST_XP } from './quests'

export function docs(level: number): string {
  const unlocks = [
    ...ITEMS.map(item => ({ ...item, kind: 'Room' })),
    ...OUTFITS.map(outfit => ({ ...outfit, kind: 'Wardrobe' })),
  ].sort((a, b) => a.level - b.level)

  return `# Clawd

Clawd lives in a room above the prompt and acts out what this session is doing. What he is doing shows in where he stands and what he holds. Under the room are his needs, then a bar with **☰ Menu** first, his level, turns and your rank, how many files are uncommitted, today's quest, and your usage meters.

## Where he goes

| Clawd is | Where | When |
| --- | --- | --- |
| Hanging out | On the rug | Nothing is going on |
| Thinking | On the rug | A turn has started |
| Reading a book he took off the shelf | By the bookshelf | Claude reads files |
| Searching with a magnifier | By the bookshelf | Claude greps, globs or searches the web |
| Writing on the paper | At the desk | Claude edits or writes files |
| Typing at the terminal | At the computer | Claude runs a command |
| Briefing friends | By the door | Claude starts a subagent |
| Right up at the glass, knocking | Close to you, the glass frosted behind him | A permission prompt or question waits on you |
| Happy with stars | On the rug | The turn finished; your move |
| Dizzy with smoke | On the rug | The turn hit an error |
| Asleep | In bed | Nothing has happened for 10 minutes |
| Dancing in confetti | On the rug | Your tests just passed |
| Sweeping with a broom | On the rug | You just committed |

When his state changes he walks from where he was to where he is needed. Within a turn he stays at his last station until Claude uses the next tool.

The band turns amber while he waits on you, green when a turn finishes, and red after an error, until you send your next message.

## Celebrations

- **Tests pass**: a test run that exits cleanly (npm, yarn, pnpm or bun test, jest, vitest, mocha, pytest, go test, cargo test and friends) gets a six-second confetti dance.
- **Commits**: each git commit is framed as a polaroid on the wall above the rug, newest on the left; the last three stay up. Hover one for its message.
- **Pull requests**: opening a PR (\`gh pr create\` or a GitHub tool) gets him a party hat for the rest of the day.

## Sounds

He knocks on the glass (knock knock) when he starts waiting on you for a permission prompt or a question, and again every three minutes until you answer. It plays through your Mac's speakers. Passing tests get the confetti dance with no sound. **🔔 Sound on** at the top of this menu, or \`/pet mute\` and \`/pet unmute\`, turns the knock off and on, and the setting is kept.

## Tidiness

Every file with uncommitted changes in the session's folder (what \`git status\` lists) is a piece of mess on his floor: crumpled pages, coffee cups, a sock, a pizza box, up to sixteen pieces. He recounts after Claude edits a file or runs a command, and every few minutes for changes you make yourself. Commit and he sweeps away what the commit cleaned up. Outside a git repo the floor stays clean.

## Friends

Each subagent Claude starts is a smaller friend in its own color, with a name tag showing its type (Explore, Plan, general-purpose…). Hover a friend to see its task.

When a friend finishes, it pins a sticky note in its color to the corkboard between the shelf and the desk on its way out. Hover a note to read the first line of that subagent's report. The board holds five; the oldest falls off when a sixth arrives. Friends come in through the door, go to the bookshelf, desk or computer (with their own laptop) as their subagent works, think on the rug between tasks, and walk out the door when they finish. Up to three show at once.

## The window

- **Sky** follows your clock: dawn 6–8, day 8–18, dusk 18–21, night otherwise.
- **Weather** follows the session: clear while things go well, rain after an error, a thunderstorm while a permission prompt or question waits on you.

## Coaching

Clawd reacts to how you prompt, to help you get more out of Claude. Spelling and grammar never count; what counts is whether Claude can tell what you want.

| Clawd looks | When your prompt | Tip |
| --- | --- | --- |
| ? Confused | is vague: "fix it", "make it better", no file, function or error named | Name the target and what done looks like |
| ☁ Grumpy | is vague again, right after a tip | Say where, what, and how to check it |
| 💧 Overwhelmed | piles many asks into one, or context is nearly full | Split the work, ask for a plan, or /compact |
| 🌀 Dizzy | follows two interrupts or corrections in a row | State constraints up front |
| ✨ Proud | names the target and how to verify it | |
| 💡 Inspired | gives an example or says why | |
| 🌸 Calm | asks for a plan first | |
| ♥ Content | follows up specifically on what worked | |

Short replies ("yes", "go ahead", "2") are never counted as vague. The tip shows on the floor, bottom left, until a couple of minutes after the turn. Clear prompts earn you prompt-craft XP and badges; see the **Coach** tab.

**Suggested rewrites** (off by default, since each uses a few Haiku tokens): turn them on in the Coach tab or with \`/pet rewrites on\`, and every vague prompt gets a clearer version written in the background. Hover the 💡 tip to read it; the Coach tab keeps the last five. Missing details come back as [placeholders], so you can see what to add next time. **Use this rewrite** puts one in your prompt box as a draft (never sent; on the desktop app it may land on your clipboard to paste instead). Fill in the placeholders and send it for +3 craft and the Rewriter badge; send it with brackets still in and he'll point them out.

**Starter templates** in the Coach tab (bug fix, new feature, refactor, investigate) work the same way: **Use** drafts one into your prompt box, and sending it with the placeholders filled earns +3 craft and the Templater badge.

## Tips through the day

At most once every two hours (across all your sessions), Clawd puts a tip in a card just above his room, labeled with its topic (Prompting, Context, Planning, Verifying, Workflow or Skills). **✕** puts it away. Tips come from how you have actually worked this past week, and each one says what it noticed: prompts that named nothing, turns you stopped or corrected, context running high, lots of stops for your permission, a long stretch without a commit, never asking for a plan or a subagent. When a kind of work keeps coming up in your prompts (bugs, reviews, new features, design, wording, tests, refactors) and you have a skill for it that you haven't used in two weeks, he suggests it by name, with the slash command to run it. With nothing to point out, he shares a general Claude Code tip you haven't seen lately. A tip doesn't come back for two weeks. Turn them off in the Coach tab or with \`/pet tips off\`.

**Teach me** on a tip opens a lesson in its own pane: the idea behind the tip, a weak request next to a better one, and a couple of ways to practice. Below that is a chat with Clawd. Paste a request you're about to send and he says what he'd change, with a rewrite to compare; or ask him a question about the topic. **Another example** asks for a new pair on a different kind of task. Replies come from Haiku (a few tokens each) and are written to sound like a person, not a chatbot.

When a request you paste already does what the lesson teaches, Clawd passes it ("ready to send") and it counts as practice. The lesson shows how many times you've practiced it, the Coach tab lists every lesson with a ✓ for the practiced ones (press one to open it), and tips on a practiced topic come round three times less often.

While he's nudging you about a prompt (confused, grumpy, overwhelmed or dizzy), **? Teach me** shows next to Menu. It opens the lesson for that nudge with the prompt you sent already in the chat, so his feedback is on your actual words.

## Journal

The **Journal** tab is Clawd's diary: what happened today so far, then one entry per day, newest first, kept for two weeks. He writes up turns, commits, passing tests, PRs, the friends who visited and what they reported, and how your prompting went (how many prompts were clear, the tip he gave most, badges and ranks you earned). The first time you open Claude on a new day, he tells you he wrote up the last one.

## Usage

Three readings under the room, on the right: **ctx** is this session's context window, **5h** your 5-hour session limit, **wk** your weekly limit. They turn amber at 80% and red at 95%, and then show when they reset. The limits are your account's, so whichever session talked to Claude last shares its reading, and idle sessions pick it up within a minute. At 85% context he nudges you to /compact or start fresh, and a limit past 90% gets a toast.

## Seasons

The room dresses for the time of year, from your calendar:

| Months | Decor |
| --- | --- |
| January | Snow in the window and on the sill; Clawd wears a scarf |
| February | Snow and the scarf, with a garland of hearts across the wall |
| March–May | Flowers on the window sill and a butterfly at the glass |
| June–August | A beach ball in the corner, and fireworks in the window at night |
| September, November | Leaves falling outside the window and a few blown in |
| October | A jack-o'-lantern in the corner that glows at night, bats flying across the wall, and fallen leaves |
| December | Snow, the scarf, and a little tree with blinking lights and a present |

## Levels

He is level **${level}**. He grows on XP, and what earns it changes as he goes:

| Levels | Stage | What earns XP |
| --- | --- | --- |
| 1–3 | Settling in | Mostly finished turns, so you get into the habit |
| 4–6 | Learning | Turns earn half. Clear prompts, lessons and skills count more |
| 7+ | Mastery | Turns earn nothing. Prompt craft, lessons, skills and good habits (committing after tests pass, handing searches to a subagent) earn 1.5× |

Each level takes 5 XP more than the last (10, 15, 20…). Two milestones open the later stages: **level 4** needs a request passed in a Teach me lesson, and **level 7** needs three different skills used. Replies like "yes" or "go on" never earn XP, and XP is never taken away. The Coach tab shows how far he is from the next level. If he was higher under the old rule (a level every ten turns), he keeps that level as a floor; Debug can switch the floor off.

| Level | Unlock | Where | |
| --- | --- | --- | --- |
${unlocks.map(one => `| ${one.level} | ${one.name} | ${one.kind} | ${one.level <= level ? '✓' : 'locked'} |`).join('\n')}

Room items and outfits unlock by level. Pick an unlocked outfit on the **Wardrobe** tab.

## Needs

Under the room, five bars show how he's doing, like the needs in The Sims. Hover one for what refills it.

| Need | Drains when | Refills when |
| --- | --- | --- |
| Focus | Context fills up | You /compact or /clear |
| Tidy | Files sit uncommitted | You commit |
| Clarity | Hours pass without a clear prompt | You name the target and say how to check |
| Confidence | Claude edits with nothing checked since | Tests pass, or you say how to verify |
| Curiosity | Days pass without trying anything new | You use a skill, pass a lesson, use a subagent, ask for a plan, or finish a quest |

His color shows the lowest one: his own orange while they're fine, pale yellow once one runs low, washed-out grey once one is nearly empty. While every need is above half, XP earns 1.5×.

## Daily quest

Each day a package arrives by the door. Press **📦 Open** to see the day's quest: something small to try, like using a skill you haven't tried or asking for a plan before any edits. Finish it for ${QUEST_XP} XP. The quest shows in the bar under the room until it's done.


## Commands

- \`/pet\`: his stats, and shows the band if it was hidden
- \`/pet name <name>\`: rename him
- \`/pet tips on\`, \`/pet tips off\`: tips through the day
- \`/pet rewrites on\`, \`/pet rewrites off\`: Haiku's suggested rewrites of vague prompts
- \`/pet mute\`, \`/pet unmute\`: turn his sounds off or on
- \`/pet hide\`, \`/pet show\`: hide or show the band

## Testing

The **Debug** tab cycles his mood (he walks to each new spot), level, weather, time of day, season, feeling, friends, sample polaroids, sticky notes, the party hat and the mess without touching his real stats. **Celebrate** plays the confetti dance, **Sweep** the tidy-up, and **Hear the knock** the knock. **Reset** goes back to following the session. **Drawing** switches how the band is drawn: **images** (the default: stacked pictures that swap without a blank frame, with every tooltip on an invisible layer above), **layered frames**, or **one picture**, in case your app shows one of them wrong.
`
}
