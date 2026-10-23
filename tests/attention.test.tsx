import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { read as readPrompt, weigh } from '../hooks/coach'
import { EMPTY_DAY, entry, prune } from '../hooks/journal'
import { seasonOf } from '../hooks/season'
import { isLeftward, walkSeconds, whereAt } from '../hooks/walk'
import { LESSONS, TIP_GAP_MS, chooseTip, currentText } from '../hooks/tips'
import { HEIGHT } from '../hooks/room'
import { levelOf, progressOf, xpFor, xpWorth } from '../hooks/growth'
import { needsOf, wellbeingOf } from '../hooks/needs'
import { questFor } from '../hooks/quests'

const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]

const band = (surface: Surface) =>
  ({
    plugin: 'attention-band',
    surface,
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 9 },
      view: {},
    },
  }) as const

const menu = (surface: Surface) =>
  ({
    plugin: 'attention-band',
    surface,
    component: 'Pane',
    requestId: 'clawd',
    props: {
      title: 'Clawd',
      isFocused: true,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  }) as const

const MOODS = /^(Hanging out|Thinking…|Reading files|Writing code|Running a command|Briefing a helper|Needs you!.*|All done.*|Oof.*|Zzz…)$/
const WAITING = 'Needs you! Check the prompt'

// Nothing sits beneath the plugin: these hooks stand for the engine.
function engine(
  on: On,
  {
    tools = true,
    onOpen = (_id: string) => {},
    stored = {} as Record<string, unknown>,
    played = [] as string[],
    now = new Date(2026, 9, 22, 14).getTime(),
    toasts = [] as string[],
    asked = [] as { model: string; prompt: unknown; system?: unknown }[],
    reply = 'Fix [what is broken] in [which file] so [expected behavior]; check by [how to verify].' as string | null,
    // What `git status --porcelain` prints in the session's folder.
    git = { stdout: '' } as { stdout: string },
    // Every other process run: its argv and stdin.
    piped = [] as string[],
    // The skills the session lists.
    skillNames = [] as string[],
  } = {},
) {
  mock.store(on, stored)
  on('process.run', (_, e) => {
    if (e.argv[0] === 'git') {
      return { value: { exitCode: 0, stdout: git.stdout, stderr: '' } as never }
    }

    piped.push(`${e.argv.join(' ')} <- ${String(e.init?.stdin)}`)

    return { value: { exitCode: 0, stdout: '', stderr: '' } as never }
  })
  on('audio.play', (_, e) => {
    played.push('asset' in e.clip ? (e.clip.asset ?? 'other') : 'other')

    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'pet' } }))
  on('ui.open', (_, e) => {
    onOpen(e.id)

    return { value: { isPlaced: true } }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => e)
  if (tools) {
    on('tool.call', () => ({ result: {} }))
  }
  on('classic.PermissionRequest', () => ({}))
  on('classic.Notification', () => ({}))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('model.complete', (_, e) => {
    asked.push({ model: e.model, prompt: e.prompt, system: e.system })

    return {
      value: (reply === null
        ? { isAnswered: false, reason: 'empty-reply' }
        : { isAnswered: true, text: reply, usage: { input_tokens: 80, output_tokens: 40 } }) as never,
    }
  })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000, ...(skillNames.length === 0 ? {} : { breakdown: { skills: { skillFrontmatter: skillNames.map(name => ({ name, source: 'plugin', tokens: 10 })) } } }) },
      rateLimits: [],
    } as never,
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  return mock.clock(on, { now })
}

// The room's SVG source as the desktop band draws it: every layer, bottom
// to top, joined.
// The room's SVG source as the desktop band draws it, every layer, then the
// text of the row under it (level, turns, meters).
async function roomSource($: Engine) {
  const ui = await $.ui.mount(band('desktop'))
  const svgs = await ui.findAll({ type: 'Svg' })
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()

  return svgs.map(one => String(one.props.source ?? '')).join('') + texts.map(one => one.text).join('\n')
}

// The pet's mood line as drawn (in the room's top-left corner on desktop),
// or 'engine' when the band is left alone.
async function moodLine($: Engine, surface: Surface) {
  const ui = await $.ui.mount(band(surface))

  if (surface === 'desktop') {
    const svgs = await ui.findAll({ type: 'Svg' })
    await ui.unmount()

    if (svgs.length === 0) {
      return 'engine'
    }

    // Not drawn in the room any more: the room's alt text carries it.
    return /^.*? in his room: (.*)$/.exec(String(svgs[0]?.props.alt))?.[1]
  }

  const row = (await ui.find({ type: 'Text', text: MOODS })) ?? (await ui.find({ type: 'Text', text: /engine/ }))
  await ui.unmount()

  return row?.text
}

async function pressInMenu($: Engine, ...keys: string[]) {
  const ui = await $.ui.mount(menu('desktop'))

  for (const key of keys) {
    await ui.press({ key })
  }

  await ui.unmount()
}

const count = (source: string, pattern: RegExp) => source.match(pattern)?.length ?? 0
// The meters carry hover titles of their own; these count everyone else's.
const TITLES = /<title>(?!Context|Session limit|Weekly limit|Focus|Tidy|Clarity|Confidence|Curiosity)/g

test('the pet hangs out before anything happens', async ($, on) => {
  engine(on)

  for (const surface of SURFACES) {
    expect(await moodLine($, surface)).toBe('Hanging out')
  }
})

test('the pet goes to each tool’s station and stays until the next one', async ($, on) => {
  engine(on, { tools: false })
  const seen: (string | undefined)[] = []
  on('tool.call', async () => {
    seen.push(await moodLine($, 'desktop'))

    return { result: {} }
  })

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/x' })
  await $.tool.call({ tool: 'Edit', file_path: '/x', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(seen).toEqual(['Reading files', 'Writing code', 'Running a command'])
  expect(await moodLine($, 'desktop')).toBe('Running a command')
})

test('a change of station walks him there, then he stands still', async ($, on) => {
  const clock = engine(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  await $.tool.call({ tool: 'Read', file_path: '/x' })

  const walking = await roomSource($)
  expect(walking).toContain('data-walk="60%>14%"')
  // A CSS walk in pixels: the rug is 60% of the 608px room, the shelf 14% plus 14 units.
  expect(walking).toMatch(/@keyframes walk-clawd\{from\{transform:translate\(364\.8px,30px\)\}to\{transform:translate\(127\.1px,30px\)\}\}/)
  expect(walking).not.toContain('<animate ')
  // The shelf is left of the rug: he faces the way he walks.
  expect(walking).toContain('class="walking leftward"')
  // The book he took leaves a gap, and he holds it once he arrives.
  expect(walking).toContain('class="arrive"')
  expect(walking).toContain('class="flip"')

  await clock.advance(2000)
  const standing = await roomSource($)
  expect(standing).not.toContain('data-walk=')
  expect(standing).toContain('<svg x="14%"')
})

test('a finished turn says your turn, counts it, and the next prompt clears it', async ($, on) => {
  engine(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ answer: 'done', reason: 'answer', isAborted: false, durationMs: 1000, turnId: 't1' })

  for (const surface of SURFACES) {
    expect(await moodLine($, surface)).toBe('All done. Your turn')
  }

  expect(await roomSource($)).toContain('Lv 1 · 1 turns')

  await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })

  expect(await moodLine($, 'desktop')).toBe('Hanging out')
})

test('there is no Dismiss or Pat; the room carries Menu', async ($, on) => {
  engine(on)

  await $.turn.complete({ answer: 'done', reason: 'answer', isAborted: false, durationMs: 1000, turnId: 't1' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ key: 'dismiss' })).toBeUndefined()
    expect(await ui.find({ key: 'pat' })).toBeUndefined()
    expect((await ui.find({ key: 'menu' }))?.text).toBe('☰ Menu')
    await ui.unmount()
  }
})

test('an interrupted turn leaves the band uncolored', async ($, on) => {
  engine(on)

  await $.turn.complete({ answer: '', reason: 'aborted', isAborted: true, durationMs: 10, turnId: 't1' })

  expect(await moodLine($, 'desktop')).toBe('Hanging out')
})

test('an errored turn makes the pet dizzy and rains in the window', async ($, on) => {
  engine(on)

  await $.turn.complete({ answer: '', reason: 'error', isAborted: false, durationMs: 10, turnId: 't1' })

  expect(await moodLine($, 'desktop')).toBe('Oof, that turn hit an error')
  expect(await roomSource($)).toContain('class="drop"')
  expect(await roomSource($)).not.toContain('class="bolt"')
})

test('a question shows waiting and a storm until it is answered', async ($, on) => {
  engine(on, { tools: false })
  let during: string | undefined
  let storm = false
  // Beneath the plugin: the question is open while this runs.
  on('tool.call', async () => {
    during = await moodLine($, 'desktop')
    storm = (await roomSource($)).includes('class="bolt"')

    return { result: {} }
  })

  await $.tool.call({ tool: 'AskUserQuestion', questions: [] })

  expect(during).toBe(WAITING)
  expect(storm).toBe(true)
  expect(await moodLine($, 'desktop')).toBe('Hanging out')
})

test('a permission prompt shows waiting until the tool finishes', async ($, on) => {
  engine(on)

  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm x' } })

  for (const surface of SURFACES) {
    expect(await moodLine($, surface)).toBe(WAITING)
  }

  await $.tool.call({ tool: 'Bash', command: 'rm x' })

  expect(await moodLine($, 'desktop')).toBe('Hanging out')
})

test('a permission notification also shows waiting', async ($, on) => {
  engine(on)

  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' })

  expect(await moodLine($, 'desktop')).toBe(WAITING)
})

test('desktop draws the full-width room, the terminal a face', async ($, on) => {
  engine(on)

  const source = await roomSource($)
  expect(source).toContain('width="100%" height="96"')
  expect(source).toContain('clip-path="url(#win)"')

  const terminal = await $.ui.mount(band('terminal'))
  expect(await terminal.find({ type: 'Text', text: /\(•ᴗ•\)/ })).toBeDefined()
  await terminal.unmount()
})

test('a renamed pet is named in the alt text, and no name or status is drawn in the room', async ($, on) => {
  engine(on)
  on('command.run', () => ({ text: '' }))

  await $.command.run({ command: 'pet', args: 'name <Bo & Co>', origin: { kind: 'composer' }, presentation: { isFullscreen: false } } as never)

  const ui = await $.ui.mount(band('desktop'))
  const svgs = await ui.findAll({ type: 'Svg' })
  await ui.unmount()
  expect(svgs[0]?.props.alt).toBe('<Bo & Co> in his room: Hanging out')
  expect(svgs.some(one => String(one.props.source).includes('Bo &amp; Co'))).toBe(false)
  expect(svgs.some(one => String(one.props.source).includes('Hanging out'))).toBe(false)
})

