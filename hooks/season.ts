// The room's decor for the time of year. Each piece is drawn where the room
// places it: in the window (its own 4..26 grid, clipped to the glass), on the
// sill, in the floor corner under the window, or across the wall.

import type { Phase, Season } from '../types'

export const SEASONS: Season[] = ['winter', 'valentine', 'spring', 'summer', 'autumn', 'halloween', 'christmas']

// Which season a month (1-12) is in.
export function seasonOf(month: number): Season {
  switch (month) {
    case 1:
      return 'winter'
    case 2:
      return 'valentine'
    case 3:
    case 4:
    case 5:
      return 'spring'
    case 6:
    case 7:
    case 8:
      return 'summer'
    case 10:
      return 'halloween'
    case 12:
      return 'christmas'
    default:
      return 'autumn'
  }
}

const SNOWY = new Set<Season>(['winter', 'valentine', 'christmas'])
const LEAFY = new Set<Season>(['autumn', 'halloween'])

// The cold months put a scarf on him.
export function hasScarf(season: Season) {
  return SNOWY.has(season)
}

export const SEASON_STYLE = `
.flake,.leaf,.fly,.wing,.burst,.rock,.flap{transform-box:fill-box}
.flake{animation:snow 5s linear infinite}
.leaf{transform-origin:center;animation:leaf 6s ease-in-out infinite}
.fly{animation:flit 8s ease-in-out infinite}
.wing{transform-origin:50% 50%;animation:wing .25s ease-in-out infinite}
.burst{transform-origin:center;opacity:0;animation:burst 2.6s ease-out infinite}
.rock{transform-origin:50% 100%;animation:rock 3s ease-in-out infinite}
.flap{transform-origin:50% 50%;animation:flap .6s ease-in-out infinite}
.hang{transform-box:fill-box;transform-origin:50% 0;animation:hang 5s ease-in-out infinite}
.glide{transform-box:fill-box;animation:glide 4s ease-in-out infinite}
@keyframes snow{0%{transform:translate(0,-2px);opacity:0}10%{opacity:1}50%{transform:translate(1px,7px)}100%{transform:translate(-1px,16px);opacity:.2}}
@keyframes leaf{0%{transform:translate(0,-2px) rotate(0);opacity:0}10%{opacity:1}50%{transform:translate(2px,7px) rotate(140deg)}100%{transform:translate(-1px,16px) rotate(300deg);opacity:0}}
@keyframes flit{0%,100%{transform:translate(0,0)}25%{transform:translate(7px,-3px)}50%{transform:translate(13px,1px)}75%{transform:translate(5px,3px)}}
@keyframes wing{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.25)}}
@keyframes burst{0%{opacity:0;transform:scale(.1)}8%{opacity:1}45%{opacity:.9;transform:scale(1)}70%,100%{opacity:0;transform:scale(1.15)}}
@keyframes rock{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes flap{0%,100%{transform:scaleY(1)}50%{transform:scaleY(-.3)}}
@keyframes hang{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes glide{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
`

const LEAF = 'M0,0 C.9,-1 2,-.5 2,.5 C1,1.1 .1,.8 0,0Z'
const LEAF_COLORS = ['#e8812a', '#c0392b', '#f2c14e', '#b5653a', '#d35400']

// Behind the session's weather, inside the glass.
export function seasonWindow(season: Season, phase: Phase): string {
  if (SNOWY.has(season)) {
    return Array.from({ length: 14 }, (_, i) => {
      const x = 5 + ((i * 7) % 21)
      const y = 3 + ((i * 5) % 6)

      return `<circle class="flake" cx="${x}" cy="${y}" r="${i % 3 === 0 ? 0.45 : 0.32}" fill="#fff" style="animation-delay:-${((i * 0.37) % 5).toFixed(2)}s;animation-duration:${4 + (i % 3)}s"/>`
    }).join('')
  }

  if (LEAFY.has(season)) {
    return Array.from({ length: 6 }, (_, i) => {
      const x = 6 + ((i * 9) % 19)
      const color = LEAF_COLORS[i % LEAF_COLORS.length] ?? '#e8812a'

      return `<g transform="translate(${x} 4)"><path class="leaf" d="${LEAF}" fill="${color}" style="animation-delay:-${(i * 1.1).toFixed(1)}s"/></g>`
    }).join('')
  }

  if (season === 'spring') {
    return (
      '<g transform="translate(7 9)"><g class="fly"><ellipse class="wing" cx="0" cy="0" rx="1.1" ry=".8" fill="#f4a3c4"/>' +
      '<ellipse class="wing" cx="0" cy="1" rx=".8" ry=".6" fill="#c39bd3"/><rect x="-.15" y="-.6" width=".3" height="2" fill="#3b2f2a"/></g></g>'
    )
  }

  if (season === 'summer' && phase === 'night') {
    const colors = ['#f2c14e', '#e5534b', '#7fb3d5']

    return [
      [9, 8],
      [17, 6],
      [22, 10],
    ]
      .map(([x, y], i) => {
        const rays = Array.from({ length: 8 }, (_, k) => {
          const angle = (k * Math.PI) / 4
          const dx = (Math.cos(angle) * 2.6).toFixed(2)
          const dy = (Math.sin(angle) * 2.6).toFixed(2)

          return `<line x1="0" y1="0" x2="${dx}" y2="${dy}" stroke="${colors[i]}" stroke-width=".35" stroke-linecap="round"/>`
        }).join('')

        return `<g transform="translate(${x} ${y})"><g class="burst" style="animation-delay:${(i * 0.85).toFixed(2)}s">${rays}</g></g>`
      })
      .join('')
  }

  return ''
}

