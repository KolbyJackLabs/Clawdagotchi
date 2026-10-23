// Clawd's room as one animated SVG that fills the band's width at 96px tall.
// Furniture stands at a percentage of the width, so the room spreads out as
// the band grows; each piece is drawn on its own grid at 3x. Clawd and his
// friends stand at spots by what they are doing and walk between them when
// that changes. The status sits in the top-left corner, the stats in the
// bottom-right.

import { unlockedItems } from './catalog'
import type { Feeling, FriendActivity, Meter, Mood, OutfitId, Phase, Season, Spot, Usage, Weather } from '../types'
import { SEASON_STYLE, hasScarf, seasonCorner, seasonSill, seasonWall, seasonWindow } from './season'
import { EMOTES, MOTION, PET_STYLE, PROPS, critter, friend } from './sprite'
import { isLeftward, isSameSpot } from './walk'

export type FriendView = {
  color: string
  activity: FriendActivity
  // Where the friend's walk began while it runs, else null (in place).
  from: Spot | null
  // Seconds since the walk began, so a redraw mid-walk picks it up there,
  // and how long it takes.
  elapsed: number
  dur: number
  isLeaving: boolean
  // Its agent type, drawn as a name tag, and its task, shown on hover.
  kind?: string
  task?: string
}

export type Scene = {
  name: string
  status: string
  mood: Mood
  // Where his walk began while it runs, else null (in place).
  from: Spot | null
  // Seconds since that walk began, and how long it takes.
  elapsed: number
  dur: number
  // The room's width in pixels, to tell which way a walk goes.
  width: number
  outfit: OutfitId | null
  level: number
  turns: number
  phase: Phase
  weather: Weather
  season: Season
  // How your prompting makes him feel, and the tip that goes with it.
  feeling: Feeling | null
  tip: string | null
  // Haiku's clearer version of the prompt, shown on hovering the tip.
  rewrite: string | null
  usage: Usage
  // Your prompt-craft rank, beside his level.
  rank: string
  friends: FriendView[]
  // Newest first; the wall shows three.
  commits: { sha: string; message: string }[]
  hasPartyHat: boolean
  // Pieces of mess on the floor, and how many are being swept away.
  mess: number
  sweeping: number
  // Sticky notes on the corkboard, oldest first, each with its age in
  // seconds; and the one falling off, while it falls.
  notes: NoteView[]
  dropped: NoteView | null
  // His color, from how his needs are doing.
  body: string
  // Today's package by the door: waiting to be opened, or opening.
  parcel: 'waiting' | 'opening' | null
}

export type NoteView = { color: string; kind?: string; line: string; age: number }

export const HEIGHT = 96
const SCALE = 3
const FRIEND_SCALE = 0.55

// Where furniture stands, as a percentage of the width.
const AT = { window: 2, shelf: 14, board: 21, desk: 30, computer: 46, polaroids: 56, rug: 60, lamp: 68.5, parcel: 71.5, door: 76, wardrobe: 83, bed: 100 }

// Where today's package sits, for the button laid over it.
export const PARCEL_PCT = AT.parcel

const SPOTS = {
  shelf: { pct: AT.shelf, ux: 14, uy: 10 },
  desk: { pct: AT.desk, ux: -9, uy: 10 },
  computer: { pct: AT.computer, ux: -14, uy: 10 },
  rug: { pct: AT.rug, ux: 0, uy: 10 },
  door: { pct: AT.door, ux: -14, uy: 10 },
  bed: { pct: AT.bed, ux: -24, uy: 7 },
} satisfies Record<string, Spot>

export const CLAWD_SPOT: Record<Mood, Spot> = {
  idle: SPOTS.rug,
  thinking: SPOTS.rug,
  reading: SPOTS.shelf,
  writing: SPOTS.desk,
  running: SPOTS.computer,
  searching: SPOTS.shelf,
  delegating: SPOTS.door,
  waiting: SPOTS.rug,
  done: SPOTS.rug,
  error: SPOTS.rug,
  sleepy: SPOTS.bed,
  celebrating: SPOTS.rug,
  tidying: SPOTS.rug,
}

// A friend stands 9.9 units tall: feet on the floor at 28.
const FRIEND_UY = 28 - 18 * FRIEND_SCALE

export function friendSpot(where: FriendActivity | 'door', index: number): Spot {
  const step = index * 13

  switch (where) {
    case 'door':
      return { pct: AT.door, ux: 3, uy: FRIEND_UY }
    case 'reading':
    case 'searching':
      return { pct: AT.shelf, ux: 31 + step, uy: FRIEND_UY }
    // In front of the desk, clear of Clawd at the desk or the computer.
    case 'writing':
      return { pct: AT.desk, ux: 8 + step, uy: FRIEND_UY }
    case 'running':
      return { pct: AT.computer, ux: 25 + step, uy: FRIEND_UY }
    case 'thinking':
      return { pct: AT.rug, ux: -12 - step, uy: FRIEND_UY }
  }
}

const ROOM_STYLE = `
.drop,.bolt,.star,.cloud,.fish,.bulb,.glow{transform-box:fill-box}
.star{animation:twinkle 2.4s ease-in-out infinite}
.cloud{animation:drift 18s linear infinite}
.bolt{animation:bolt 2.6s infinite}
.fish{animation:swim 3s ease-in-out infinite}
.bulb{animation:lights 1.8s ease-in-out infinite}
.glow{animation:glow 4s ease-in-out infinite}
.saver{animation:saver 6s ease-in-out infinite}
.swept{transform-box:fill-box;transform-origin:50% 100%;animation:swept 1.6s ease-in both}
@keyframes swept{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.2) translateY(-4px)}}
.closeup .pet{transform-box:fill-box;transform-origin:50% 100%;animation:lean 1.8s ease-in-out infinite}
.closeup .arm.r{transform-box:fill-box;transform-origin:center;animation:knock 1.8s infinite}
.ripple{transform-box:fill-box;transform-origin:center;opacity:0;animation:ripple 1.8s ease-out infinite}
.zoomin{transform-box:fill-box;transform-origin:50% 100%;animation:zoomin .7s ease-out both}
@keyframes lean{0%,100%{transform:scale(1)}8%,22%{transform:scale(1.025)}}
@keyframes knock{0%,30%,100%{transform:scale(1)}8%,22%{transform:scale(1.8) translate(-.3px,-.3px)}14%{transform:scale(1.1)}}
@keyframes ripple{0%,7%{opacity:0;transform:scale(.2)}9%{opacity:.9;transform:scale(.3)}32%,100%{opacity:0;transform:scale(1.9)}}
@keyframes zoomin{from{opacity:0;transform:translateY(30px) scale(.35)}to{opacity:1;transform:none}}
.notepop{transform-box:fill-box;transform-origin:50% 0;animation:notepop .5s cubic-bezier(.3,1.6,.6,1) both}
.notefall{transform-box:fill-box;transform-origin:50% 0;animation:notefall 1.4s ease-in both}
@keyframes notepop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes notefall{0%{transform:rotate(0) translateY(0);opacity:1}20%{transform:rotate(-25deg) translateY(1px)}100%{transform:rotate(40deg) translate(2px,15px);opacity:0}}
.confetti{transform-box:fill-box;transform-origin:center;animation:fall 2.4s linear infinite}
.swing{transform-box:fill-box;transform-origin:50% 0;animation:swing 4s ease-in-out infinite}
@keyframes fall{0%{transform:translateY(-12px) rotate(0)}100%{transform:translateY(110px) rotate(540deg)}}
@keyframes swing{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
@keyframes drop{0%{transform:translateY(-3px);opacity:0}20%{opacity:1}100%{transform:translateY(9px);opacity:0}}
@keyframes bolt{0%,86%,100%{opacity:0}88%,93%{opacity:1}90%{opacity:.2}}
@keyframes twinkle{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes drift{0%{transform:translateX(-8px)}100%{transform:translateX(26px)}}
@keyframes glow{0%,100%{opacity:.55}50%{opacity:.8}}
@keyframes swim{0%,100%{transform:translateX(0)}50%{transform:translateX(2.4px)}}
@keyframes lights{0%,100%{opacity:1}50%{opacity:.35}}
`