test('the window follows the clock', async ($, on) => {
  const clock = engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await roomSource($)).toContain('#9fd3ff')

  await clock.set(new Date(2026, 9, 22, 23).getTime())
  expect(await roomSource($)).toContain('#1d2547')
})

test('friends walk in from the door, work at stations, and walk out', async ($, on) => {
  const clock = engine(on)

  await $.turn.start({ text: 'help', turnId: 'a', agentId: 'agent-1' })
  await $.turn.start({ text: 'help', turnId: 'b', agentId: 'agent-2' })
  const arriving = await roomSource($)
  expect(count(arriving, /class="friend"/g)).toBe(2)
  expect(arriving).toContain('data-walk="76%>60%"')

  await clock.advance(2000)
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'agent-1' })
  expect(await roomSource($)).toContain('data-walk="60%>46%"')
  await clock.advance(3000)

  await $.turn.complete({ answer: '', reason: 'answer', isAborted: false, durationMs: 10, turnId: 'a', agentId: 'agent-1' })
  expect(await roomSource($)).toContain('data-walk="46%>76%"')

  await clock.advance(2000)
  expect(count(await roomSource($), /class="friend"/g)).toBe(1)
})

test('a friend’s tool calls leave Clawd where he is', async ($, on) => {
  const clock = engine(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.start({ text: 'help', turnId: 'a', agentId: 'agent-1' })
  await clock.advance(2000)
  await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'agent-1' })

  expect(await moodLine($, 'desktop')).toBe('Thinking…')
})

test('the pet falls asleep in bed after ten quiet minutes and a turn wakes him', async ($, on) => {
  const clock = engine(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ answer: 'done', reason: 'answer', isAborted: false, durationMs: 1000, turnId: 't1' })
  await clock.advance(9 * 60 * 1000)
  expect(await moodLine($, 'desktop')).toBe('All done. Your turn')

  await clock.advance(60 * 1000)
  expect(await moodLine($, 'desktop')).toBe('Zzz…')
  expect(await roomSource($)).toContain('>100%"')

  await $.turn.start({ text: 'again', turnId: 't2' })
  expect(await moodLine($, 'desktop')).toBe('Thinking…')
})

test('the menu button opens the menu on its docs', async ($, on) => {
  let opened = ''
  engine(on, { onOpen: id => (opened = id) })

  const ui = await $.ui.mount(band('desktop'))
  await ui.press({ key: 'menu' })
  await ui.unmount()
  expect(opened).toBe('clawd')

  for (const surface of SURFACES) {
    const pane = await $.ui.mount(menu(surface))
    const docs = await pane.find({ type: 'Markdown' })
    expect(docs?.text).toContain('## Where he goes')
    expect(docs?.text).toContain('He is level **1**')
    await pane.unmount()
  }
})

test('the debug tab cycles moods, levels and friends without touching stats', async ($, on) => {
  engine(on)

  await pressInMenu($, 'tab-debug', 'mood-next')
  expect(await moodLine($, 'desktop')).toBe('Thinking…')

  await pressInMenu($, 'mood-next', 'mood-next')
  expect(await moodLine($, 'desktop')).toBe('Writing code')
  expect(await roomSource($)).toContain('>30%"')

  await pressInMenu($, 'mood-prev')
  expect(await moodLine($, 'desktop')).toBe('Reading files')

  await pressInMenu($, 'level-up', 'level-up', 'level-up', 'level-up', 'level-up', 'level-up', 'level-up')
  const source = await roomSource($)
  expect(source).toContain('Lv 8 · 0 turns')
  expect(source).toContain('class="fish"')
  expect(source).toContain('class="bulb"')

  await pressInMenu($, 'weather', 'weather', 'weather')
  expect(await roomSource($)).toContain('class="bolt"')

  await pressInMenu($, 'friends', 'friends', 'friends', 'friends')
  expect(count(await roomSource($), /class="friend"/g)).toBe(3)

  await pressInMenu($, 'reset')
  expect(await moodLine($, 'desktop')).toBe('Hanging out')
  const reset = await roomSource($)
  expect(reset).toContain('Lv 1 · 0 turns')
  expect(reset).not.toContain('class="fish"')
  expect(reset).not.toContain('class="friend"')
})

test('the wardrobe only dresses him in what his real level unlocked', async ($, on) => {
  engine(on)

  await pressInMenu($, 'tab-wardrobe', 'wear-beanie')
  expect(await roomSource($)).not.toContain('#3d6fb6')

  // A debug level previews the room but must not dress him for keeps.
  await pressInMenu($, 'tab-debug', 'level-up', 'level-up', 'tab-wardrobe', 'wear-beanie')
  expect(await roomSource($)).not.toContain('#3d6fb6')
})

test('a real level 3 can wear the beanie, and take it off', async ($, on) => {
  engine(on, { stored: { stats: { name: 'Clawd', turns: 25, outfit: null } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await pressInMenu($, 'tab-wardrobe', 'wear-beanie')
  expect(await roomSource($)).toContain('#3d6fb6')

  await pressInMenu($, 'wear-none')
  expect(await roomSource($)).not.toContain('#3d6fb6')
})

test('the room is sized to the band, and the width calibration is kept', async ($, on) => {
  engine(on)
  const width = async () => {
    const ui = await $.ui.mount(band('desktop'))
    const svg = await ui.find({ type: 'Svg' })
    await ui.unmount()

    return svg?.props.width
  }

  // 80 columns, less the padding's two, at 7.8px a column.
  expect(await width()).toBe(608)

  await pressInMenu($, 'tab-debug', 'fit-up', 'fit-up')
  expect(await width()).toBe(639)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await width()).toBe(639)
})

// A Bash call that a test hook beneath the plugin answers with `result`.
function bash(on: On, result: Record<string, unknown>, isError = false) {
  on('tool.call', () => (isError ? { isError: true as const, result } : { result }))
}

test('passing tests get a confetti dance that ends on its own', async ($, on) => {
  const clock = engine(on, { tools: false })
  bash(on, { stdout: 'Tests: 12 passed', stderr: '', interrupted: false })

  await $.tool.call({ tool: 'Bash', command: 'npm test -- --runInBand' })
  expect(await moodLine($, 'desktop')).toBe('Tests pass! Party time')
  expect(await roomSource($)).toContain('class="confetti"')

  await clock.advance(7000)
  expect(await moodLine($, 'desktop')).toBe('Hanging out')
  expect(await roomSource($)).not.toContain('class="confetti"')
})

test('failing tests and other commands get no dance', async ($, on) => {
  engine(on, { tools: false })
  let isError = true
  on('tool.call', () => (isError ? { isError: true as const, result: { stdout: '', stderr: 'FAIL' } } : { result: { stdout: 'ok' } }))

  await $.tool.call({ tool: 'Bash', command: 'npx vitest run' })
  isError = false
  await $.tool.call({ tool: 'Bash', command: 'ls -la' })

  expect(await moodLine($, 'desktop')).toBe('Hanging out')
})

test('commits hang as polaroids, newest first, three at most, and are kept', async ($, on) => {
  engine(on, { tools: false })
  let n = 0
  on('tool.call', () => {
    n += 1
    const sha = `${n}abcdef${n}`.padEnd(7, '0')

    return { result: { stdout: `[main ${sha}] Commit number ${n}\n 1 file changed`, gitOperation: { commit: { sha, kind: 'committed' } } } }
  })

  for (let i = 0; i < 4; i += 1) {
    await $.tool.call({ tool: 'Bash', command: `git commit -m "Commit number ${i + 1}"` })
  }

  const source = await roomSource($)
  expect(count(source, TITLES)).toBe(3)
  expect(source.indexOf('Commit number 4')).toBeLessThan(source.indexOf('Commit number 3'))
  expect(source).not.toContain('Commit number 1')

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(count(await roomSource($), TITLES)).toBe(3)
})

test('opening a PR earns a party hat until midnight', async ($, on) => {
  const clock = engine(on, { tools: false })
  bash(on, { stdout: 'https://github.com/o/r/pull/7', gitOperation: { pr: { number: 7, action: 'created' } } })

  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  expect(await roomSource($)).toContain('#e5534b"/><path d="M8.9,5.2')

  // 14:00 plus nine hours is still today; eleven is past midnight.
  await clock.advance(9 * 60 * 60 * 1000)
  expect(await roomSource($)).toContain('M8.9,5.2')

  await clock.advance(2 * 60 * 60 * 1000)
  expect(await roomSource($)).not.toContain('M8.9,5.2')
})

test('debug triggers show the celebrations without real ones', async ($, on) => {
  engine(on)

  await pressInMenu($, 'tab-debug', 'celebrate', 'polaroids', 'polaroids', 'polaroids', 'party-hat')
  const source = await roomSource($)
  expect(await moodLine($, 'desktop')).toBe('Tests pass! Party time')
  expect(count(source, TITLES)).toBe(2)
  expect(source).toContain('M8.9,5.2')

  await pressInMenu($, 'reset')
  expect(count(await roomSource($), TITLES)).toBe(0)
})

test('a redraw mid-walk carries the walk on instead of restarting it', async ($, on) => {
  const clock = engine(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  await $.tool.call({ tool: 'Read', file_path: '/x' })
  await clock.advance(600)

  expect(await roomSource($)).toContain('data-walk="60%>14%" data-begin="-0.60s"')
})

test('waking walks him from the bed even when a turn starts right after', async ($, on) => {
  const clock = engine(on)

  await $.turn.complete({ answer: 'done', reason: 'answer', isAborted: false, durationMs: 1000, turnId: 't0' })
  await clock.advance(11 * 60 * 1000)
  expect(await moodLine($, 'desktop')).toBe('Zzz…')

  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'hi', turnId: 't1' })

  expect(await roomSource($)).toContain('data-walk="100%>60%"')
})

test('a plan approval does not leave him waiting for the rest of the turn', async ($, on) => {
  engine(on, { tools: false })
  on('tool.call', async () => {
    await $.classic.PermissionRequest({ tool_name: 'ExitPlanMode', tool_input: {} })

    return { result: {} }
  })

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'ExitPlanMode' })

  expect(await moodLine($, 'desktop')).toBe('Thinking…')
})

