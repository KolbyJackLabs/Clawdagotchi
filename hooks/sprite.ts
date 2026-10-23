// Clawd and his friends: body, eyes, outfit, how each moves per mood, and
// what each holds. Drawn on a 22x18 critter grid; the room places them.
// Every element a CSS animation moves carries no transform attribute of its
// own, since the animation would replace it.

import type { Feeling, FriendActivity, Mood, OutfitId } from '../types'

export const MOODS: Mood[] = [
  'idle',
  'thinking',
  'reading',
  'writing',
  'running',
  'searching',
  'delegating',
  'waiting',
  'done',
  'error',
  'sleepy',
  'celebrating',
  'tidying',
]

// His color by how his needs are doing: his own orange while they are
// fine, a pale yellow once one runs low, washed-out grey once one is empty.
export const BODY = '#D97757'
export const BODIES = { fine: BODY, low: '#E3B35C', empty: '#A39A94' } as const
const INK = '#1f1f1f'

// How long a walk between two spots takes, in seconds.
export const WALK_S = 1.2

export const PET_STYLE = `
.pet{transform-box:fill-box;transform-origin:50% 100%}
.eye{transform-box:fill-box;transform-origin:center;animation:blink 4s infinite}
.arm,.leg,.rise,.pop,.flip,.ink,.saver,.broom{transform-box:fill-box}
.broom{transform-origin:50% 0;animation:sweep .6s ease-in-out infinite}
.pop{transform-origin:center}
.emote{transform-box:fill-box;animation:float 1.6s ease-in-out infinite}
.spin{transform-box:fill-box;transform-origin:center;animation:spin 1.2s linear infinite}
.flip{transform-origin:0% 50%;animation:flip 2.4s ease-in-out infinite}
.ink{transform-origin:0% 50%;animation:write 4s ease-out infinite}
.rise{animation:rise 3s ease-out infinite}
.parcel{transform-box:fill-box;transform-origin:50% 100%;animation:hop 2.4s ease-in-out infinite}
.flash{animation:flash .9s steps(2,jump-none) infinite}
.walking .leg.a{animation:step .3s var(--d,0s) var(--n,4)}
.walking .leg.b{animation:step .3s calc(var(--d,0s) + .15s) var(--n,4)}
.arrive{animation:appear .35s calc(var(--w,${WALK_S}s) + var(--d,0s)) both}
.leftward{transform-box:fill-box;transform-origin:50% 50%;animation:leftward var(--w,${WALK_S}s) steps(1,end) var(--d,0s) 1}
@keyframes leftward{from,to{transform:scaleX(-1)}}
.friend .pet{animation:bob 1.6s ease-in-out infinite}
.typing .arm{animation:tap .3s infinite}.typing .arm.r{animation-delay:.15s}
@keyframes sweep{0%,100%{transform:rotate(-18deg)}50%{transform:rotate(16deg)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-.8px)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes dance{0%,100%{transform:translateY(0) rotate(-9deg)}25%{transform:translateY(-3px) rotate(0)}50%{transform:translateY(0) rotate(9deg)}75%{transform:translateY(-3px) rotate(0)}}
@keyframes appear{from{opacity:0}to{opacity:1}}
@keyframes blink{0%,94%,100%{transform:scaleY(1)}97%{transform:scaleY(.1)}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-.7px)}}
@keyframes hop{0%,60%,100%{transform:translateY(0)}20%,40%{transform:translateY(-3px)}}
@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-.8px)}40%,80%{transform:translateX(.8px)}}
@keyframes breathe{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.92)}}
@keyframes step{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes wave{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes tap{0%,100%{transform:translateY(0)}50%{transform:translateY(.9px)}}
@keyframes rise{0%{opacity:0;transform:translate(0,0)}25%{opacity:1}100%{opacity:0;transform:translate(1.5px,-7px)}}
@keyframes flash{0%{opacity:1}100%{opacity:.15}}
@keyframes pop{0%,100%{opacity:0;transform:scale(.3)}50%{opacity:1;transform:scale(1)}}
@keyframes sway{0%,100%{transform:translateX(0)}50%{transform:translateX(-4px)}}
@keyframes flip{0%,55%{transform:scaleX(1)}80%{transform:scaleX(0)}100%{transform:scaleX(-1)}}
@keyframes write{0%{transform:scaleX(0)}40%,100%{transform:scaleX(1)}}
@keyframes pen{0%,100%{transform:translate(0,0)}25%{transform:translate(5px,0)}50%{transform:translate(0,2px)}75%{transform:translate(5px,2px)}}
@keyframes saver{0%,100%{transform:translate(0,0)}25%{transform:translate(8px,2px)}50%{transform:translate(4px,5px)}75%{transform:translate(-1px,3px)}}
`