const DEFS =
  '<defs><clipPath id="win"><rect x="4" y="4" width="22" height="14"/></clipPath>' +
  '<radialGradient id="lampglow"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".9"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>' +
  // Night on the actors layer: as the room's dark overlay, applied to them alone.
  '<filter id="nightdim"><feColorMatrix type="matrix" values=".68 0 0 0 .014  0 .68 0 0 .025  0 0 .68 0 .075  0 0 0 1 0"/></filter>' +
  '<linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".42" stop-color="#fff" stop-opacity=".2"/>' +
  '<stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".56" stop-color="#fff" stop-opacity=".12"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
  '<pattern id="stripes" width="18" height="72" patternUnits="userSpaceOnUse"><rect x="9" y="0" width="1.2" height="72" fill="#e3d6c2" opacity=".5"/></pattern></defs>'

// A piece drawn on its own grid, standing at a percentage of the width.
function place(pct: number, art: string): string {
  return `<svg x="${pct}%" y="0" overflow="visible"><g transform="scale(${SCALE})">${art}</g></svg>`
}

function walls(): string {
  return [
    '<rect x="0" y="0" width="100%" height="72" fill="#efe6d8"/>',
    '<rect x="0" y="0" width="100%" height="70" fill="url(#stripes)"/>',
    '<rect x="0" y="72" width="100%" height="24" fill="#c8a67e"/>',
    '<rect x="0" y="81.6" width="100%" height=".9" fill="#b8936a"/><rect x="0" y="90.6" width="100%" height=".9" fill="#b8936a"/>',
    '<rect x="0" y="70.2" width="100%" height="2.7" fill="#a98762"/>',
  ].join('')
}

const SKY: Record<Phase, string> = {
  day: '<rect x="4" y="4" width="22" height="14" fill="#9fd3ff"/><circle cx="9" cy="8" r="2.4" fill="#ffd54a"/>',
  dawn: '<rect x="4" y="4" width="22" height="14" fill="#f7c59f"/><rect x="4" y="4" width="22" height="4" fill="#b9c8ea"/><circle cx="8" cy="16.5" r="3" fill="#ffb347"/>',
  dusk: '<rect x="4" y="4" width="22" height="14" fill="#f28c6b"/><rect x="4" y="4" width="22" height="5" fill="#8d5b9e"/><circle cx="21" cy="16.5" r="3" fill="#ff7b54"/>',
  night: [
    '<rect x="4" y="4" width="22" height="14" fill="#1d2547"/>',
    '<circle cx="20" cy="8" r="2.6" fill="#f4f1c9"/><circle cx="21.3" cy="7.2" r="2.3" fill="#1d2547"/>',
    ...[
      [7, 7],
      [11, 12],
      [14, 6],
      [24, 14],
      [6, 15],
      [16, 15],
    ].map(([x, y], i) => `<rect class="star" x="${x}" y="${y}" width=".6" height=".6" fill="#fff" style="animation-delay:${i * 0.4}s"/>`),
  ].join(''),
}

function weather(kind: Weather, phase: Phase): string {
  if (kind === 'clear') {
    return phase === 'night'
      ? ''
      : '<g class="cloud"><ellipse cx="10" cy="10" rx="3" ry="1.3" fill="#fff" opacity=".9"/><ellipse cx="12" cy="9.3" rx="2.2" ry="1.5" fill="#fff" opacity=".9"/></g>'
  }

  const isStorm = kind === 'storm'
  const cloud = isStorm ? '#4f5564' : '#8e96a3'
  const speed = isStorm ? 0.6 : 0.9
  const drops = [7, 10, 13, 16, 19, 22, 25].map(
    (x, i) =>
      `<rect class="drop" x="${x}" y="8" width=".3" height="1.6" fill="#cfe3ff" style="animation:drop ${speed}s linear ${(i * 0.13).toFixed(2)}s infinite"/>`,
  )

  return [
    `<rect x="4" y="4" width="22" height="14" fill="${isStorm ? '#2b3142' : '#5b6475'}" opacity="${isStorm ? 0.65 : 0.45}"/>`,
    ...drops,
    isStorm ? '<path class="bolt" d="M16,7 L13.6,11.6 L15.6,11.6 L13.8,16 L18.2,10.4 L15.9,10.4 L17.4,7Z" fill="#ffe680"/>' : '',
    `<ellipse cx="9" cy="5.6" rx="4.2" ry="2" fill="${cloud}"/><ellipse cx="16" cy="5" rx="4.6" ry="2.2" fill="${cloud}"/><ellipse cx="22.5" cy="5.8" rx="3.6" ry="1.8" fill="${cloud}"/>`,
  ].join('')
}