test('a message typed into a running turn does not clear waiting', async ($, on) => {
  engine(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm x' } })
  await $.prompt.submit({ text: 'also this', turnId: 't1', wait: false, origin: { kind: 'composer' } })

  expect(await moodLine($, 'desktop')).toBe(WAITING)
})

test('a subagent heard only through its tool calls still visits', async ($, on) => {
  engine(on)

  await $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'agent-9' })
  expect(count(await roomSource($), /class="friend"/g)).toBe(1)
})

const asStats = (turns: number, lastTidyTurn: number) => ({ stats: { name: 'Clawd', turns, outfit: null, lastTidyTurn } })

test('he knocks when he starts waiting, again every few minutes, and stops once answered', async ($, on) => {
  const played: string[] = []
  const clock = engine(on, { played })

  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm x' } })
  await $.classic.PermissionRequest({ tool_name: 'Write', tool_input: {} })
  expect(played).toEqual(['sounds/knock.wav'])

  await clock.advance(3 * 60 * 1000)
  expect(played).toEqual(['sounds/knock.wav', 'sounds/knock.wav'])

  await $.tool.call({ tool: 'Bash', command: 'rm x' })
  await $.tool.call({ tool: 'Write', file_path: '/x', content: '' })
  await clock.advance(10 * 60 * 1000)
  expect(played).toEqual(['sounds/knock.wav', 'sounds/knock.wav'])
})

test('a muted pet knocks without sound', async ($, on) => {
  const played: string[] = []
  engine(on, { played })

  await pressInMenu($, 'sound')
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm y' } })
  expect(played).toEqual([])
  expect(await roomSource($)).toContain('class="closeup"')
})

test('waiting brings him up to the glass with the room frosted behind', async ($, on) => {
  engine(on)

  expect(await roomSource($)).not.toContain('class="closeup"')
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm x' } })

  const source = await roomSource($)
  expect(source).toContain('fill="#f4efe6" opacity=".38"')
  expect(source).toContain('class="closeup"')
  expect(count(source, /class="ripple"/g)).toBe(2)
  expect(source).toContain('fill="url(#glass)"')
  // He is at the glass, not also standing on the rug.
  expect(count(source, /class="clawd"/g)).toBe(0)

  await $.tool.call({ tool: 'Bash', command: 'rm x' })
  const after = await roomSource($)
  expect(after).not.toContain('class="closeup"')
  expect(after).not.toContain('fill="#f4efe6" opacity=".38"')
})

test('passing tests get the confetti dance, with no sound', async ($, on) => {
  const played: string[] = []
  engine(on, { tools: false, played })
  on('tool.call', () => ({ result: { stdout: 'ok' } }))

  await $.tool.call({ tool: 'Bash', command: 'pnpm test' })
  expect(played).toEqual([])
  expect(await moodLine($, 'desktop')).toMatch(/Tests pass/)
})

test('mute is kept across sessions and set by /pet mute', async ($, on) => {
  const played: string[] = []
  engine(on, { tools: false, played })
  on('tool.call', () => ({ result: { stdout: 'ok' } }))

  await $.command.run({ command: 'pet', args: 'mute', origin: { kind: 'composer' }, presentation: { isFullscreen: false } } as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'cargo test' })

  expect(played).toEqual([])
  const pane = await $.ui.mount(menu('desktop'))
  expect((await pane.find({ key: 'sound' }))?.text).toBe('🔕 Sound off')
  await pane.unmount()
})

test('one piece of mess per uncommitted file, recounted after Claude edits, sixteen at most', async ($, on) => {
  const git = { stdout: ' M a.ts\n M b.ts\n?? c.ts\n' }
  const clock = engine(on, { git })
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  expect(count(await roomSource($), /class="mess"/g)).toBe(3)
  expect(await roomSource($)).toContain('3 uncommitted files')

  git.stdout += ' M d.ts\n'
  await $.tool.call({ tool: 'Edit', file_path: '/repo/d.ts', old_string: 'a', new_string: 'b' })
  await clock.advance(2000)
  // The fourth piece is the sock.
  const after = await roomSource($)
  expect(count(after, /class="mess"/g)).toBe(4)
  expect(after).toContain('#7fb3d5"/><rect x="0" y="27.6"')

  git.stdout = Array.from({ length: 30 }, (_, i) => ` M f${i}.ts`).join('\n')
  await $.tool.call({ tool: 'Bash', command: 'npm run gen' })
  await clock.advance(2000)
  expect(count(await roomSource($), /class="mess"/g)).toBe(16)
  expect(await roomSource($)).toContain('30 uncommitted files')
})

test('old stats start with a clean floor', async ($, on) => {
  engine(on, { stored: { stats: { name: 'Clawd', turns: 40, outfit: null } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(await roomSource($)).not.toContain('#f4f1ea')
})

test('a commit sweeps the mess away with a broom', async ($, on) => {
  const git = { stdout: ' M a.ts\n M b.ts\n M c.ts\n M d.ts\n' }
  const clock = engine(on, { tools: false, git })
  on('tool.call', () => {
    git.stdout = ''

    return { result: { stdout: '[main abc1234] Ship it', gitOperation: { commit: { sha: 'abc1234', kind: 'committed' } } } }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.tool.call({ tool: 'Bash', command: 'git commit -m "Ship it"' })
  const sweeping = await roomSource($)
  expect(await moodLine($, 'desktop')).toBe('Tidying up after that commit')
  expect(count(sweeping, /class="swept"/g)).toBe(4)
  expect(sweeping).toContain('class="broom"')

  await clock.advance(4000)
  const clean = await roomSource($)
  expect(clean).not.toContain('class="swept"')
  expect(clean).not.toContain('#f4f1ea')
  expect(await moodLine($, 'desktop')).toBe('Hanging out')
})

test('debug mess and sweep leave his real count alone', async ($, on) => {
  const clock = engine(on, { stored: asStats(5, 5) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await pressInMenu($, 'tab-debug', 'mess', 'mess', 'mess', 'mess')
  expect(await roomSource($)).toContain('#f4f1ea')

  await pressInMenu($, 'sweep')
  expect(count(await roomSource($), /class="swept"/g)).toBe(3)

  await clock.advance(4000)
  await pressInMenu($, 'reset')
  expect(await roomSource($)).not.toContain('#f4f1ea')
})

test('a spawned subagent gets a name tag and its task on hover', async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'agent-7' }))

  await $.agent.spawn({ prompt: 'Look for the refund handlers', description: 'Find refund handlers', subagentType: 'Explore', background: true } as never)

  const source = await roomSource($)
  expect(count(source, /class="friend"/g)).toBe(1)
  expect(source).toContain('>Explore</text>')
  expect(source).toContain('<title>Explore: Find refund handlers</title>')
})

test('a long agent type is cut on its tag, and an unknown one has none', async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'agent-8' }))

  await $.agent.spawn({ prompt: 'x', description: 'Review', subagentType: 'product-tracking-skills:tracking-watchdog', background: true } as never)
  await $.turn.start({ text: 'help', turnId: 'b', agentId: 'agent-9' })

  const source = await roomSource($)
  expect(source).toContain('>tracking-wa…</text>')
  expect(count(source, /class="friend"/g)).toBe(2)
  expect(count(source, TITLES)).toBe(1)
})

test('debug friends wear sample tags', async ($, on) => {
  engine(on)

  await pressInMenu($, 'tab-debug', 'friends', 'friends', 'friends', 'friends')
  const source = await roomSource($)
  expect(source).toContain('>Explore</text>')
  expect(source).toContain('<title>Plan: Run the test suite</title>')
})

const finish = (agentId: string, answer: string) => ({ answer, reason: 'answer' as const, isAborted: false, durationMs: 10, turnId: `t-${agentId}`, agentId })

test('a finished friend pins a note in its color with the first line of its report', async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'agent-1' }))

  await $.agent.spawn({ prompt: 'x', description: 'Find refund handlers', subagentType: 'Explore', background: true } as never)
  // Working, not finished: no note on the board yet.
  expect(await roomSource($)).not.toContain('<path d="M2.4,3.2')

  await $.turn.complete(finish('agent-1', '\n- **Found** 3 handlers in `Order/`\nThe rest of the report'))
  const source = await roomSource($)
  expect(source).toContain('<title>Explore: Found 3 handlers in Order/</title>')
  expect(source).toContain('class="notepop"')
  expect(source).toContain('fill="#7fb3d5"/><path d="M2.4,3.2')
})

test('the board keeps five notes, the oldest falls off, and they are kept', async ($, on) => {
  const clock = engine(on)

  for (let i = 1; i <= 6; i += 1) {
    await $.turn.start({ text: 'help', turnId: `s${i}`, agentId: `agent-${i}` })
    await $.turn.complete(finish(`agent-${i}`, `Report number ${i}`))
  }

  const full = await roomSource($)
  // Five pinned and hoverable; the sixth's oldest is falling off, not hoverable.
  expect(count(full, /<title>Report number \d<\/title>/g)).toBe(5)
  expect(full).toContain('class="notefall"')
  expect(full.indexOf('Report number 2<')).toBeLessThan(full.indexOf('Report number 6<'))

  await clock.advance(2000)
  const settled = await roomSource($)
  expect(settled).not.toContain('class="notefall"')
  expect(settled).not.toContain('Report number 1<')
  expect(count(settled, /<title>Report number \d<\/title>/g)).toBe(5)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(count(await roomSource($), /<title>Report number \d<\/title>/g)).toBe(5)
})

test('an empty report still leaves a note, and a long one is cut', async ($, on) => {
  engine(on)

  await $.turn.start({ text: 'help', turnId: 'a', agentId: 'agent-a' })
  await $.turn.complete(finish('agent-a', '   \n\n'))
  await $.turn.start({ text: 'help', turnId: 'b', agentId: 'agent-b' })
  await $.turn.complete(finish('agent-b', `# ${'word '.repeat(60)}`))

  const source = await roomSource($)
  expect(source).toContain('<title>(no report)</title>')
  expect(source).toMatch(/<title>(word ){27}word…<\/title>/)
})

test('debug sticky notes preview the board', async ($, on) => {
  engine(on)

  await pressInMenu($, 'tab-debug', 'notes', 'notes', 'notes', 'notes')
  const source = await roomSource($)
  expect(count(source, TITLES)).toBe(3)
  expect(source).toContain('<title>Plan: Four steps: types, reconcile, tests, docs</title>')
  expect(source).not.toContain('class="notepop"')

  await pressInMenu($, 'reset')
  expect(count(await roomSource($), TITLES)).toBe(0)
})