// How Clawd's body moves, per mood; scoped to him so friends keep their own.
export const MOTION: Record<Mood, string> = {
  idle: '.clawd .pet{animation:bob 2.4s ease-in-out infinite}',
  thinking: '.clawd .pet{animation:bob 1.6s ease-in-out infinite}',
  reading: '.clawd .pet{animation:bob 3s ease-in-out infinite}',
  writing: '.clawd .arm{animation:tap .3s infinite}.clawd .arm.r{animation-delay:.15s}',
  running: '.clawd .arm{animation:tap .2s infinite}.clawd .arm.r{animation-delay:.1s}',
  searching: '.clawd .pet{animation:bob 2s ease-in-out infinite}',
  delegating: '.clawd .pet{animation:bob 1.2s ease-in-out infinite}.clawd .arm.r{animation:wave .6s infinite}',
  waiting: '.clawd .pet{animation:hop 1s infinite}.clawd .arm.r{animation:wave .5s infinite}',
  done: '.clawd .pet{animation:hop 1.4s infinite}',
  error: '.clawd .pet{animation:shake .6s 3}',
  sleepy: '.clawd .pet{animation:breathe 3s ease-in-out infinite}',
  tidying: '.clawd .pet{animation:bob .6s ease-in-out infinite}.clawd .arm{animation:tap .3s infinite}',
  celebrating: '.clawd .pet{animation:dance .7s ease-in-out infinite}.clawd .arm{animation:wave .35s infinite}.clawd .arm.r{animation-delay:.17s}',
}

type Eyes = 'open' | 'right' | 'left' | 'down' | 'happy' | 'closed' | 'crossed'

const EYES: Record<Mood, Eyes> = {
  idle: 'open',
  thinking: 'open',
  reading: 'down',
  writing: 'right',
  running: 'right',
  searching: 'left',
  delegating: 'right',
  waiting: 'open',
  done: 'happy',
  error: 'crossed',
  sleepy: 'closed',
  celebrating: 'happy',
  tidying: 'down',
}

const FRIEND_EYES: Record<FriendActivity, Eyes> = {
  thinking: 'open',
  reading: 'down',
  writing: 'right',
  running: 'down',
  searching: 'left',
}

function eyes(kind: Eyes): string {
  const at = [8, 12.8]

  switch (kind) {
    case 'open':
    case 'right':
    case 'left':
    case 'down': {
      const dx = kind === 'right' ? 0.8 : kind === 'left' ? -0.8 : 0
      const dy = kind === 'down' ? 0.8 : 0

      return at
        .map(x => `<rect class="eye" x="${x + dx}" y="${9 + dy}" width="1.2" height="${kind === 'down' ? 1.6 : 2.2}" fill="${INK}"/>`)
        .join('')
    }
    case 'happy':
      return at
        .map(x => `<polyline points="${x - 0.4},11 ${x + 0.6},9.8 ${x + 1.6},11" fill="none" stroke="${INK}" stroke-width=".7"/>`)
        .join('')
    case 'closed':
      return at.map(x => `<rect x="${x - 0.2}" y="10.4" width="1.8" height=".6" fill="${INK}"/>`).join('')
    case 'crossed':
      return at
        .map(
          x =>
            `<path d="M${x - 0.2},9.4 L${x + 1.6},11.2 M${x + 1.6},9.4 L${x - 0.2},11.2" stroke="${INK}" stroke-width=".6"/>`,
        )
        .join('')
  }
}