// Drawn on the old 4..26 grid and moved down two units to clear the status.
function window(phase: Phase, kind: Weather, season: Season): string {
  return [
    '<g transform="translate(-4 2)">',
    `<g clip-path="url(#win)">${SKY[phase]}${seasonWindow(season, phase)}${weather(kind, phase)}</g>`,
    '<rect x="4" y="4" width="22" height="14" fill="none" stroke="#8b6b4a" stroke-width="1"/>',
    '<rect x="14.6" y="4" width=".8" height="14" fill="#8b6b4a"/><rect x="4" y="10.6" width="22" height=".8" fill="#8b6b4a"/>',
    '<rect x="3" y="18" width="24" height="1.2" fill="#a98762"/>',
    seasonSill(season),
    '</g>',
  ].join('')
}

const BOOK_COLORS = ['#c0392b', '#2e86c1', '#f2c14e', '#27ae60', '#8e44ad', '#e67e22']

// Three shelves of books; the one Clawd takes leaves a gap while he reads.
function bookshelf(isReading: boolean): string {
  const widths = [1.4, 1.8, 1.2, 1.6, 1.4, 1.8]
  const heights = [3.6, 3.2, 3.8, 3.4, 3.6, 3]
  const shelves = [12.2, 17.4, 22.6].map((floor, row) => {
    let x = 1.4

    return widths
      .map((width, i) => {
        const height = heights[(i + row) % heights.length] ?? 3.4
        const color = BOOK_COLORS[(i + row * 2) % BOOK_COLORS.length] ?? '#888'
        const book = isReading && row === 0 && i === 2 ? '' : `<rect x="${x.toFixed(1)}" y="${floor - height}" width="${width}" height="${height}" fill="${color}"/>`
        x += width + 0.3

        return book
      })
      .join('')
  })

  return [
    '<rect x="0" y="7" width="14" height="17" fill="#7a5232"/><rect x="1" y="8" width="12" height="15" fill="#5e3f27"/>',
    ...shelves,
    ...[12.2, 17.4, 22.6].map(y => `<rect x=".6" y="${y}" width="12.8" height=".8" fill="#7a5232"/>`),
  ].join('')
}

// On the window sill, clear of the status in the corner.
const PLANT =
  '<g transform="translate(0 5.6) scale(.6)"><path d="M28.4,20.4 L33.2,20.4 L32.6,24 L29,24Z" fill="#b5653a"/><rect x="28.2" y="20" width="5.2" height=".8" fill="#9c5530"/>' +
  '<ellipse cx="29.6" cy="17.6" rx="1" ry="2.6" fill="#5a9e4b" transform="rotate(-28 29.6 17.6)"/><ellipse cx="30.8" cy="16.8" rx="1" ry="3" fill="#6bb35a"/><ellipse cx="32" cy="17.6" rx="1" ry="2.6" fill="#5a9e4b" transform="rotate(28 32 17.6)"/></g>'

function desk(isWriting: boolean): string {
  const lines = [8.8, 10.6, 12.4, 14.2]
    .map((y, i) =>
      isWriting
        ? `<rect class="ink" x="11" y="${y}" width="6.5" height=".5" fill="#888" style="animation-delay:${i * 0.8}s"/>`
        : `<rect x="11" y="${y}" width="${6.5 - (i % 2) * 2}" height=".5" fill="#aaa"/>`,
    )
    .join('')

  return [
    '<rect x="0" y="17" width="22" height="1.2" fill="#8b5e3c"/><rect x="1" y="18.2" width="1.2" height="5.8" fill="#7a5232"/><rect x="19.8" y="18.2" width="1.2" height="5.8" fill="#7a5232"/>',
    '<rect x="14" y="18.2" width="5.6" height="3" fill="#7a5232"/><rect x="16.4" y="19.4" width=".8" height=".4" fill="#f2c14e"/>',
    '<rect x="13.6" y="15.4" width=".6" height="1.6" fill="#555"/><rect x="10" y="7" width="9" height="9" fill="#fff" stroke="#ccc" stroke-width=".3"/>',
    lines,
    '<rect x="19.2" y="15" width="2" height="2" fill="#e5534b"/><rect x="21.2" y="15.5" width=".6" height="1" fill="none" stroke="#e5534b" stroke-width=".3"/>',
  ].join('')
}

function computer(isRunning: boolean): string {
  const screen = isRunning
    ? '<rect x="7" y="7" width="12" height="7.6" fill="#1e1e1e"/><polyline points="8,9 9.2,10 8,11" fill="none" stroke="#7ee787" stroke-width=".5"/>' +
      '<rect class="flash" x="10" y="9.2" width="1" height="1.6" fill="#7ee787"/><rect class="ink" x="8" y="12" width="9" height=".4" fill="#666"/><rect class="ink" x="8" y="13.2" width="6" height=".4" fill="#666" style="animation-delay:.6s"/>'
    : '<rect x="7" y="7" width="12" height="7.6" fill="#22303c"/><rect class="saver" x="8" y="8" width="1.4" height="1.4" fill="#D97757"/>'

  return [
    '<rect x="0" y="17" width="24" height="1.2" fill="#8b5e3c"/><rect x="1" y="18.2" width="1.2" height="5.8" fill="#7a5232"/><rect x="21.8" y="18.2" width="1.2" height="5.8" fill="#7a5232"/>',
    '<rect x="6" y="6" width="14" height="9.6" rx=".6" fill="#2b2b2b"/>',
    screen,
    '<rect x="12.4" y="15.6" width="1.2" height="1.4" fill="#444"/><rect x="10.6" y="16.6" width="4.8" height=".4" fill="#444"/>',
    '<rect x="3" y="16.4" width="8" height=".6" fill="#9aa0a6"/>',
  ].join('')
}

const RUG = '<ellipse cx="11" cy="28.8" rx="13" ry="2.2" fill="#c9705b" opacity=".55"/><ellipse cx="11" cy="28.8" rx="10.5" ry="1.5" fill="none" stroke="#efe6d8" stroke-width=".3" opacity=".7"/>'

// The pieces below were drawn on the old 140-wide room; each translate
// moves one to its own grid.
const LAMP = '<g transform="translate(-84 0)"><rect x="86" y="10" width=".8" height="13.4" fill="#555"/><rect x="84.6" y="23" width="3.6" height="1" fill="#444"/><path d="M84,10 L88.8,10 L87.8,6.2 L85,6.2Z" fill="#f6d58e"/></g>'
const LAMP_GLOW = '<circle class="glow" cx="2.4" cy="11" r="10" fill="url(#lampglow)"/>'
const WARDROBE =
  '<g transform="translate(-103 0)"><rect x="103" y="8" width="10.4" height="16" fill="#8b5e3c"/><rect x="102.6" y="7.4" width="11.2" height="1" fill="#6f4a2f"/><rect x="108" y="9" width=".3" height="14" fill="#6f4a2f"/>' +
  '<circle cx="107.2" cy="16" r=".4" fill="#f2c14e"/><circle cx="109.1" cy="16" r=".4" fill="#f2c14e"/></g>'