test('his XP survives a new session, and a reply like "yes" earns none', async ($, on) => {
  engine(on, { stored: { stats: { name: 'Clawd', turns: 18, outfit: null, lastTidyTurn: 18, xp: 24 } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await roomSource($)).toContain('Lv 2 · 18 turns')

  await $.prompt.submit(say('yes'))
  await $.turn.complete({ answer: 'done', reason: 'answer', isAborted: false, durationMs: 10, turnId: 't1' })
  expect(await roomSource($)).toContain('Lv 2 · 19 turns')

  await $.prompt.submit(say('Add a retry to fetchOrders in orders.ts'))
  await $.turn.complete({ answer: 'done', reason: 'answer', isAborted: false, durationMs: 10, turnId: 't2' })
  expect(await roomSource($)).toContain('Lv 3 · 20 turns')

  // A new session reads what the last one saved.
  await $.session.start({ cwd: '/elsewhere', surface: 'desktop', isInteractive: true })
  expect(await roomSource($)).toContain('Lv 3 · 20 turns')
})

test('every month maps to its season', () => {
  expect(Array.from({ length: 12 }, (_, i) => seasonOf(i + 1))).toEqual([
    'winter',
    'valentine',
    'spring',
    'spring',
    'spring',
    'summer',
    'summer',
    'summer',
    'autumn',
    'halloween',
    'autumn',
    'christmas',
  ])
})

test('in October there is a jack-o\'-lantern and bats, and the pumpkin glows at night', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const day = await roomSource($)
  expect(day).toContain('fill="#e8812a"/><ellipse cx="7" cy="26"')
  // Two bats glide over now and then, one sleeps on the ceiling.
  expect(count(day, /class="flap"/g)).toBe(2)
  expect(count(day, /class="hang"/g)).toBe(1)
  // Across the 608px room and out of sight for the rest of each minute, in CSS.
  expect(day).toContain('@keyframes bat-0{0%{transform:translate(-20px,26px)}35%,100%{transform:translate(628px,26px)}}')
  expect(day).toContain('.bat-0{animation:bat-0 60s linear -8s infinite}')
  expect(day).not.toContain('<animate ')
  // In front of the window, shelf, board and bed; behind Clawd.
  const bats = day.indexOf('class="hang"')
  expect(bats).toBeGreaterThan(day.indexOf('clip-path="url(#win)"'))
  expect(bats).toBeGreaterThan(day.indexOf('fill="#d4a76a"'))
  expect(bats).toBeGreaterThan(day.indexOf('translate(-140 0)'))
  expect(bats).toBeLessThan(day.indexOf('class="clawd"'))
  expect(day).toContain('fill="#5b3410"/>')

  await clock.set(new Date(2026, 9, 22, 23).getTime())
  expect(await roomSource($)).toContain('fill="#ffd166"/>')
})

test('the calendar turns to December: snow, a scarf and a little tree', async ($, on) => {
  engine(on, { now: new Date(2026, 11, 3, 10).getTime() })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const source = await roomSource($)
  expect(source).not.toContain('class="flap"')
  expect(source).toContain('class="flake"')
  expect(source).toContain('fill="#c0392b"/><rect x="7" y="13"')
  expect(source).toContain('fill="#256640"/>')
})

test('the Debug season toggle previews each season', async ($, on) => {
  engine(on)
  const marks: Record<string, string> = {
    winter: 'class="flake"',
    valentine: 'fill="#f4a3c4"/>',
    spring: 'class="wing"',
    summer: 'class="rock"',
    autumn: 'class="leaf"',
    halloween: 'class="hang"',
    christmas: 'fill="#256640"/>',
  }
  const seen: string[] = []

  await pressInMenu($, 'tab-debug')

  for (const name of Object.keys(marks)) {
    await pressInMenu($, 'season')
    const source = await roomSource($)
    const pane = await $.ui.mount(menu('desktop'))
    seen.push(String((await pane.find({ key: 'season' }))?.text))
    await pane.unmount()
    expect(source).toContain(marks[name] ?? '')
  }

  expect(seen).toEqual(Object.keys(marks).map(name => `Season: ${name}`))

  // Summer nights have fireworks.
  // From christmas: auto, winter, valentine, spring, summer.
  await pressInMenu($, 'season', 'season', 'season', 'season', 'season', 'phase', 'phase', 'phase', 'phase')
  expect(await roomSource($)).toContain('class="burst"')
})

const say = (text: string, kind: 'sdk' | 'composer' | 'task-notification' = 'sdk', turnId?: string) =>
  ({ text, wait: false, origin: { kind }, ...(turnId === undefined ? {} : { turnId }) }) as never

test('the rules read clarity, not spelling', () => {
  expect(readPrompt('fix it').feeling).toBe('confused')
  expect(readPrompt('make it better').feeling).toBe('confused')
  expect(readPrompt('yes').feeling).toBeNull()
  expect(readPrompt('go ahead').feeling).toBeNull()
  expect(readPrompt('2').feeling).toBeNull()
  expect(readPrompt('/compact').feeling).toBeNull()

  const clear = readPrompt('Fix the null check in functions/models/Order/reconcile.ts so the reconcile tests pass')
  expect(clear.feeling).toBe('proud')
  expect(clear.habits).toEqual(['context', 'verify'])

  // Typos and no capitals, but it names the file: not vague.
  expect(readPrompt('fix teh nul chek in reconcile.ts its brokn').isVague).toBe(false)

  expect(readPrompt('Plan how to split the Order model before you change anything').feeling).toBe('calm')
  expect(readPrompt('Rename the helpers, for example getSavedByItem becomes savedByItemOf').feeling).toBe('inspired')
  expect(readPrompt('update the docs and also the tests and then the types plus the README and also bump the version').feeling).toBe('overwhelmed')
  expect(readPrompt('that worked, now do the same for refunds').feeling).toBe('content')
  expect(readPrompt('no, not that one').isCorrection).toBe(true)
})

test('history weighs in: vague twice is grumpy, redirects make him dizzy', () => {
  expect(weigh(readPrompt('fix it'), { vagueStreak: 1, redirects: 0 }).feeling).toBe('grumpy')
  expect(weigh(readPrompt('no, wrong file'), { vagueStreak: 0, redirects: 2 }).feeling).toBe('dizzy')
})

test('a vague prompt confuses him, with a tip; a second makes him grumpy', async ($, on) => {
  engine(on)

  await $.prompt.submit(say('fix it'))
  const once = await roomSource($)
  expect(once).toContain('class="emote"><text')
  expect(once).toContain('💡 Name the file or function, and what done looks like')

  await $.prompt.submit(say('make it work'))
  expect(await roomSource($)).toContain('💡 Still vague: say where, what, and how to check it')

  await $.prompt.submit(say('Fix the null check in reconcile.ts so the reconcile tests pass'))
  const proud = await roomSource($)
  expect(proud).toContain('💡 Clear target and a way to verify. Nice')
  expect(count(proud, /class="pop" d=/g)).toBeGreaterThanOrEqual(3)
})

test('the feeling fades a couple of minutes after the turn, and a reply clears nothing', async ($, on) => {
  const clock = engine(on)

  await $.prompt.submit(say('fix it'))
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await $.prompt.submit(say('yes', 'sdk', 't1'))
  expect(await roomSource($)).toContain('class="emote"')

  await $.turn.complete({ answer: 'done', reason: 'answer', isAborted: false, durationMs: 10, turnId: 't1' })
  await clock.advance(60 * 1000)
  expect(await roomSource($)).toContain('class="emote"')

  await clock.advance(2 * 60 * 1000)
  expect(await roomSource($)).not.toContain('class="emote"')
})

test('two interrupts in a row make him dizzy', async ($, on) => {
  engine(on)

  for (const turnId of ['a', 'b']) {
    await $.turn.start({ text: 'go', turnId })
    await $.turn.complete({ answer: '', reason: 'aborted', isAborted: true, durationMs: 10, turnId })
  }

  expect(await roomSource($)).toContain('💡 Lots of redirects: state your constraints up front')
})

test('only what the person typed is coached', async ($, on) => {
  engine(on)

  await $.prompt.submit(say('fix it', 'task-notification'))
  expect(await roomSource($)).not.toContain('class="emote"')

  await $.prompt.submit(say('fix it', 'composer'))
  expect(await roomSource($)).toContain('class="emote"')
})

test('prompt craft grows, earns badges, and is kept across sessions', async ($, on) => {
  const toasts: string[] = []
  engine(on, { toasts })

  for (let i = 0; i < 10; i += 1) {
    await $.prompt.submit(say(`Update functions/models/Order/step${i}.ts so its tests pass`))
  }

  expect(toasts).toContain('Badge earned: Context Giver')
  expect(toasts).toContain("Prompt craft: you're now an Apprentice")
  expect(await roomSource($)).toContain('you: Apprentice')

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await roomSource($)).toContain('you: Apprentice')

  await pressInMenu($, 'tab-coach')
  const pane = await $.ui.mount(menu('desktop'))
  const coach = await pane.find({ type: 'Markdown' })
  await pane.unmount()
  expect(coach?.text).toContain('## You: Apprentice')
  expect(coach?.text).toContain('🏅 Context Giver')
  expect(coach?.text).toContain('10 prompts read, 100% of them clear.')
})

test('the meters sit under the room: context and both limits, colored by how full', async ($, on) => {
  engine(on)

  await $.session.measure({
    context: { window: 200000, tokens: 124000, percent: 62 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 81.5, resetsAt: '2026-10-22T19:40:00Z' },
      { kind: 'seven_day', percentUsed: 12, resetsAt: '2026-10-27T09:00:00Z' },
    ],
    changed: ['context', 'rateLimits'],
  })

  const ui = await $.ui.mount(band('desktop'))
  const texts = (await ui.findAll({ type: 'Text' })).map(one => one.text).filter(text => /^(ctx|5h|wk) \S/.test(text))
  const colors = (await ui.findAll({ type: 'Text' })).filter(one => one.props.color === 'warning').map(one => one.text)
  const svgs = (await ui.findAll({ type: 'Svg' })).map(one => String(one.props.source))
  await ui.unmount()

  expect(texts[0]).toBe('ctx 62%')
  expect(texts[1]).toMatch(/^5h 82% · resets \d+:40 [AP]M$/)
  expect(texts[2]).toBe('wk 12%')
  expect(colors).toEqual([expect.stringMatching(/^82%/)])
  // Nothing of them is left in the room's drawing.
  expect(svgs.some(one => one.includes('62%'))).toBe(false)
})