// Worn on top of the body, so they move with him.
const OUTFIT_ART: Record<OutfitId, string> = {
  beanie: '<rect x="5.6" y="4.4" width="10.8" height="2.8" fill="#3d6fb6"/><rect x="5.6" y="6.4" width="10.8" height=".8" fill="#2c548e"/><circle cx="11" cy="3.9" r="1.1" fill="#fff"/>',
  bowtie: '<path d="M8.8,12.8 L11,13.8 L8.8,14.8Z M13.2,12.8 L11,13.8 L13.2,14.8Z" fill="#c0392b"/><rect x="10.5" y="13.3" width="1" height="1" fill="#962d22"/>',
  shades: '<rect x="7.2" y="8.8" width="3.2" height="2" fill="#111"/><rect x="11.8" y="8.8" width="3.2" height="2" fill="#111"/><rect x="10.4" y="9.2" width="1.4" height=".5" fill="#111"/>',
  wizard:
    '<path d="M5.4,7.2 L16.6,7.2 L11,-1.5Z" fill="#6a4fb3"/><rect x="4.6" y="6.6" width="12.8" height="1" fill="#54409a"/><path d="M10.2,2.6 l.4,.9 .9,.4 -.9,.4 -.4,.9 -.4,-.9 -.9,-.4 .9,-.4Z" fill="#f2c14e"/>',
  crown: '<path d="M6.4,7.2 L6.4,4 L8.6,5.6 L11,3.2 L13.4,5.6 L15.6,4 L15.6,7.2Z" fill="#f2c14e"/><circle cx="11" cy="5.6" r=".6" fill="#e5534b"/>',
}

function body(look: Eyes, fill: string, extra: string): string {
  return [
    `<rect class="leg a" x="6" y="15" width="1.2" height="3" fill="${fill}"/>`,
    `<rect class="leg b" x="8.6" y="15" width="1.2" height="3" fill="${fill}"/>`,
    `<rect class="leg a" x="13.2" y="15" width="1.2" height="3" fill="${fill}"/>`,
    `<rect class="leg b" x="15.8" y="15" width="1.2" height="3" fill="${fill}"/>`,
    `<rect class="arm l" x="3" y="10" width="2" height="2" fill="${fill}"/>`,
    `<rect class="arm r" x="17" y="10" width="2" height="2" fill="${fill}"/>`,
    `<rect x="5" y="7" width="12" height="8" fill="${fill}"/>`,
    eyes(look),
    extra,
  ].join('')
}

// A striped scarf for the cold months, wrapped under his face with a tail.
const SCARF =
  '<rect x="4.6" y="13" width="12.8" height="1.8" fill="#c0392b"/><rect x="7" y="13" width="1.2" height="1.8" fill="#f4f1ea"/><rect x="11" y="13" width="1.2" height="1.8" fill="#f4f1ea"/>' +
  '<rect x="14.2" y="14.6" width="1.8" height="3" fill="#c0392b"/><rect x="14.2" y="15.6" width="1.8" height=".8" fill="#f4f1ea"/>'

// The hats a party hat takes the place of while he wears it.
const HATS = new Set<OutfitId>(['beanie', 'wizard', 'crown'])

const PARTY_HAT =
  '<path d="M7.6,7.3 L14.4,7.3 L11,0.6Z" fill="#e5534b"/><path d="M8.9,5.2 L13.1,5.2 L12.4,4 L9.6,4Z" fill="#f2c14e"/>' +
  '<circle cx="10.4" cy="6.4" r=".45" fill="#7fb3d5"/><circle cx="11.9" cy="3" r=".4" fill="#7ee787"/><circle cx="11" cy=".5" r="1" fill="#f2c14e"/>'