// On the window sill, in front of the glass (same grid as the window).
export function seasonSill(season: Season): string {
  if (SNOWY.has(season)) {
    return '<rect x="3" y="17.3" width="24" height=".8" fill="#fff"/><ellipse cx="7" cy="17.4" rx="2" ry=".5" fill="#fff"/><ellipse cx="21" cy="17.4" rx="2.6" ry=".55" fill="#fff"/>'
  }

  if (season === 'spring') {
    return (
      '<g transform="translate(6.8 18) scale(1.5) translate(-6.8 -18)"><path d="M5,16 L8.6,16 L8.2,18 L5.4,18Z" fill="#c8663a"/>' +
      '<rect x="5.9" y="13.6" width=".25" height="2.4" fill="#5a9e4b"/><rect x="6.8" y="13" width=".25" height="3" fill="#5a9e4b"/><rect x="7.7" y="13.8" width=".25" height="2.2" fill="#5a9e4b"/>' +
      '<circle cx="6" cy="13.4" r=".8" fill="#f4a3c4"/><circle cx="6.9" cy="12.8" r=".8" fill="#f2c14e"/><circle cx="7.8" cy="13.6" r=".8" fill="#c39bd3"/></g>'
    )
  }

  return ''
}

// The floor corner under the window, on that piece's own grid, drawn larger
// from its base on the floor so it reads beside the furniture.
export function seasonCorner(season: Season, isNight: boolean): string {
  const art = corner(season, isNight)
  const grow = season === 'christmas' ? 1.15 : 1.6

  return art === '' ? '' : `<g transform="translate(2 28.4) scale(${grow}) translate(-2 -28.4)">${art}</g>`
}

function corner(season: Season, isNight: boolean): string {
  const fallen = LEAFY.has(season)
    ? [
        [12.5, 27.8, 20, 0],
        [15.6, 27.2, -40, 1],
        [1.8, 28.2, 70, 2],
      ]
        .map(([x, y, r, c]) => `<path d="${LEAF}" transform="translate(${x} ${y}) rotate(${r}) scale(1.3)" fill="${LEAF_COLORS[c ?? 0]}"/>`)
        .join('')
    : ''

  switch (season) {
    case 'halloween': {
      const face = isNight ? '#ffd166' : '#5b3410'
      const glow = isNight ? '<circle cx="7" cy="25.6" r="7" fill="url(#lampglow)" opacity=".8"/>' : ''

      return (
        glow +
        '<ellipse cx="7" cy="26" rx="3.8" ry="2.7" fill="#e8812a"/><ellipse cx="7" cy="26" rx="1.6" ry="2.7" fill="none" stroke="#c8661a" stroke-width=".3"/>' +
        '<ellipse cx="7" cy="26" rx="3" ry="2.7" fill="none" stroke="#c8661a" stroke-width=".25"/><rect x="6.6" y="22.6" width=".8" height="1.2" fill="#5a7d2a"/>' +
        `<path d="M5,25.4 L6,24.6 L6.4,25.6Z M9,25.4 L8,24.6 L7.6,25.6Z M4.8,26.6 L5.6,27.6 L6.3,26.9 L7,27.7 L7.7,26.9 L8.4,27.6 L9.2,26.6 L7,27Z" fill="${face}"/>` +
        fallen
      )
    }
    case 'christmas': {
      const lights = [
        [6, 17.4, '#e5534b'],
        [8, 19.6, '#f2c14e'],
        [5.2, 21.2, '#7fb3d5'],
        [9.2, 23.2, '#e5534b'],
        [4.6, 24.4, '#7ee787'],
        [7.4, 22.6, '#c39bd3'],
      ]
        .map(([x, y, c], i) => `<circle class="bulb" cx="${x}" cy="${y}" r=".45" fill="${c}" style="animation-delay:${i * 0.3}s"/>`)
        .join('')

      return (
        '<rect x="6.2" y="25.6" width="1.6" height="2.4" fill="#7a5232"/>' +
        '<path d="M7,14 L4.4,18.6 L9.6,18.6Z" fill="#2e7d4f"/><path d="M7,16.4 L3.6,21.8 L10.4,21.8Z" fill="#2a7046"/><path d="M7,19.4 L2.8,25.8 L11.2,25.8Z" fill="#256640"/>' +
        lights +
        '<path d="M7,12.4 l.45,.95 1,.15 -.75,.7 .2,1 -.9,-.5 -.9,.5 .2,-1 -.75,-.7 1,-.15Z" fill="#f2c14e"/>' +
        '<rect x="10" y="25.2" width="3.6" height="2.8" fill="#c0392b"/><rect x="11.5" y="25.2" width=".6" height="2.8" fill="#f2c14e"/><rect x="10" y="26.3" width="3.6" height=".5" fill="#f2c14e"/>'
      )
    }
    case 'summer':
      return (
        '<g class="rock"><circle cx="7" cy="25.8" r="2.4" fill="#fff" stroke="#ccc" stroke-width=".2"/>' +
        '<path d="M7,23.4 A2.4,2.4 0 0 1 9.4,25.8 L7,25.8Z" fill="#e5534b"/><path d="M7,28.2 A2.4,2.4 0 0 1 4.6,25.8 L7,25.8Z" fill="#7fb3d5"/>' +
        '<path d="M4.6,25.8 A2.4,2.4 0 0 1 7,23.4 L7,25.8Z" fill="#f2c14e"/></g>'
      )
    default:
      return fallen
  }
}