const FISHBOWL =
  '<g transform="translate(-103 0)"><circle cx="108.2" cy="4.6" r="2.6" fill="#bfe3ff" opacity=".85" stroke="#9cc" stroke-width=".3"/><rect x="106.4" y="2" width="3.6" height=".5" fill="#9cc"/>' +
  '<g class="fish"><ellipse cx="107.4" cy="4.8" rx=".9" ry=".55" fill="#f28c28"/><path d="M106.5,4.8 L105.8,4.3 L105.8,5.3Z" fill="#f28c28"/></g></g>'
const POSTER =
  '<g transform="translate(-2 3) scale(.7) translate(-83 -3.6)"><rect x="74" y="4" width="9" height="11" fill="#fff" stroke="#ccc" stroke-width=".3"/><rect x="75" y="5" width="7" height="8" fill="#cfe6f5"/>' +
  '<path d="M75,13 L77.6,8.6 L79.4,11 L80.4,9.8 L82,13Z" fill="#6f9fc4"/><circle cx="80.4" cy="7" r="1" fill="#f2c14e"/><rect x="77.6" y="3.6" width="1.8" height=".8" fill="#e8dcb5" opacity=".9"/></g>'
const BED =
  '<g transform="translate(-140 0)"><rect x="116" y="14" width="2" height="12" fill="#8b5e3c"/><rect x="136.8" y="18" width="1.6" height="8" fill="#8b5e3c"/>' +
  '<rect x="117" y="20" width="21" height="2.4" fill="#fff"/><rect x="118" y="18.4" width="5" height="2.2" rx=".8" fill="#eef1fb"/>' +
  '<rect x="121.6" y="19.6" width="16.4" height="3.2" fill="#7fa6d9"/><rect x="121.6" y="19.6" width="16.4" height=".8" fill="#9dbbe3"/><rect x="116" y="22.4" width="22.4" height="2.4" fill="#8b5e3c"/></g>'

function door(isOpen: boolean): string {
  const frame = '<rect x="-.4" y="7.6" width="11.8" height="16" fill="#6f4a2f"/>'

  return isOpen
    ? `${frame}<rect x=".2" y="8.2" width="10.6" height="15.2" fill="#3b2f2a"/><rect x="-.8" y="8.2" width="1.4" height="15.2" fill="#9b6b43"/>`
    : `${frame}<rect x=".2" y="8.2" width="10.6" height="15.2" fill="#9b6b43"/><rect x="1.4" y="9.4" width="8.2" height="5.4" fill="none" stroke="#86593a" stroke-width=".3"/>` +
        '<rect x="1.4" y="16" width="8.2" height="6" fill="none" stroke="#86593a" stroke-width=".3"/><circle cx="9.2" cy="16" r=".5" fill="#f2c14e"/>'
}

function lights(): string {
  const colors = ['#f2c14e', '#e5534b', '#7ee787', '#7fb3d5']
  const count = 60
  const wire = Array.from({ length: count }, (_, i) => `${i * 8},${i % 2 === 0 ? 1.4 : 2.2}`).join(' ')
  const bulbs = Array.from(
    { length: count },
    (_, i) =>
      `<circle class="bulb" cx="${i * 8}" cy="${(i % 2 === 0 ? 1.4 : 2.2) + 0.6}" r=".6" fill="${colors[i % colors.length]}" style="animation-delay:${(i % 4) * 0.45}s"/>`,
  )

  return `<polyline points="${wire}" fill="none" stroke="#555" stroke-width=".2"/>${bulbs.join('')}`
}

// Someone standing at a spot, or walking there from another one over `dur`
// seconds. The walk animates the percentage and the offset together, legs
// stepping and facing the way they go, and what they hold appears once they
// arrive. A redraw while the walk runs (another write landing) starts every
// animation `elapsed` seconds in, so the walk carries on instead of
// restarting.
type Walking = { at: Spot; from: Spot | null; elapsed: number; dur: number; width: number }

// A spot in pixels on a room `width` pixels wide: the room's frame is drawn
// at that width, so a percentage of it is known exactly.
function pixels(spot: Spot, width: number): [number, number] {
  return [Math.round(((spot.pct / 100) * width + spot.ux * SCALE) * 10) / 10, Math.round(spot.uy * SCALE * 10) / 10]
}

// A CSS animation of its own for one actor's walk (`id` tells actors apart
// in a drawing): plain pixel translates, as the app's frame plays CSS
// reliably and did not interpolate SMIL percentages (he sat at the left edge
// until the walk ended).
function walkStyle(id: string, from: [number, number], to: [number, number], begin: string, dur: number, fade: string): string {
  return (
    `<style>@keyframes walk-${id}{from{transform:translate(${from[0]}px,${from[1]}px)}to{transform:translate(${to[0]}px,${to[1]}px)}}` +
    `.walk-${id}{animation:walk-${id} ${dur}s linear ${begin} both}${fade}</style>`
  )
}

function actor(id: string, walk: Walking, scale: number, look: string, held: string, isLeaving = false): string {
  const { at, from, elapsed, dur, width } = walk
  const isWalking = from !== null && dur > 0 && !isSameSpot(from, at)
  const begin = `${(-Math.max(0, elapsed)).toFixed(2)}s`
  const to = pixels(at, width)
  // A friend walking out fades as it reaches the door.
  const fade = isLeaving
    ? `@keyframes leave-${id}{from{opacity:1}to{opacity:0}}.leave-${id}{animation:leave-${id} .4s linear ${(Math.max(0, dur - 0.3) - Math.max(0, elapsed)).toFixed(2)}s both}`
    : ''
  const style = isWalking ? ` style="--d:${begin};--w:${dur}s;--n:${Math.max(1, Math.round(dur / 0.3))}"` : ''
  const facing = isWalking && isLeftward(from, at, width) ? ' leftward' : ''
  const body =
    `<g transform="scale(${scale})">` +
    `<g class="${isWalking ? `walking${facing}` : ''}">${look}</g><g class="${isWalking ? 'arrive' : ''}">${held}</g></g>`
  const place = isWalking
    ? `<g class="walk-${id}" data-walk="${from.pct}%>${at.pct}%" data-begin="${begin}" data-dur="${dur}"${style}>${body}</g>`
    : `<g transform="translate(${to[0]} ${to[1]})">${body}</g>`

  return (
    (isWalking || isLeaving ? walkStyle(id, isWalking ? pixels(from, width) : to, to, begin, dur, fade) : '') +
    (isLeaving ? `<g class="leave-${id}">${place}</g>` : place)
  )
}