export function critter(mood: Mood, outfit: OutfitId | null, hasPartyHat = false, hasScarf = false, fill: string = BODY): string {
  const worn = outfit === null || (hasPartyHat && HATS.has(outfit)) ? '' : OUTFIT_ART[outfit]
  const blush =
    mood === 'done' || mood === 'celebrating'
      ? '<rect x="6.2" y="12.2" width="1.4" height=".7" fill="#f4a3a3"/><rect x="14.4" y="12.2" width="1.4" height=".7" fill="#f4a3a3"/>'
      : ''

  return `<g class="pet">${body(EYES[mood], fill, blush + (hasScarf && outfit !== 'bowtie' ? SCARF : '') + worn + (hasPartyHat ? PARTY_HAT : ''))}</g>`
}

// An open book held in front, for reading.
const BOOK =
  '<rect x="5.6" y="11.2" width="5.4" height="4" fill="#4a6fa5"/><rect x="11" y="11.2" width="5.4" height="4" fill="#5b82bd"/>' +
  '<rect x="6.2" y="11.8" width="4.4" height="2.8" fill="#eef2f8"/><rect x="11.4" y="11.8" width="4.4" height="2.8" fill="#eef2f8"/>' +
  '<rect x="6.8" y="12.6" width="3" height=".3" fill="#9aa"/><rect x="6.8" y="13.4" width="3" height=".3" fill="#9aa"/><rect x="12" y="12.6" width="3" height=".3" fill="#9aa"/>' +
  '<rect class="flip" x="11" y="11.8" width="4.4" height="2.8" fill="#dfe6f2"/>'

export function friend(activity: FriendActivity, color: string): string {
  const held: Record<FriendActivity, string> = {
    thinking: [0, 1, 2]
      .map(i => `<circle class="pop" cx="${8 + i * 3}" cy="2" r=".9" fill="#888" style="animation:pop 1.2s ${i * 0.3}s infinite"/>`)
      .join(''),
    reading: BOOK,
    searching:
      '<g style="animation:sway 2s ease-in-out infinite"><circle cx="1" cy="10" r="2.6" fill="#cfe3ff" fill-opacity=".6" stroke="#555" stroke-width=".7"/><path d="M2.8,12 L4.6,14" stroke="#555" stroke-width="1" stroke-linecap="round"/></g>',
    writing:
      '<rect x="17" y="8.6" width="5" height="6.6" fill="#a0764e"/><rect x="17.6" y="9.4" width="3.8" height="5.2" fill="#fff"/>' +
      [10.6, 12, 13.4].map((y, i) => `<rect class="ink" x="18" y="${y}" width="3" height=".4" fill="#888" style="animation-delay:${i * 0.6}s"/>`).join(''),
    running:
      '<rect x="15" y="8.4" width="8" height="6" fill="#2b2b2b"/><rect x="15.6" y="9" width="6.8" height="4.8" fill="#1e1e1e"/>' +
      '<rect class="flash" x="16.4" y="10" width="1" height="1.4" fill="#7ee787"/><rect class="ink" x="16.4" y="12.2" width="5" height=".4" fill="#666"/><rect x="14" y="14.4" width="10" height=".8" fill="#9aa0a6"/>',
  }
  const isTyping = activity === 'writing' || activity === 'running'

  return `<g class="${isTyping ? 'typing' : ''}"><g class="pet">${body(FRIEND_EYES[activity], color, '')}</g>${held[activity]}</g>`
}

const STAR = 'M0,-2 L.5,-.5 L2,0 L.5,.5 L0,2 L-.5,.5 L-2,0 L-.5,-.5Z'