test('a nearly full context nudges toward /compact, and a limit past 90% toasts once', async ($, on) => {
  const toasts: string[] = []
  engine(on, { toasts })
  const reading = (context: number, session: number) =>
    $.session.measure({
      context: { window: 200000, percent: context },
      rateLimits: [{ kind: 'five_hour', percentUsed: session }],
      changed: ['context', 'rateLimits'],
    })

  await reading(86, 91)
  await reading(88, 93)

  expect(await roomSource($)).toContain('💡 Context is 86% full: /compact, or start fresh')
  expect(toasts).toEqual(['Clawd: your session limit is 91% used'])
})

test('debug feelings preview each reaction', async ($, on) => {
  engine(on)

  await pressInMenu($, 'tab-debug', 'feeling', 'feeling')
  expect(await roomSource($)).toContain('💡 Still vague: say where, what, and how to check it')
})

// The Coach tab's words: its Markdown and every Text, in order.
async function coachText($: Engine) {
  const pane = await $.ui.mount(menu('desktop'))
  const markdown = (await pane.find({ type: 'Markdown' }))?.text ?? ''
  const texts = (await pane.findAll({ type: 'Text' })).map(one => one.text)
  await pane.unmount()

  return [markdown, ...texts].join('\n')
}

test('rewrites are off by default: a vague prompt asks Haiku nothing', async ($, on) => {
  const asked: { model: string; prompt: unknown }[] = []
  const clock = engine(on, { asked })

  await $.prompt.submit(say('fix it'))
  await clock.settle()

  expect(asked).toEqual([])
  expect(await roomSource($)).not.toContain('hover for a rewrite')
  await pressInMenu($, 'tab-coach')
  expect(await coachText($)).toContain('Off. Turn them on above')
})

test('turned on, a vague prompt gets a rewrite on hover and in the Coach tab', async ($, on) => {
  const asked: { model: string; prompt: unknown; system?: unknown }[] = []
  const clock = engine(on, { asked })

  await pressInMenu($, 'tab-coach', 'rewrites')
  await $.prompt.submit(say('make the refunds thing work'))
  await clock.settle()

  expect(asked).toHaveLength(1)
  expect(asked[0]?.model).toBe('haiku')
  expect(String(asked[0]?.prompt)).toContain('make the refunds thing work')
  expect(String(asked[0]?.system)).toContain('[which file]')

  const source = await roomSource($)
  expect(source).toContain('<title>Try: Fix [what is broken] in [which file] so [expected behavior]; check by [how to verify].</title>')
  expect(source).toContain('· ✍ hover for a rewrite')

  const coach = await coachText($)
  expect(coach).toContain('You wrote: make the refunds thing work')
  expect(coach).toContain('Try: Fix [what is broken]')
})

test('a clear prompt is not sent for a rewrite', async ($, on) => {
  const asked: { model: string; prompt: unknown }[] = []
  const clock = engine(on, { asked })

  await $.command.run({ command: 'pet', args: 'rewrites on', origin: { kind: 'composer' }, presentation: { isFullscreen: false } } as never)
  await $.prompt.submit(say('Fix the null check in reconcile.ts so the reconcile tests pass'))
  await clock.settle()

  expect(asked).toEqual([])
})

test('the toggle is kept, and a failed rewrite leaves the tip alone', async ($, on) => {
  const asked: { model: string; prompt: unknown }[] = []
  const clock = engine(on, { asked, reply: null })

  await $.command.run({ command: 'pet', args: 'rewrites on', origin: { kind: 'composer' }, presentation: { isFullscreen: false } } as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit(say('fix it'))
  await clock.settle()

  expect(asked).toHaveLength(1)
  const source = await roomSource($)
  expect(source).toContain('💡 Name the file or function, and what done looks like</text>')
  expect(source).not.toContain('<title>Try:')
})

const REWRITE = 'Fix [what is broken] in [which file] so [expected behavior]; check by [how to verify].'

// A vague prompt with rewrites on, then Use this rewrite pressed in Coach.
async function useFirstRewrite($: Engine, clock: { settle: () => Promise<void> }) {
  await pressInMenu($, 'tab-coach', 'rewrites')
  await $.prompt.submit(say('fix it'))
  await clock.settle()
  await pressInMenu($, 'use-rewrite-0')
}

test('Use this rewrite puts it in the prompt box as a draft, after what is there', async ($, on) => {
  const toasts: string[] = []
  const clock = engine(on, { toasts })
  const fills: { text: string; mode?: string }[] = []
  on('prompt.read', () => ({ value: { text: 'my half-typed draft', cursor: 19 } as never }))
  on('prompt.fill', (_, e) => {
    fills.push({ text: e.text, mode: e.mode })

    return { isFilled: true }
  })

  await useFirstRewrite($, clock)

  expect(fills).toEqual([{ text: `\n\n${REWRITE}`, mode: 'append' }])
  expect(toasts).toContain('Rewrite is in your prompt box: fill in the [placeholders], then send')
})

test('where the box cannot take it, the rewrite goes to the clipboard', async ($, on) => {
  const toasts: string[] = []
  const piped: string[] = []
  const clock = engine(on, { toasts, piped })
  on('prompt.fill', () => ({ isFilled: false, refusal: 'no_composer' as const }))
  on('ui.copy', () => ({ value: { isCopied: false, reason: 'no-path' } as never }))

  await useFirstRewrite($, clock)

  expect(piped).toEqual([`pbcopy <- ${REWRITE}`])
  expect(toasts).toContain('Rewrite copied: paste it into your prompt box, fill in the [placeholders], then send')
})

test('sending the rewrite with its placeholders filled earns craft; with brackets left it does not', async ($, on) => {
  const toasts: string[] = []
  const clock = engine(on, { toasts })
  on('prompt.fill', () => ({ isFilled: true }))

  await useFirstRewrite($, clock)
  await $.prompt.submit(say('Fix the [which file] in reconcile.ts so [expected behavior]; check by running the tests.'))
  expect(await roomSource($)).toContain('💡 Fill in [which file] and [expected behavior] before sending')

  await pressInMenu($, 'use-rewrite-0')
  await $.prompt.submit(say('Fix the null refund total in reconcile.ts so liability matches Shopify; check by running the reconcile tests.'))
  expect(await roomSource($)).toContain('💡 You filled in the rewrite: +3 craft')

  await pressInMenu($, 'tab-coach')
  const coach = await coachText($)
  expect(coach).toContain('| Rewriter | sent a suggested rewrite with its placeholders filled in | 1/3 |')
})

test('three filled rewrites earn the Rewriter badge', async ($, on) => {
  const toasts: string[] = []
  const clock = engine(on, { toasts })
  on('prompt.fill', () => ({ isFilled: true }))

  await useFirstRewrite($, clock)

  for (let i = 0; i < 3; i += 1) {
    await pressInMenu($, 'use-rewrite-0')
    await $.prompt.submit(say(`Fix the refund total in step${i}.ts so liability matches; check by running its tests.`))
  }

  expect(toasts).toContain('Badge earned: Rewriter')
})

test('an unrelated prompt after Use this rewrite is read as usual', async ($, on) => {
  const clock = engine(on)
  on('prompt.fill', () => ({ isFilled: true }))

  await useFirstRewrite($, clock)
  await $.prompt.submit(say('Plan how to split the Order model before you change anything'))

  expect(await roomSource($)).toContain('💡 Planning first keeps big changes on track')
})

test('while the app holds the band, its card stays on top and the room shows under it', async ($, on) => {
  engine(on)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...band(surface), props: { ...band(surface).props, hasSurvey: true } })
    const all = await ui.findAll({})
    const card = all.findIndex(one => one.type === 'Text' && one.text === 'engine')
    const room = all.findIndex(one => (surface === 'desktop' ? one.type === 'Svg' : one.type === 'Text' && /\(•ᴗ•\)/.test(one.text)))
    await ui.unmount()

    expect(card).toBeGreaterThanOrEqual(0)
    expect(room).toBeGreaterThan(card)
  }
})