const FRIEND_PX = SCALE * FRIEND_SCALE

const NOTE_TILT = [-6, 4, -3, 6, -4]

// One sticky note in slot `i`, its pin at the top. Its tooltip (who wrote it
// and the first line of their report) is the actors layer's hover spot.
function stickyNote(note: NoteView, i: number, anim = ''): string {
  const x = 1.3 + i * 3.7
  const tip = note.kind === undefined ? note.line : `${note.kind}: ${note.line}`

  return (
    `<g transform="translate(${x.toFixed(1)} 6.2) rotate(${NOTE_TILT[i] ?? 0} 1.6 0)"><g${anim}>` +
    `<rect x="0" y="0" width="3.2" height="3.2" fill="${note.color}"/><path d="M2.4,3.2 L3.2,2.4 L3.2,3.2Z" fill="#000" opacity=".15"/>` +
    '<rect x=".5" y="1.2" width="2.1" height=".22" fill="#000" opacity=".25"/><rect x=".5" y="1.9" width="1.5" height=".22" fill="#000" opacity=".25"/>' +
    '<circle cx="1.6" cy=".3" r=".4" fill="#e5534b"/></g></g>'
  )
}

// A corkboard between the shelf and the desk where friends leave notes.
function corkboard(list: NoteView[], fell: NoteView | null): string {
  const dots = [
    [3, 11.6],
    [8.4, 12.4],
    [14, 11.4],
    [18, 12.6],
    [6, 5.2],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".25" fill="#a9773f"/>`)
    .join('')
  const pinned = list.map((note, i) => {
    const pop = note.age < 2.5 ? ` class="notepop" style="animation-delay:${(0.9 - note.age).toFixed(2)}s"` : ''

    return stickyNote(note, i, pop)
  })
  const falling = fell === null ? '' : stickyNote(fell, 0, ` class="notefall" style="animation-delay:${(-fell.age).toFixed(2)}s"`)

  return (
    '<rect x="0" y="4" width="20" height="9.6" fill="#8b5e3c"/><rect x=".6" y="4.6" width="18.8" height="8.4" fill="#d4a76a"/>' +
    dots +
    pinned.join('') +
    falling
  )
}

// A name tag over a friend's head in its own color, on its own grid;
// neighbours alternate heights so their tags do not collide.
function nameTag(kind: string, color: string, index: number): string {
  // A plugin's agent (`plugin:agent`) goes by its own name.
  const name = kind.split(':').pop() ?? kind
  const text = name.length > 12 ? `${name.slice(0, 11)}…` : name
  const width = text.length * 2.45 + 3
  const y = index % 2 === 0 ? -1.4 : -6.6

  return (
    `<rect x="${(11 - width / 2).toFixed(2)}" y="${y}" width="${width.toFixed(2)}" height="5" rx="1.6" fill="${color}" stroke="#fff" stroke-width=".35"/>` +
    `<text x="11" y="${y + 3.7}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="600" font-size="4" fill="#2b2b2b">${escape(text)}</text>`
  )
}

function friends(list: FriendView[], width: number, withTips: boolean): string {
  return list
    .slice(0, 3)
    .map((one, i) => {
      const at = friendSpot(one.isLeaving ? 'door' : one.activity, i)
      const art = friend(one.activity, one.color)
      const tip = [one.kind, one.task].filter(Boolean).join(': ')
      const title = tip === '' || !withTips ? '' : `<title>${escape(tip)}</title>`
      const tag = one.kind === undefined ? '' : nameTag(one.kind, one.color, i)

      return actor(`f${i}`, { at, from: one.from, elapsed: one.elapsed, dur: one.dur, width }, FRIEND_PX, `<g class="friend">${title}${art}${tag}</g>`, '', one.isLeaving)
    })
    .join('')
}