// How the way you prompt makes him feel, over his head on his own grid, so it
// moves with him while he works. Grumpy brows sit over his eyes.
export const EMOTES: Record<Feeling, string> = {
  confused: '<text x="9.4" y="5" font-family="system-ui,sans-serif" font-weight="800" font-size="6" fill="#4a6fa5">?</text>',
  grumpy:
    '<g><ellipse cx="9.4" cy="2.4" rx="2.4" ry="1.4" fill="#5b6170"/><ellipse cx="12.2" cy="2" rx="2.6" ry="1.6" fill="#4f5564"/><path d="M11,3.2 L10.2,4.8 L11.2,4.8 L10.6,6.2" fill="none" stroke="#ffe680" stroke-width=".4"/></g>' +
    '<path d="M7.4,8.2 L9.8,8.9 M14.6,8.2 L12.2,8.9" stroke="#1f1f1f" stroke-width=".55"/>',
  overwhelmed:
    '<path d="M18.4,6.2 C19.6,7.8 19.4,9 18.4,9 C17.4,9 17.2,7.8 18.4,6.2Z" fill="#7fb3d5"/><text x="12.2" y="4.6" font-family="system-ui,sans-serif" font-weight="800" font-size="4.4" fill="#e5534b">!!</text>',
  dizzy: '<g class="spin"><path d="M11,2.6 m-2,0 a2,2 0 1,1 4,0 a1.4,1.4 0 1,1 -2.8,0 a.8,.8 0 1,1 1.6,0" fill="none" stroke="#c39bd3" stroke-width=".5"/></g>',
  proud: [
    [5.4, 3.4, 0],
    [16.6, 2.6, 0.5],
    [11, 0.8, 1],
  ]
    .map(([x, y, d]) => `<g transform="translate(${x} ${y}) scale(.55)"><path class="pop" d="${STAR}" fill="#f2c14e" style="animation:pop 1.4s ${d}s infinite"/></g>`)
    .join(''),
  inspired:
    '<circle cx="11" cy="1.6" r="3.2" fill="#fff3b0" opacity=".6"/><circle cx="11" cy="1.6" r="1.8" fill="#f2c14e"/><rect x="10.2" y="3.2" width="1.6" height="1.2" fill="#9aa0a6"/>',
  calm:
    '<ellipse cx="9.6" cy="3" rx="1.4" ry=".7" fill="#f4a3c4" transform="rotate(-25 9.6 3)"/><ellipse cx="12.4" cy="3" rx="1.4" ry=".7" fill="#f4a3c4" transform="rotate(25 12.4 3)"/><ellipse cx="11" cy="2.4" rx=".7" ry="1.4" fill="#f7c0d8"/><rect x="9" y="3.6" width="4" height=".4" fill="#7ee787"/>',
  content: '<path d="M0,1.2 C-1.6,0 -1,-1.2 0,-.45 C1,-1.2 1.6,0 0,1.2Z" transform="translate(16 3.4) scale(1.3)" fill="#e5534b"/>',
}

// The same shape at several spots, each running `animation` after its delay.
function scattered(path: string, fill: string, animation: string, spots: [number, number, number][]): string {
  return spots
    .map(
      ([x, y, delay]) =>
        `<g transform="translate(${x} ${y})"><path class="pop" d="${path}" fill="${fill}" style="animation:${animation} ${delay}s infinite"/></g>`,
    )
    .join('')
}