const HEART = 'M0,1.2 C-1.6,0 -1,-1.2 0,-.45 C1,-1.2 1.6,0 0,1.2Z'

// Across the wall: bats in October, a garland of hearts in February. Drawn
// in front of what hangs on the wall and behind the people in the room.
export function seasonWall(season: Season, width: number): string {
  if (season === 'halloween') {
    const bat =
      '<g class="flap"><path d="M0,0 L-3,-1 L-4.2,.6 L-2.6,.2 L-1.8,1.1 L0,.5 L1.8,1.1 L2.6,.2 L4.2,.6 L3,-1Z" fill="#2b2233"/></g><ellipse cx="0" cy=".2" rx=".9" ry="1" fill="#2b2233"/>'
    // Two bats, each gliding across about once a minute: the crossing takes
    // the first third of its cycle, and it is out of sight for the rest.
    // They fly below the status line and the fairy lights, in CSS pixel
    // translates across the room's width (the app's frame does not play
    // SMIL percentages).
    const start = -20
    const end = Math.round(width + 20)
    const flyers = [
      [26, 60, 8],
      [34, 75, 40],
    ]
      .map(
        ([y, dur, delay], i) =>
          `<style>@keyframes bat-${i}{0%{transform:translate(${start}px,${y}px)}35%,100%{transform:translate(${end}px,${y}px)}}` +
          `.bat-${i}{animation:bat-${i} ${dur}s linear -${delay}s infinite}</style>` +
          `<g class="bat-${i}"><g class="glide"><g transform="scale(2.4)">${bat}</g></g></g>`,
      )
      .join('')
    // And one asleep, hanging upside down from the ceiling, wings folded.
    const sleeper =
      '<svg x="72%" y="0" overflow="visible"><g transform="scale(3)"><rect x="-.1" y="0" width=".2" height=".8" fill="#2b2233"/>' +
      '<g class="hang"><path d="M-1.2,.8 L1.2,.8 L1,3.4 L0,4.2 L-1,3.4Z" fill="#2b2233"/><circle cx="-.4" cy="3.2" r=".18" fill="#e8812a"/><circle cx=".4" cy="3.2" r=".18" fill="#e8812a"/></g></g></svg>'

    return sleeper + flyers
  }

  if (season === 'valentine') {
    const count = 60
    const wire = Array.from({ length: count }, (_, i) => `${i * 9},${i % 2 === 0 ? 5 : 6}`).join(' ')
    const hearts = Array.from(
      { length: count },
      (_, i) => `<path d="${HEART}" transform="translate(${i * 9} ${(i % 2 === 0 ? 5 : 6) + 1.2})" fill="${i % 2 === 0 ? '#e5534b' : '#f4a3c4'}"/>`,
    ).join('')

    return `<svg x="26%" y="0" overflow="visible"><g transform="scale(3)"><polyline points="${wire}" fill="none" stroke="#c97a8a" stroke-width=".2"/>${hearts}</g></svg>`
  }

  return ''
}