// Waiting on you: he comes right up to the glass, tilted, and knocks on it;
// ripples spread from his knuckles and leave smudges behind. Drawn 7x, his
// legs below the frame.
function closeup(scene: Scene): string {
  const delay = `animation-delay:${(-Math.max(0, scene.elapsed)).toFixed(2)}s`
  const smudges = [
    [17.2, 9.4, 0.9, 0.6],
    [19.4, 11.8, 0.7, 0.5],
    [18.6, 8.6, 0.5, 0.35],
  ]
    .map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".22"/>`)
    .join('')
  const ripples = [0, 0.25]
    .map(at => `<circle class="ripple" cx="18" cy="11" r="2.2" fill="none" stroke="#fff" stroke-width=".35" style="animation-delay:${at}s"/>`)
    .join('')

  return (
    '<svg x="50%" y="0" overflow="visible"><g transform="translate(-77 -24) rotate(-7 77 60)">' +
    `<g class="zoomin" style="${delay}"><g transform="scale(7)">` +
    `<g class="closeup">${critter('waiting', scene.outfit, scene.hasPartyHat, hasScarf(scene.season), scene.body)}</g>${smudges}${ripples}` +
    '</g></g></g></svg>'
  )
}

// A crumpled page, a coffee cup, a pizza box, a sock: each sits on the floor
// in front of the furniture, at y 26..30.
const MESS_ART = {
  paper:
    '<circle cx="1.2" cy="28.8" r="1.2" fill="#f4f1ea" stroke="#c9c2b5" stroke-width=".2"/><path d="M.4,28.4 L1.4,29 L2,28.2 M.8,29.6 L1.6,28.9" fill="none" stroke="#c9c2b5" stroke-width=".2"/>',
  cup: '<path d="M0,27.2 L2,27.2 L1.7,30 L.3,30Z" fill="#fff" stroke="#ccc" stroke-width=".2"/><rect x=".1" y="28" width="1.8" height=".9" fill="#8b5e3c"/><rect x="-.2" y="26.8" width="2.4" height=".5" fill="#ddd"/>',
  pizza:
    '<rect x="0" y="28.4" width="5.6" height="1.4" fill="#d9b27c" stroke="#b8936a" stroke-width=".2"/><path d="M0,28.4 L1.2,25.6 L6.8,25.6 L5.6,28.4Z" fill="#e6c48f" stroke="#b8936a" stroke-width=".2"/><circle cx="3.6" cy="27" r=".5" fill="#c0392b"/>',
  sock: '<path d="M0,27 L1.2,27 L1.2,29 L2.8,29 L2.8,30 L0,30Z" fill="#7fb3d5"/><rect x="0" y="27.6" width="1.2" height=".4" fill="#fff"/>',
}

// Where each piece lands, in the order they pile up: a floor spot by
// percentage and offset, clear of the spots people stand at.
const MESS_SPOTS: { kind: keyof typeof MESS_ART; pct: number; ux: number }[] = [
  { kind: 'paper', pct: 8, ux: 2 },
  { kind: 'cup', pct: 24, ux: 6 },
  { kind: 'paper', pct: 40, ux: 6 },
  { kind: 'sock', pct: 54, ux: 2 },
  { kind: 'paper', pct: 68, ux: 4 },
  { kind: 'pizza', pct: 88, ux: -2 },
  { kind: 'cup', pct: 36, ux: 2 },
  { kind: 'paper', pct: 20, ux: 1 },
  { kind: 'sock', pct: 12, ux: 4 },
  { kind: 'cup', pct: 46, ux: 1 },
  { kind: 'paper', pct: 60, ux: 3 },
  { kind: 'cup', pct: 76, ux: 2 },
  { kind: 'paper', pct: 94, ux: -4 },
  { kind: 'sock', pct: 30, ux: 3 },
  { kind: 'paper', pct: 64, ux: -1 },
  { kind: 'cup', pct: 4, ux: 3 },
]

export const MAX_MESS = MESS_SPOTS.length

function mess(count: number, sweeping: number): string {
  return MESS_SPOTS.slice(0, Math.max(count, sweeping))
    .map((spot, i) => {
      // Drawn 1.7x from its base on the floor, so it reads at band size.
      const art = `<g class="mess" transform="translate(0 30) scale(1.7) translate(0 -30)">${MESS_ART[spot.kind]}</g>`
      const piece = i < count ? art : `<g class="swept" style="animation-delay:${(0.3 + i * 0.25).toFixed(2)}s">${art}</g>`

      return `<svg x="${spot.pct}%" y="0" overflow="visible"><g transform="translate(${spot.ux * SCALE} 0) scale(${SCALE})">${piece}</g></svg>`
    })
    .join('')
}

const CONFETTI_COLORS = ['#e5534b', '#f2c14e', '#7ee787', '#7fb3d5', '#c39bd3', '#D97757']

// Falls across the whole room while he dances.
function confetti(): string {
  return Array.from({ length: 48 }, (_, i) => {
    const x = (i * 37 + 11) % 100
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? '#f2c14e'
    const delay = ((i * 7) % 24) / 10

    return `<rect class="confetti" x="${x}%" y="-6" width="${i % 3 === 0 ? 5 : 4}" height="${i % 2 === 0 ? 7 : 4}" fill="${color}" style="animation-delay:-${delay}s"/>`
  }).join('')
}

const PHOTO_COLORS = ['#7fb3d5', '#a3d977', '#f7c873', '#c39bd3', '#f4a3a3', '#8fd3c8']

// Up to three framed commits on a string, newest on the left; hovering one
// shows its message.
function polaroids(commits: { sha: string; message: string }[]): string {
  if (commits.length === 0) {
    return ''
  }

  const shown = commits.slice(0, 3)
  const frames = shown.map((one, i) => {
    const color = PHOTO_COLORS[parseInt(one.sha.slice(0, 2), 16) % PHOTO_COLORS.length] ?? '#7fb3d5'
    const tilt = i % 2 === 0 ? -4 : 4

    return (
      `<g transform="translate(${i * 7.8} 2.6) rotate(${tilt} 3.1 0)"><g class="swing" style="animation-delay:${i * 0.7}s">` +
      '<rect x="0" y="0" width="6.2" height="7.4" fill="#fff" stroke="#ddd" stroke-width=".2"/>' +
      `<rect x=".6" y=".6" width="5" height="4.6" fill="${color}"/>` +
      '<polyline points="1.9,3 2.8,3.9 4.4,2" fill="none" stroke="#fff" stroke-width=".55"/>' +
      `<text x="3.1" y="6.7" text-anchor="middle" font-family="monospace" font-size="1.25" fill="#555">${escape(one.sha.slice(0, 7))}</text>` +
      '<circle cx="3.1" cy=".1" r=".5" fill="#e5534b"/></g></g>'
    )
  })
  const width = shown.length * 7.8 - 1.6

  return `<polyline points="-.6,2.2 ${(width / 2).toFixed(1)},3 ${(width + 0.6).toFixed(1)},2.2" fill="none" stroke="#8a7f72" stroke-width=".2"/>${frames.join('')}`
}

// His shadow, under his feet wherever he stands or walks.
const SHADOW = '<ellipse cx="11" cy="18.6" rx="6.5" ry=".7" fill="#000" opacity=".18"/>'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function resetText(resetsAt: string | undefined, withDay: boolean): string {
  if (resetsAt === undefined) {
    return ''
  }

  const at = new Date(resetsAt)

  if (Number.isNaN(at.getTime())) {
    return ''
  }

  const hour = at.getHours() % 12 === 0 ? 12 : at.getHours() % 12
  const time = `${hour}:${String(at.getMinutes()).padStart(2, '0')} ${at.getHours() < 12 ? 'AM' : 'PM'}`

  return `, resets ${withDay ? `${DAYS[at.getDay()]} ` : ''}${time}`
}

const METER_ROWS = (usage: Usage): [string, string, Meter | null, boolean][] => [
  ['Context', 'ctx', usage.context, false],
  ['Session limit (5h)', '5h', usage.session, false],
  ['Weekly limit', 'wk', usage.week, true],
]

function meterTip(name: string, meter: Meter | null, withDay: boolean): string {
  return meter === null
    ? `${name}: no reading yet`
    : `${name}: ${Math.round(Math.max(0, Math.min(100, meter.percent)))}% used${resetText(meter.resetsAt, withDay)}`
}

// The three meters as the row under the room shows them: the context
// window, the 5-hour session limit and the weekly limit. Amber from 80%,
// red from 95%; the reset time shows once a limit is that high.
export function meterReadings(usage: Usage): { label: string; text: string; level: 'none' | 'ok' | 'high' | 'full'; tip: string }[] {
  return METER_ROWS(usage).map(([name, label, meter, withDay]) => {
    const percent = meter === null ? null : Math.round(Math.max(0, Math.min(100, meter.percent)))
    const level = percent === null ? 'none' : percent >= 95 ? 'full' : percent >= 80 ? 'high' : 'ok'
    const reset = meter === null || level === 'ok' ? '' : resetText(meter.resetsAt, withDay).replace(/^, /, ' · ')

    return { label, text: percent === null ? '–' : `${percent}%${reset}`, level, tip: meterTip(name, meter, withDay) }
  })
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// The busy shelf, desk and computer, and the open door: drawn in the actors
// layer over the still ones in the room layer, so the room itself does not
// change when he picks up a book or friends come in.
const SHELF_GAP = '<rect x="5.2" y="8.4" width="1.2" height="3.8" fill="#5e3f27"/>'
const DESK_INK =
  '<rect x="10.2" y="7.2" width="8.6" height="8.6" fill="#fff"/>' +
  [8.8, 10.6, 12.4, 14.2]
    .map((y, i) => `<rect class="ink" x="11" y="${y}" width="6.5" height=".5" fill="#888" style="animation-delay:${i * 0.8}s"/>`)
    .join('')
const SCREEN_BUSY =
  '<rect x="7" y="7" width="12" height="7.6" fill="#1e1e1e"/><polyline points="8,9 9.2,10 8,11" fill="none" stroke="#7ee787" stroke-width=".5"/>' +
  '<rect class="flash" x="10" y="9.2" width="1" height="1.6" fill="#7ee787"/><rect class="ink" x="8" y="12" width="9" height=".4" fill="#666"/><rect class="ink" x="8" y="13.2" width="6" height=".4" fill="#666" style="animation-delay:.6s"/>'

// Rain or a storm over the window's sky, clipped to the glass.
function weatherOverlay(kind: Weather, phase: Phase): string {
  return kind === 'clear' ? '' : place(AT.window, `<g transform="translate(-4 2)"><g clip-path="url(#win)">${weather(kind, phase)}</g></g>`)
}

// Invisible hover targets over the notes and polaroids, carried by the actors
// layer: its frame sits over the room's, so the room's own tooltips never get
// the pointer.
function hotspots(scene: Scene): string {
  const frames = scene.commits.slice(0, 3).map((one, i) =>
    `<rect x="${(i * 7.8).toFixed(1)}" y="2.6" width="6.2" height="7.4" fill="#000" fill-opacity="0"><title>${escape(one.message)} (${escape(one.sha)})</title></rect>`,
  )
  const notes = scene.notes.map((one, i) => {
    const tip = one.kind === undefined ? one.line : `${one.kind}: ${one.line}`

    return `<rect x="${(1.3 + i * 3.7).toFixed(1)}" y="6" width="3.4" height="3.6" fill="#000" fill-opacity="0"><title>${escape(tip)}</title></rect>`
  })

  return place(AT.polaroids, frames.join('')) + place(AT.board, notes.join(''))
}

// The room itself: walls, window, furniture, decor, what hangs on the wall,
// and the light of the time of day. It changes only on rare events (a commit,
// a friend's note, nightfall, a new level), so it is rarely reloaded.
function roomContent(scene: Scene): string {
  const items = unlockedItems(scene.level)
  const isNight = scene.phase === 'night'

  return [
    walls(),
    place(AT.window, window(scene.phase, 'clear', scene.season)),
    place(AT.window, seasonCorner(scene.season, isNight)),
    items.has('plant') ? place(AT.window, PLANT) : '',
    place(AT.shelf, bookshelf(false)),
    place(AT.desk, desk(false)),
    place(AT.computer, computer(false)),
    items.has('rug') ? place(AT.rug, RUG) : '',
    items.has('lamp') ? place(AT.lamp, LAMP) : '',
    place(AT.door, door(false)),
    items.has('wardrobe') ? place(AT.wardrobe, WARDROBE) : '',
    items.has('fishbowl') ? place(AT.wardrobe, FISHBOWL) : '',
    items.has('poster') ? place(AT.bed, POSTER) : '',
    place(AT.polaroids, polaroids(scene.commits)),
    place(AT.board, corkboard(scene.notes, scene.dropped)),
    place(AT.bed, BED),
    seasonWall(scene.season, scene.width),
    isNight ? '<rect x="0" y="0" width="100%" height="100%" fill="#0b1030" opacity=".32"/>' : '',
    scene.phase === 'dawn' || scene.phase === 'dusk' ? '<rect x="0" y="0" width="100%" height="100%" fill="#ff9a5a" opacity=".07"/>' : '',
    isNight && items.has('lamp') ? place(AT.lamp, LAMP_GLOW) : '',
    items.has('lights') ? place(28, lights()) : '',
  ].join('')
}

// Today's package on the floor by the door: taped shut and bobbing until
// you open it, then flaps up with sparkles rising out.
const PARCEL =
  '<g class="parcel"><rect x="0" y="25.4" width="6.6" height="4.6" fill="#c8955a" stroke="#9c6e3c" stroke-width=".25"/>' +
  '<rect x="-.2" y="24.8" width="7" height="1" fill="#b9844c" stroke="#9c6e3c" stroke-width=".2"/>' +
  '<rect x="2.9" y="24.8" width=".8" height="5.2" fill="#e9d29a"/><path d="M3.3,24.8 C2.2,23.4 1.4,24.2 3.3,24.8 C5.2,24.2 4.4,23.4 3.3,24.8Z" fill="#e5534b"/></g>'
const PARCEL_OPEN =
  '<rect x="0" y="25.4" width="6.6" height="4.6" fill="#c8955a" stroke="#9c6e3c" stroke-width=".25"/>' +
  '<path d="M0,25.4 L-1.8,23.2 L.8,23.2 L2,25.4Z M6.6,25.4 L8.4,23.2 L5.8,23.2 L4.6,25.4Z" fill="#b9844c" stroke="#9c6e3c" stroke-width=".2"/>' +
  [0, 1, 2].map(i => `<path class="rise" d="M${1.6 + i * 1.6},23 l.4,1 1,.4 -1,.4 -.4,1 -.4,-1 -1,-.4 1,-.4Z" fill="#f2c14e" style="animation-duration:1.6s;animation-delay:${(i * 0.35).toFixed(2)}s"/>`).join('')

// Everything that moves with the session: Clawd and his friends, what they
// use and hold, the mess, the weather at the window, his status and your tip.
// At night it dims itself, as the room layer below does.
// `withTips`: carry the tooltips (it is the top interactive layer), or leave
// them to the hover layer (it is drawn as an image).
function actorsContent(scene: Scene, withTips = true): string {
  const isNight = scene.phase === 'night'
  const isWaiting = scene.mood === 'waiting'
  const clawd = actor(
    'clawd',
    { at: CLAWD_SPOT[scene.mood], from: scene.from, elapsed: scene.elapsed, dur: scene.dur, width: scene.width },
    SCALE,
    `${scene.mood === 'sleepy' ? '' : SHADOW}<g class="clawd">${critter(scene.mood, scene.outfit, scene.hasPartyHat, hasScarf(scene.season), scene.body)}</g>` +
      (scene.feeling === null || scene.mood === 'sleepy' ? '' : `<g class="emote">${EMOTES[scene.feeling]}</g>`),
    PROPS[scene.mood],
  )
  const busy = [
    scene.mood === 'reading' ? place(AT.shelf, SHELF_GAP) : '',
    scene.mood === 'writing' ? place(AT.desk, DESK_INK) : '',
    scene.mood === 'running' ? place(AT.computer, SCREEN_BUSY) : '',
    scene.friends.length > 0 ? place(AT.door, door(true)) : '',
    weatherOverlay(scene.weather, scene.phase),
    mess(Math.min(scene.mess, MAX_MESS), Math.min(scene.sweeping, MAX_MESS)),
    scene.parcel === null ? '' : place(AT.parcel, scene.parcel === 'waiting' ? PARCEL : PARCEL_OPEN),
    friends(scene.friends, scene.width, withTips),
    isWaiting ? '' : clawd,
  ].join('')

  return [
    isNight ? `<g filter="url(#nightdim)">${busy}</g>` : busy,
    scene.mood === 'celebrating' ? confetti() : '',
    // While he waits at the glass, the room behind him frosts over.
    isWaiting ? '<rect x="0" y="0" width="100%" height="100%" fill="#f4efe6" opacity=".38"/>' : '',
    isWaiting ? '<rect x="0" y="0" width="100%" height="100%" fill="#1d1a16" opacity=".1"/>' : '',
    isWaiting ? closeup(scene) : '',
    isWaiting ? '<rect x="0" y="0" width="100%" height="100%" fill="url(#glass)"/>' : '',
    withTips ? hotspots(scene) : '',
    scene.tip === null
      ? ''
      : `<text x="10" y="93" font-family="system-ui,sans-serif" font-size="8.5" font-style="italic" fill="${isNight ? '#f6eddc' : '#4a3524'}">` +
        (scene.rewrite === null || !withTips ? '' : `<title>Try: ${escape(scene.rewrite)}</title>`) +
        `💡 ${escape(scene.tip)}${scene.rewrite === null ? '' : ' · ✍ hover for a rewrite'}</text>`,
  ].join('')
}

function svgDoc(content: string, mood: Mood | null, width: number | string = '100%', height = HEIGHT): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" shape-rendering="crispEdges">` +
    `<style>${PET_STYLE}${ROOM_STYLE}${SEASON_STYLE}${mood === null ? '' : MOTION[mood]}</style>${DEFS}${content}</svg>`
  )
}