test('a hidden pet leaves the held band to the app alone', async ($, on) => {
  engine(on)

  await $.command.run({ command: 'pet', args: 'hide', origin: { kind: 'composer' }, presentation: { isFullscreen: false } } as never)
  const ui = await $.ui.mount({ ...band('desktop'), props: { ...band('desktop').props, hasSurvey: true } })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('the Coach tab offers four starter templates', async ($, on) => {
  engine(on)

  await pressInMenu($, 'tab-coach')
  const pane = await $.ui.mount(menu('desktop'))
  const labels = await Promise.all(['bug', 'feature', 'refactor', 'investigate'].map(async id => (await pane.find({ key: `use-template-${id}` }))?.text))
  const words = (await pane.findAll({ type: 'Text' })).map(one => one.text).join('\n')
  await pane.unmount()

  expect(labels).toEqual(['Use Bug fix', 'Use New feature', 'Use Refactor', 'Use Investigate'])
  expect(words).toContain('Bug fix: Fix a bug: [what goes wrong] when [steps or input].')
})

test('a template drafts into the prompt box, and filled in it earns craft toward Templater', async ($, on) => {
  const toasts: string[] = []
  engine(on, { toasts })
  const fills: string[] = []
  on('prompt.fill', (_, e) => {
    fills.push(e.text)

    return { isFilled: true }
  })

  await pressInMenu($, 'tab-coach', 'use-template-bug')
  expect(fills[0]).toMatch(/^Fix a bug: \[what goes wrong\]/)
  expect(toasts).toContain('Template is in your prompt box: fill in the [placeholders], then send')

  await $.prompt.submit(
    say(
      "Fix a bug: the refund total doubles when a line item is refunded twice. Expected: it counts once. It's in calculateLiabilityTotal.ts; the error is none. Make the smallest fix, add a test that fails before it, and check by running npm test.",
    ),
  )
  expect(await roomSource($)).toContain('💡 You filled in the template: +3 craft')

  for (const id of ['refactor', 'investigate']) {
    await pressInMenu($, `use-template-${id}`)
    const template = fills[fills.length - 1] ?? ''
    await $.prompt.submit(say(template.replace(/\[[^\]]+\]/g, 'the reconcile module')))
  }

  expect(toasts).toContain('Badge earned: Templater')
})

test('a template sent with its brackets still in is pointed out, not credited', async ($, on) => {
  engine(on)
  on('prompt.fill', () => ({ isFilled: true }))

  await pressInMenu($, 'tab-coach', 'use-template-feature')
  await $.prompt.submit(say("Add dark mode to [file or module] so that [who] can switch themes. Done when the toggle works. Follow the pattern in [similar existing code], and don't change the API. Verify with npm test."))

  expect(await roomSource($)).toContain('💡 Fill in [file or module] and [who] before sending')
})

async function journalText($: Engine) {
  await pressInMenu($, 'tab-journal')
  const pane = await $.ui.mount(menu('desktop'))
  const text = (await pane.find({ type: 'Markdown' }))?.text ?? ''
  await pane.unmount()

  return text
}

test('an entry reads the day back in his voice', () => {
  expect(entry(EMPTY_DAY, true)).toBe('Nothing yet today. I’m ready when you are.')

  const busy = entry(
    {
      ...EMPTY_DAY,
      turns: 14,
      commits: [{ sha: 'abc1234', message: 'Page refund line items past the first 25' }],
      testsPassed: 2,
      prs: 1,
      friends: [{ kind: 'Explore', line: 'Found 3 refund handlers' }],
      prompts: 10,
      clear: 9,
      tips: { 'Name the file or function, and what done looks like': 1 },
      badges: ['Context Giver'],
      levels: [2],
    },
    false,
  )

  expect(busy).toContain('A busy one. We finished 14 turns together.')
  expect(busy).toContain('You committed 1 time: “Page refund line items past the first 25”.')
  expect(busy).toContain('The tests passed 2 times, so I danced 2 times.')
  expect(busy).toContain('You opened a PR, so I wore my party hat.')
  expect(busy).toContain('1 friend visited. Explore reported “Found 3 refund handlers”.')
  expect(busy).toContain('9 of your 10 prompts were clear (90%). You were so clear I hardly had to guess.')
  expect(busy).toContain('The tip I gave most: “Name the file or function, and what done looks like”.')
  expect(busy).toContain('You earned the **Context Giver** badge!')
  expect(busy).toContain('I reached **level 2**!')
})

test('the journal keeps two weeks', () => {
  const day = { ...EMPTY_DAY, turns: 1 }
  const kept = prune({ '2026-10-08': day, '2026-10-09': day, '2026-10-22': day }, '2026-10-22')

  expect(Object.keys(kept)).toEqual(['2026-10-09', '2026-10-22'])
})

test('the day is tallied as it happens and shows under Today', async ($, on) => {
  const clock = engine(on, { tools: false })
  on('tool.call', (_, e) =>
    e.tool === 'Bash' && String((e as { command?: string }).command).startsWith('git commit')
      ? { result: { stdout: '[main abc1234] Ship the journal', gitOperation: { commit: { sha: 'abc1234', kind: 'committed' } } } }
      : { result: { stdout: 'ok' } },
  )

  await $.prompt.submit(say('fix it'))
  await $.prompt.submit(say('Fix the null check in reconcile.ts so the reconcile tests pass'))
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "Ship the journal"' })
  await $.turn.start({ text: 'help', turnId: 'a', agentId: 'agent-1' })
  await $.turn.complete(finish('agent-1', 'Found 3 refund handlers'))
  await $.turn.complete({ answer: 'done', reason: 'answer', isAborted: false, durationMs: 10, turnId: 't1' })
  await clock.advance(10)

  const text = await journalText($)
  expect(text).toContain('## Today so far · Thursday, Oct 22')
  expect(text).toContain('So far we have finished 1 turn together.')
  expect(text).toContain('You committed 1 time: “Ship the journal”.')
  expect(text).toContain('The tests passed 1 time, so I danced once.')
  expect(text).toContain('1 friend visited. A friend reported “Found 3 refund handlers”.')
  expect(text).toContain('1 of your 2 prompts were clear (50%).')
  expect(text).toContain('The tip I gave most: “Name the file or function, and what done looks like”.')
})

test('past days show newest first, and a new day says he wrote up the last one', async ($, on) => {
  const toasts: string[] = []
  const busy = { ...EMPTY_DAY, turns: 12, prompts: 4, clear: 4 }
  engine(on, {
    toasts,
    stored: { days: { '2026-10-20': { ...EMPTY_DAY, turns: 3 }, '2026-10-21': busy }, lastDay: '2026-10-21' },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(toasts).toContain('Clawd wrote in his journal about Wednesday, Oct 21. Menu → Journal')

  const text = await journalText($)
  expect(text.indexOf('## Wednesday, Oct 21')).toBeLessThan(text.indexOf('## Tuesday, Oct 20'))
  expect(text).toContain('A busy one. We finished 12 turns together.')
  expect(text).toContain('A gentle day. We finished 3 turns together.')
})

test('Debug celebrations stay out of the journal', async ($, on) => {
  engine(on)

  await pressInMenu($, 'tab-debug', 'celebrate')
  expect(await journalText($)).toContain('Nothing yet today.')
})

test('walks take longer the farther they go, and face their way', () => {
  const rug = { pct: 60, ux: 0, uy: 10 }
  const shelf = { pct: 14, ux: 14, uy: 10 }
  const computer = { pct: 46, ux: -14, uy: 10 }

  expect(walkSeconds(rug, rug, 740)).toBe(0)
  expect(walkSeconds(rug, shelf, 740)).toBeGreaterThan(walkSeconds(rug, computer, 740))
  expect(walkSeconds(rug, shelf, 2000)).toBe(2.6)
  expect(walkSeconds(rug, { pct: 60, ux: 2, uy: 10 }, 740)).toBe(0.6)
  expect(isLeftward(rug, shelf, 740)).toBe(true)
  expect(isLeftward(shelf, rug, 740)).toBe(false)

  const halfway = whereAt({ from: rug, to: shelf, at: 0, dur: 2 }, 1000)
  expect(halfway).toEqual({ pct: 37, ux: 7, uy: 10 })
  expect(whereAt({ from: rug, to: shelf, at: 0, dur: 2 }, 5000)).toEqual(shelf)
})

test('a new station mid-walk sets off from where he is, not back where he began', async ($, on) => {
  const clock = engine(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(3000)
  await $.tool.call({ tool: 'Read', file_path: '/x' })
  const first = /data-walk="60%>14%" data-begin="[-\d.]+s" data-dur="([\d.]+)"/.exec(await roomSource($))
  const dur = Number(first?.[1])
  expect(dur).toBeGreaterThan(0.6)

  await clock.advance((dur * 1000) / 2)
  await $.tool.call({ tool: 'Edit', file_path: '/x', old_string: 'a', new_string: 'b' })

  // Halfway from the rug to the shelf is 37% along, turned toward the desk.
  const source = await roomSource($)
  expect(source).toContain('data-walk="37%>30%"')
  expect(source).not.toContain('data-walk="60%>30%"')
})

test('a walk across the whole room takes longer than a step to the next station', async ($, on) => {
  const clock = engine(on)
  const durationTo = async (tool: string, input: Record<string, unknown>) => {
    await $.tool.call({ tool, ...input } as never)
    const walk = /data-walk="[\d.]+%>[\d.]+%" data-begin="[-\d.]+s" data-dur="([\d.]+)"/.exec(await roomSource($))
    await clock.advance(4000)

    return Number(walk?.[1])
  }

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(3000)
  const long = await durationTo('Read', { file_path: '/x' })
  const short = await durationTo('Bash', { command: 'ls' })

  expect(long).toBeGreaterThan(short)
})

// The band's layers by name, as the desktop draws them.
async function bandLayers($: Engine) {
  const ui = await $.ui.mount(band('desktop'))
  // The room's layers only, not the needs row under it.
  const svgs = (await ui.findAll({ type: 'Svg' })).filter(one => one.props.height === HEIGHT).map(one => String(one.props.source ?? ''))
  await ui.unmount()

  return svgs
}

test('the band stacks room and actors; a change of state leaves the room layer untouched', async ($, on) => {
  const clock = engine(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(3000)
  const [roomBefore, actorsBefore] = await bandLayers($)
  expect([roomBefore, actorsBefore].every(one => one?.startsWith("<svg") === true)).toBe(true)
  expect(roomBefore).not.toContain('class="clawd"')
  expect(actorsBefore).toContain('class="clawd"')

  await $.tool.call({ tool: 'Read', file_path: '/x' })
  const [roomAfter, actorsAfter] = await bandLayers($)

  // The room is the same drawing, so the app has nothing to reload there.
  expect(roomAfter).toBe(roomBefore)
  expect(actorsAfter).not.toBe(actorsBefore)
  // He takes the book off the shelf in the actors layer.
  expect(actorsAfter).toContain('fill="#5e3f27"/></g></svg>')
})

test('standing still, a redraw changes nothing in any layer', async ($, on) => {
  const clock = engine(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(3000)
  const first = await bandLayers($)
  await clock.advance(1000)

  expect(await bandLayers($)).toEqual(first)
})

test('Debug switches the drawing between images, layered frames and one picture, and keeps it', async ($, on) => {
  engine(on)

  // Images by default: room, actors, and the hover layer on top.
  expect(await bandLayers($)).toHaveLength(3)
  await pressInMenu($, 'tab-debug', 'drawing')
  expect(await bandLayers($)).toHaveLength(2)
  await pressInMenu($, 'drawing')
  expect(await bandLayers($)).toHaveLength(1)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await bandLayers($)).toHaveLength(1)
})

test('as images, the visible layers take no hover and one invisible layer carries every tooltip', async ($, on) => {
  const clock = engine(on, { tools: false })
  on('tool.call', () => ({ result: { stdout: '[main abc1234] Ship it', gitOperation: { commit: { sha: 'abc1234', kind: 'committed' } } } }))

  await $.tool.call({ tool: 'Bash', command: 'git commit -m "Ship it"' })
  await clock.advance(5000)
  const ui = await $.ui.mount(band('desktop'))
  const svgs = (await ui.findAll({ type: 'Svg' })).filter(one => one.props.height === HEIGHT)
  await ui.unmount()

  expect(svgs.map(one => one.props.isInteractive === true)).toEqual([false, false, true])
  const hover = String(svgs[2]?.props.source)
  expect(hover).toContain('<title>Ship it (abc1234)</title>')
  expect(hover).not.toContain('class="clawd"')
  expect(svgs.slice(0, 2).some(one => String(one.props.source).includes('<title>Ship it'))).toBe(false)
})

test('the menu tabs wrap rather than run off a narrow pane, every tab reachable', async ($, on) => {
  engine(on)

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ ...menu(surface), props: { ...menu(surface).props, bodyColumns: 30 } })
    const keys = await Promise.all(['docs', 'coach', 'journal', 'wardrobe', 'debug'].map(async id => (await pane.find({ key: `tab-${id}` }))?.text))
    const row = (await pane.findAll({ type: 'Box' })).find(one => one.props.flexWrap === 'wrap')
    await pane.unmount()

    expect(keys).toEqual(['Docs', 'Coach', 'Journal', 'Wardrobe', 'Debug'])
    expect(row).toBeDefined()
  }
})

const NO_CRAFT_T = { xp: 0, prompts: 0, vague: 0, habits: { context: 0, verify: 0, plan: 0, example: 0, why: 0, rewrite: 0, template: 0 }, tips: [], rewrites: [] }
const signals = (week: Partial<typeof EMPTY_DAY> = {}, today: Partial<typeof EMPTY_DAY> = {}) => ({
  week: { ...EMPTY_DAY, ...week },
  today: { ...EMPTY_DAY, ...today },
  craft: NO_CRAFT_T,
  sinceCommit: 0,
  wantsRewrites: false,
  practiced: {} as Record<string, number>,
  skills: [] as string[],
  skillsUsed: {} as Record<string, number>,
})

test('the tip chooser: personal first and specific, never within two hours, never a repeat', () => {
  const now = new Date(2026, 9, 23, 9).getTime()
  const vague = chooseTip(signals({ prompts: 12, clear: 7 }), [], now)
  expect(vague?.id).toBe('vague')
  expect(vague?.text).toContain('5 of your last 12 prompts')

  expect(chooseTip(signals({ prompts: 12, clear: 7 }), [{ id: 'g-mention', at: now - TIP_GAP_MS + 60000 }], now)).toBeNull()
  expect(chooseTip(signals({ prompts: 12, clear: 7 }), [{ id: 'vague', at: now - TIP_GAP_MS - 1 }], now)?.id).not.toBe('vague')

  const quiet = chooseTip(signals(), [], now)
  expect(quiet?.id).toBe('g-mention')
  expect(chooseTip(signals({}, { interrupts: 3 }), [], now)?.text).toContain("You've stopped Claude 3 times today")
  expect(chooseTip(signals({}, { contextPeak: 82 }), [], now)?.text).toContain('Context hit 82% today')
})

async function bandTexts($: Engine) {
  const ui = await $.ui.mount(band('desktop'))
  const texts = (await ui.findAll({ type: 'Text' })).map(one => one.text)
  const dismiss = await ui.find({ key: 'tip-dismiss' })
  await ui.unmount()

  // The card's label comes first, its text right after.
  const label = texts.findIndex(text => text.startsWith('TIP · '))

  return { topic: label === -1 ? undefined : texts[label], tip: label === -1 ? undefined : texts[label + 1], hasDismiss: dismiss !== undefined }
}

test('a tip shows above the room from how you worked, with its topic, and Dismiss puts it away', async ($, on) => {
  engine(on, { stored: { days: { '2026-10-22': { ...EMPTY_DAY, prompts: 10, clear: 5 } } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const shown = await bandTexts($)
  expect(shown.tip).toContain('5 of your last 10 prompts')
  expect(shown.topic).toBe('TIP · PROMPTING')
  expect(shown.hasDismiss).toBe(true)

  const ui = await $.ui.mount(band('desktop'))
  await ui.press({ key: 'tip-dismiss' })
  await ui.unmount()
  expect((await bandTexts($)).tip).toBeUndefined()
})

test('at most one tip every two hours, even across sessions', async ($, on) => {
  const clock = engine(on, { stored: { tipLog: [{ id: 'g-mention', text: 'x', at: new Date(2026, 9, 22, 13).getTime() }] } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await bandTexts($)).tip).toBeUndefined()

  // Another session showed one an hour ago; two hours on, the next is due.
  await clock.advance(60 * 60 * 1000)
  expect((await bandTexts($)).tip).toBeDefined()
})

test('interrupts are counted, and the third in a day brings the interrupts tip', async ($, on) => {
  engine(on, { stored: { days: { '2026-10-22': { ...EMPTY_DAY, interrupts: 2 } } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // Two so far is no pattern yet: a general tip, and none again for two hours.
  expect((await bandTexts($)).tip).toContain('@-mention a file')
  const ui = await $.ui.mount(band('desktop'))
  await ui.press({ key: 'tip-dismiss' })
  await ui.unmount()

  await $.turn.start({ text: 'go', turnId: 'c' })
  await $.turn.complete({ answer: '', reason: 'aborted', isAborted: true, durationMs: 10, turnId: 'c' })
  expect((await bandTexts($)).tip).toBeUndefined()
})

test('three interrupts today bring the interrupts tip once the two hours are up', async ($, on) => {
  const start = new Date(2026, 9, 22, 14).getTime()
  const clock = engine(on, {
    stored: { days: { '2026-10-22': { ...EMPTY_DAY, interrupts: 2 } }, tipLog: [{ id: 'g-clear', text: 'x', at: start - TIP_GAP_MS + 2 * 60 * 1000 }] },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await bandTexts($)).tip).toBeUndefined()

  await $.turn.start({ text: 'go', turnId: 'c' })
  await $.turn.complete({ answer: '', reason: 'aborted', isAborted: true, durationMs: 10, turnId: 'c' })
  expect((await bandTexts($)).tip).toBeUndefined()

  // The next five-minute check is past the two hours.
  await clock.advance(5 * 60 * 1000)

  expect((await bandTexts($)).tip).toContain("You've stopped Claude 3 times today")
})

test('tips can be turned off, and stay off', async ($, on) => {
  engine(on, { stored: { days: { '2026-10-22': { ...EMPTY_DAY, prompts: 10, clear: 5 } } } })

  await $.command.run({ command: 'pet', args: 'tips off', origin: { kind: 'composer' }, presentation: { isFullscreen: false } } as never)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect((await bandTexts($)).tip).toBeUndefined()
})

test('every tip reads like a person wrote it: straight quotes, no em dashes, no chatbot words', () => {
  const now = new Date(2026, 9, 22, 14).getTime()
  const seen: string[] = []
  const log: { id: string; at: number }[] = []
  const busy = signals({ prompts: 30, clear: 10 }, { interrupts: 4, corrections: 4, contextPeak: 90, waits: 9 })

  // Walk the chooser through every tip it has, each once.
  for (let at = now; seen.length < 40; at += TIP_GAP_MS) {
    const next = chooseTip({ ...busy, sinceCommit: 8 }, log, at)

    if (next === null) {
      break
    }

    seen.push(next.text)
    log.push({ id: next.id, at })
  }

  expect(seen.length).toBeGreaterThan(10)
  for (const text of [...seen, ...Object.values(LESSONS).flatMap(one => [one.title, one.idea, one.weak, one.strong, ...one.ways])]) {
    expect(text).not.toMatch(/[\u2014\u2018\u2019\u201C\u201D]/)
    expect(text).not.toMatch(/\b(crucial|delve|enhance|leverage|robust|seamless|valuable|additionally|not just)\b/i)
  }
})

const teachPane = {
  plugin: 'attention-band',
  surface: 'desktop',
  component: 'Pane',
  requestId: 'teach',
  props: { title: 'Teach me', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('Teach me opens a lesson on the tip, and the chat sends what you paste to Haiku', async ($, on) => {
  const opened: string[] = []
  const asked: { model: string; prompt: unknown; system?: unknown }[] = []
  engine(on, {
    onOpen: id => opened.push(id),
    asked,
    reply: 'That names the file, good. Say how to check it.\nTry: Fix [what] in cart.ts; done when npm test passes \u2014 and the total is right.',
    stored: { days: { '2026-10-22': { ...EMPTY_DAY, prompts: 10, clear: 5 } } },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const band1 = await $.ui.mount(band('desktop'))
  await band1.press({ key: 'tip-teach' })
  await band1.unmount()
  expect(opened).toContain('teach')

  const pane = await $.ui.mount(teachPane)
  const texts = (await pane.findAll({ type: 'Text' })).map(one => one.text)
  expect(texts).toContain('LESSON · PROMPTING')
  expect(texts).toContain('Name the target')
  expect((await pane.find({ type: 'Markdown' }))?.text).toContain('Instead of:')

  await pane.input({ key: 'teach-input-0', text: 'fix the cart total in cart.ts' })
  await pane.unmount()

  expect(asked.at(-1)?.model).toBe('haiku')
  expect(asked.at(-1)?.prompt).toBe('fix the cart total in cart.ts')
  expect(String(asked.at(-1)?.system)).toContain('no em dashes')

  const after = await $.ui.mount(teachPane)
  const chat = (await after.findAll({ type: 'Markdown' })).map(one => one.text)
  const replyText = chat.find(one => one.includes('npm test passes')) ?? ''
  // The guard takes out the em dash the model slipped in.
  expect(replyText).toContain('npm test passes, and the total is right')
  expect((await after.findAll({ type: 'Text' })).map(one => one.text)).toContain('fix the cart total in cart.ts')

  await after.press({ key: 'teach-example' })
  await after.unmount()
  expect(String(asked.at(-1)?.prompt)).toContain('Give me one more example')
})

test('the banner is a small card: Teach me, and a plain ✕ to dismiss', async ($, on) => {
  engine(on, { stored: { days: { '2026-10-22': { ...EMPTY_DAY, prompts: 10, clear: 5 } } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount(band('desktop'))
  expect((await ui.find({ key: 'tip-dismiss' }))?.text).toBe('✕')
  expect((await ui.find({ key: 'tip-teach' }))?.text).toBe('Teach me')
  await ui.unmount()
})

test('a tip logged before the rewrite shows its new words', () => {
  expect(currentText('verify', 'End asks with how to check: old words')).toContain('Try ending a request with how to check it')
  expect(currentText('vague', '5 of your last 10 prompts, old words')).toBe('5 of your last 10 prompts, old words')
  expect(currentText('gone', 'kept as it was')).toBe('kept as it was')
})

test('a practiced lesson makes its tips come round three times slower', () => {
  const now = new Date(2026, 9, 23, 9).getTime()
  const day = 24 * 60 * 60 * 1000
  const shown = [{ id: 'interrupts', at: now - 20 * day }]
  const busy = signals({}, { interrupts: 4 })

  expect(chooseTip(busy, shown, now)?.id).toBe('interrupts')
  expect(chooseTip({ ...busy, practiced: { limits: 1 } }, shown, now)?.id).not.toBe('interrupts')
})

test('a request Clawd passes counts as practice, kept, and listed in the Coach tab', async ($, on) => {
  const stored: Record<string, unknown> = { days: { '2026-10-22': { ...EMPTY_DAY, prompts: 10, clear: 5 } } }
  engine(on, { reply: 'PASS: It names the file and the check. Send it.', stored })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const band1 = await $.ui.mount(band('desktop'))
  await band1.press({ key: 'tip-teach' })
  await band1.unmount()

  const pane = await $.ui.mount(teachPane)
  await pane.input({ key: 'teach-input-0', text: 'In cart.ts, make applyDiscount() return 0 for an empty cart; npm test passes' })
  await pane.unmount()

  const after = await $.ui.mount(teachPane)
  const texts = (await after.findAll({ type: 'Text' })).map(one => one.text)
  expect(texts).toContain('LESSON · PROMPTING · PRACTICED 1×')
  expect(texts).toContain('CLAWD · PASSED, READY TO SEND')
  const replies = (await after.findAll({ type: 'Markdown' })).map(one => one.text)
  expect(replies).toContain('It names the file and the check. Send it.')
  await after.unmount()

  // Kept: a new session reads it back from the store.
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await pressInMenu($, 'tab-coach')
  const menu1 = await $.ui.mount(menu('desktop'))
  expect((await menu1.find({ key: 'lesson-target' }))?.text).toBe('✓ Name the target · practiced 1×')
  expect((await menu1.find({ key: 'lesson-plan' }))?.text).toBe('○ Plan before editing')
  await menu1.unmount()
})

test('a nudge offers Teach me, which opens its lesson with your prompt already sent', async ($, on) => {
  const opened: string[] = []
  const asked: { model: string; prompt: unknown; system?: unknown }[] = []
  engine(on, { onOpen: id => opened.push(id), asked, reply: 'It needs a target.\nTry: Fix [what] in [which file].' })

  await $.prompt.submit(say('fix it'))
  const ui = await $.ui.mount(band('desktop'))
  await ui.press({ key: 'nudge-teach' })
  await ui.unmount()

  expect(opened).toContain('teach')
  expect(asked.at(-1)?.prompt).toBe('fix it')

  const pane = await $.ui.mount(teachPane)
  const texts = (await pane.findAll({ type: 'Text' })).map(one => one.text)
  expect(texts).toContain('Name the target')
  expect(texts).toContain('fix it')
  await pane.unmount()
})

test('no nudge, no Teach me in the band', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'nudge-teach' })).toBeUndefined()
  await ui.unmount()
})

test('the limits another session read reach this one', async ($, on) => {
  const now = new Date(2026, 9, 22, 14).getTime()
  // Another session, busy with a turn, shared what the API told it.
  engine(on, { stored: { limits: { session: { percent: 40 }, week: { percent: 76 }, at: now - 30 * 1000 } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const source = await roomSource($)
  expect(source).toContain('wk 76%')
  expect(source).toContain('5h 40%')
})

test('a shared reading older than this session\'s own does not win', async ($, on) => {
  const clock = engine(on, { stored: { limits: { week: { percent: 10 }, at: 1 } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({ context: { window: 200000 }, rateLimits: [{ kind: 'seven_day', percentUsed: 50 }], changed: ['rateLimits'] })
  await clock.advance(61 * 1000)
  expect(await roomSource($)).toContain('wk 50%')
})

test('a skill tip: a theme three times this week, a skill you have and have not used', () => {
  const now = new Date(2026, 9, 23, 9).getTime()
  const busy = { ...signals({ themes: { debug: 4 } }), skills: ['superpowers:systematic-debugging', 'code-review'] }
  const tip = chooseTip(busy, [], now)
  expect(tip?.id).toBe('skill-debug')
  expect(tip?.topic).toBe('Skills')
  expect(tip?.text).toBe('4 of your prompts this week were about bugs. Try /superpowers:systematic-debugging: Claude finds the root cause before it changes any code.')

  // Used lately, or not installed: no tip for it.
  expect(chooseTip({ ...busy, skillsUsed: { 'superpowers:systematic-debugging': now - 1000 } }, [], now)?.id).not.toBe('skill-debug')
  expect(chooseTip({ ...busy, skills: ['code-review'] }, [], now)?.id).not.toBe('skill-debug')
  expect(chooseTip(signals({ themes: { debug: 2 } }), [], now)?.id).not.toBe('skill-debug')
})

test('prompts are tallied by theme, and the third on one brings a skill tip', async ($, on) => {
  const now = new Date(2026, 9, 22, 14).getTime()
  const clock = engine(on, {
    stored: { days: { '2026-10-22': { ...EMPTY_DAY, themes: { review: 2 } } }, tipLog: [{ id: 'g-small', text: 'x', at: now - TIP_GAP_MS + 60 * 1000 }] },
    skillNames: ['code-review'],
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit(say('Review the diff in refunds.ts before I merge'))
  // The next five-minute check is past the two hours.
  await clock.advance(5 * 60 * 1000)

  const shown = await bandTexts($)
  expect(shown.topic).toBe('TIP · SKILLS')
  expect(shown.tip).toBe('You asked about reviewing or merging 3 times this week. Try /code-review: Claude reviews the diff for real bugs before you merge.')
})

test('a skill you ran lately gets no tip', async ($, on) => {
  const now = new Date(2026, 9, 22, 14).getTime()
  engine(on, { stored: { days: { '2026-10-22': { ...EMPTY_DAY, themes: { review: 3 } } }, skillsUsed: { 'code-review': now - 1000 } }, skillNames: ['code-review'] })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await bandTexts($)).topic).not.toBe('TIP · SKILLS')
})

test('levels: 10 XP, then 15, 20; milestones hold back levels 4 and 7', () => {
  const none = { lessonsPracticed: 0, skillsUsed: 0 }
  const all = { lessonsPracticed: 1, skillsUsed: 3 }
  expect([xpFor(1), xpFor(2), xpFor(3), xpFor(4)]).toEqual([0, 10, 25, 45])
  expect(levelOf(9, all)).toBe(1)
  expect(levelOf(25, all)).toBe(3)
  expect(levelOf(200, none)).toBe(3)
  expect(levelOf(200, { lessonsPracticed: 1, skillsUsed: 0 })).toBe(6)
  expect(levelOf(200, all)).toBeGreaterThan(6)
  expect(progressOf(60, none).blockedBy).toBe('Pass a request in a Teach me lesson')
  expect(progressOf(30, none)).toMatchObject({ level: 3, into: 5, step: 20, blockedBy: null })
})

test('turns fade out and craft grows in as he levels; the needs bonus is 1.5x', () => {
  expect([1, 4, 7].map(level => xpWorth('turn', 1, level, false))).toEqual([1, 0.5, 0])
  expect([1, 4, 7].map(level => xpWorth('craft', 2, level, false))).toEqual([1, 2, 3])
  expect(xpWorth('craft', 2, 4, true)).toBe(3)
  expect(xpWorth('quest', 10, 7, true)).toBe(10)
})

test('an old pet keeps its level as a floor, which Debug can switch off', async ($, on) => {
  engine(on, { stored: { stats: { name: 'Clawd', turns: 90, outfit: null, lastTidyTurn: 90 } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await roomSource($)).toContain('Lv 10 · 90 turns')

  await pressInMenu($, 'tab-debug', 'floor')
  expect(await roomSource($)).toContain('Lv 1 · 90 turns')
  await pressInMenu($, 'floor')
  expect(await roomSource($)).toContain('Lv 10 · 90 turns')
})

test('needs drain and refill from what you do', () => {
  const hour = 60 * 60 * 1000
  const now = 100 * hour
  const fresh = needsOf({ clearAt: now, newAt: now, unchecked: 0 }, { context: 20, dirty: 0, now })
  expect(fresh).toEqual({ focus: 100, tidy: 100, clarity: 100, confidence: 100, curiosity: 100 })
  expect(wellbeingOf(fresh)).toBe('fine')

  const worn = needsOf({ clearAt: now - 6 * hour, newAt: now - 36 * hour, unchecked: 7 }, { context: 95, dirty: 4, now })
  expect(worn).toEqual({ focus: 0, tidy: 60, clarity: 25, confidence: 30, curiosity: 50 })
  expect(wellbeingOf(worn)).toBe('empty')
})

test('the needs row sits under the room with a tooltip each, and Clawd pales as a need runs low', async ($, on) => {
  const hour = 60 * 60 * 1000
  const now = new Date(2026, 9, 22, 14).getTime()
  engine(on, { stored: { needs: { clearAt: now - 6 * hour, newAt: now, unchecked: 0 } } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount(band('desktop'))
  const svgs = await ui.findAll({ type: 'Svg' })
  await ui.unmount()
  const needs = svgs.filter(one => one.props.height !== HEIGHT)
  expect(needs.map(one => one.props.isInteractive === true)).toEqual([false, true])
  const hover = String(needs[1]?.props.source)
  expect(count(hover, /<title>/g)).toBe(5)
  expect(hover).toContain('<title>Clarity 25%. Drains over the hours since your last clear prompt.')
  // Clarity at 25% is low: pale yellow.
  expect(await roomSource($)).toContain('fill="#E3B35C"')
})

test('a package arrives each day; opening it shows the quest, and doing it earns bonus XP', async ($, on) => {
  const toasts: string[] = []
  engine(on, { toasts })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const id = questFor('2026-10-22', false)

  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'open-parcel' })).toBeDefined()
  expect(await roomSource($)).toContain('class="parcel"')
  await ui.press({ key: 'open-parcel' })
  await ui.unmount()

  expect(toasts.at(-1)).toMatch(/^Today's quest: .*Worth 10 XP\.$/)
  expect(await roomSource($)).toContain('Quest: ')

  const prompts: Record<string, string> = {
    verify: 'Fix the total in cart.ts; check by running npm test',
    plan: 'Plan the cart.ts refactor before you edit anything',
    example: 'Format the log lines in log.ts like this: [orders] 12:04 created #1042',
    why: 'Round totals in cart.ts so the refund total matches Shopify',
  }

  if (prompts[id] !== undefined) {
    await $.prompt.submit(say(prompts[id]))
    expect(toasts.some(one => /^Quest done: .* \+10 XP$/.test(one))).toBe(true)
    expect(await roomSource($)).toContain('Quest done ✓')
  }
})

test('a quest done before its package is opened does not count', async ($, on) => {
  const toasts: string[] = []
  engine(on, { toasts })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit(say('Plan the cart.ts refactor before you edit anything; check by running npm test, like this: x, so totals match'))
  expect(toasts.some(one => one.startsWith('Quest done'))).toBe(false)
})

test('the menu leads the bar under the room', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(band('desktop'))
  const buttons = (await ui.findAll({ type: 'Button' })).map(one => one.props.label)
  await ui.unmount()
  expect(buttons[0]).toBe('☰ Menu')
})