// What Clawd holds or shows beside him, on his own grid. The furniture he
// works at (shelf, desk, computer, bed) is the room's.
export const PROPS: Record<Mood, string> = {
  idle: '',
  thinking: [
    '<circle cx="20" cy="7" r=".7" fill="#fff" stroke="#bbb" stroke-width=".3"/>',
    '<circle cx="22" cy="5" r="1" fill="#fff" stroke="#bbb" stroke-width=".3"/>',
    '<ellipse cx="29" cy="4" rx="6" ry="3.4" fill="#fff" stroke="#bbb" stroke-width=".3"/>',
    ...[26.5, 29, 31.5].map(
      (x, i) =>
        `<circle class="pop" cx="${x}" cy="4" r=".8" fill="#666" style="animation:pop 1.2s ${i * 0.3}s infinite"/>`,
    ),
  ].join(''),
  reading: BOOK,
  writing:
    '<g transform="translate(19 -3)"><g style="animation:pen 1.6s ease-in-out infinite"><rect x="0" y="0" width="1.2" height="5" fill="#f2c14e"/><path d="M0,5 L.6,6.4 L1.2,5Z" fill="#333"/></g></g>',
  running: '',
  searching:
    '<g style="animation:sway 2s ease-in-out infinite"><circle cx="0" cy="9" r="3" fill="#cfe3ff" fill-opacity=".6" stroke="#555" stroke-width=".8"/><path d="M2.2,11.2 L4.6,13.4" stroke="#555" stroke-width="1.2" stroke-linecap="round"/></g>',
  // Briefing the friends at the door.
  delegating: [
    '<rect x="21" y="2" width="11" height="7" rx="2" fill="#fff" stroke="#bbb" stroke-width=".3"/>',
    '<path d="M22,9 L21,11 L24,9Z" fill="#fff"/>',
    ...[4, 5.6, 7.2].map((y, i) => `<rect class="ink" x="22.6" y="${y - 0.3}" width="${7 - i * 1.5}" height=".5" fill="#888" style="animation-delay:${i * 0.5}s"/>`),
  ].join(''),
  waiting: [
    '<rect x="22" y="1" width="8" height="9" rx="2" fill="#fff" stroke="#bbb" stroke-width=".3"/>',
    '<path d="M23,10 L22,12 L25,10Z" fill="#fff"/>',
    '<g class="flash"><rect x="25.3" y="2.6" width="1.4" height="3.8" fill="#e5534b"/><rect x="25.3" y="7.2" width="1.4" height="1.4" fill="#e5534b"/></g>',
  ].join(''),
  done: scattered(STAR, '#f2c14e', 'pop 1.6s', [
    [22, 4, 0],
    [27, 10, 0.4],
    [33, 3, 0.8],
    [37, 11, 1.2],
  ]),
  error: [0, 1, 2]
    .map(i => `<circle class="rise" cx="${19 + i}" cy="6" r="${1 + i * 0.3}" fill="#9aa0a6" style="animation-delay:${i}s"/>`)
    .join(''),
  // Tucked in: the blanket and the bed's foot cover him, z's rise above.
  sleepy: [
    '<rect x="5.6" y="12.6" width="16.4" height="3.2" fill="#7fa6d9"/><rect x="5.6" y="12.6" width="16.4" height=".8" fill="#9dbbe3"/>',
    '<rect x="0" y="15.4" width="22.4" height="3" fill="#8b5e3c"/>',
    ...[0, 1, 2].map(
      i =>
        `<text class="rise" x="${14 + i * 2.5}" y="${6 - i}" font-family="monospace" font-weight="bold" font-size="${3 + i}" fill="#7f8ea3" style="animation-delay:${i}s">z</text>`,
    ),
  ].join(''),
  // The confetti is the room's: it falls across all of it.
  celebrating: '',
  // A broom swishing at his feet, kicking up dust.
  tidying: [
    '<g class="broom"><rect x="18.4" y="6" width=".8" height="11" fill="#8b5e3c"/><path d="M16.6,16.6 L21,16.6 L22,19.2 L15.6,19.2Z" fill="#e3b04b"/>',
    '<rect x="15.8" y="18.2" width="6" height=".4" fill="#c9922f"/></g>',
    ...[0, 1, 2].map(
      i => `<circle class="rise" cx="${20 + i * 1.6}" cy="18" r="${0.8 + i * 0.3}" fill="#cfc6b8" style="animation-duration:1.4s;animation-delay:${i * 0.4}s"/>`,
    ),
  ].join(''),
}