// Every tooltip, as transparent hover spots and nothing visible: the top
// layer when the others are drawn as images, which take no hover. Its frame
// reloading shows nothing, so it never flickers.
function hoverContent(scene: Scene): string {
  const nothing = 'fill="#000" fill-opacity="0"'
  const friendSpots = scene.friends.slice(0, 3).map((one, i) => {
    const tip = [one.kind, one.task].filter(Boolean).join(': ')
    const [x, y] = pixels(friendSpot(one.isLeaving ? 'door' : one.activity, i), scene.width)

    return tip === '' ? '' : `<rect x="${x + 7}" y="${y + 10}" width="22" height="20" ${nothing}><title>${escape(tip)}</title></rect>`
  })
  const tipSpot =
    scene.tip === null || scene.rewrite === null
      ? ''
      : `<rect x="8" y="84" width="${Math.min(scene.width - 20, 520)}" height="12" ${nothing}><title>Try: ${escape(scene.rewrite)}</title></rect>`

  return (
    hotspots(scene) +
    friendSpots.join('') +
    tipSpot
  )
}

// The room as stacked layers, each its own drawing, so a change of state
// reloads only the layer it touches: the room (rarely), the actors (when
// someone moves). The meters are a row of text under the room.
// As images, the tooltips move to the hover layer; as interactive frames,
// the actors layer carries them and there is no hover layer.
export function layers(scene: Scene, asImages: boolean): { room: string; actors: string; hover: string } {
  return {
    room: svgDoc(roomContent(scene), null),
    actors: svgDoc(actorsContent(scene, !asImages), scene.mood),
    hover: asImages ? `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${HEIGHT}">${hoverContent(scene)}</svg>` : '',
  }
}

// The whole room as one drawing: for surfaces or settings that do not stack.
export function room(scene: Scene): string {
  return svgDoc(roomContent(scene) + actorsContent(scene), scene.mood)
}

export function phaseAt(hour: number): Phase {
  if (hour >= 6 && hour < 8) {
    return 'dawn'
  }

  if (hour >= 8 && hour < 18) {
    return 'day'
  }

  if (hour >= 18 && hour < 21) {
    return 'dusk'
  }

  return 'night'
}

// The needs row under the room: five labeled bars across the width, green,
// amber when low, red when nearly empty. It sits on the app's own
// background, so its ink is a grey that reads in light and dark themes.
export const NEEDS_HEIGHT = 22

export type NeedView = { name: string; value: number; tip: string }

function needColor(value: number): string {
  return value < 10 ? '#d64545' : value < 35 ? '#e8a33d' : '#5a9e4b'
}

export function needsRow(needs: NeedView[], withTips: boolean): string {
  const share = 100 / needs.length
  const cells = needs.map((one, i) => {
    const filled = Math.max(0, Math.min(100, one.value))

    return (
      `<svg x="${(i * share).toFixed(2)}%" y="0" width="${share.toFixed(2)}%" height="${NEEDS_HEIGHT}" overflow="hidden">` +
      (withTips ? `<title>${escape(one.tip)}</title>` : '') +
      `<text x="2" y="8" font-family="system-ui,sans-serif" font-size="8" fill="#8b8b8b">${escape(one.name)}</text>` +
      '<rect x="2" y="12" width="88%" height="4.5" rx="2" fill="#8b8b8b" fill-opacity=".25"/>' +
      `<rect x="2" y="12" width="${((88 * filled) / 100).toFixed(1)}%" height="4.5" rx="2" fill="${needColor(filled)}"/></svg>`
    )
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${NEEDS_HEIGHT}" shape-rendering="geometricPrecision">${cells.join('')}</svg>`
}

// The needs' tooltips alone, invisible: laid over the row when it is drawn
// as an image.
export function needsHover(needs: NeedView[]): string {
  const share = 100 / needs.length
  const spots = needs.map(
    (one, i) =>
      `<rect x="${(i * share).toFixed(2)}%" y="0" width="${share.toFixed(2)}%" height="${NEEDS_HEIGHT}" fill="#000" fill-opacity="0"><title>${escape(one.tip)}</title></rect>`,
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${NEEDS_HEIGHT}">${spots.join('')}</svg>`
}
