// Walking between spots. A spot is a percentage of the room's width plus an
// offset on the 3x grid, so its pixel position depends on how wide the band
// is. A walk records where it began, when, and how long it takes; where
// someone is mid-walk is worked out from that, so a new walk can start from
// there instead of jumping back to where the last one began.

import type { Spot } from '../types'

// Grid units to pixels.
const UNIT_PX = 3
// Walking pace, and the shortest and longest a walk may take.
const PACE_PX_PER_S = 160
const MIN_S = 0.6
const MAX_S = 2.6

export type Walk = { from: Spot | null; to: Spot; at: number; dur: number }

export function isSameSpot(a: Spot, b: Spot): boolean {
  return a.pct === b.pct && a.ux === b.ux && a.uy === b.uy
}

// How far apart two spots are, in pixels, on a room `width` pixels wide.
export function distancePx(a: Spot, b: Spot, width: number): number {
  const dx = ((b.pct - a.pct) / 100) * width + (b.ux - a.ux) * UNIT_PX
  const dy = (b.uy - a.uy) * UNIT_PX

  return Math.hypot(dx, dy)
}

// How long walking from `a` to `b` takes: by distance at a steady pace,
// within bounds; nothing to walk when they are the same spot.
export function walkSeconds(a: Spot, b: Spot, width: number): number {
  if (isSameSpot(a, b)) {
    return 0
  }

  const seconds = distancePx(a, b, width) / PACE_PX_PER_S

  return Math.round(Math.min(MAX_S, Math.max(MIN_S, seconds)) * 100) / 100
}

// Whether `b` is to the left of `a` on screen.
export function isLeftward(a: Spot, b: Spot, width: number): boolean {
  return ((b.pct - a.pct) / 100) * width + (b.ux - a.ux) * UNIT_PX < 0
}

// Where a walk has got to at `now`: its start, its end, or in between. The
// room animates linearly, so this matches what is on screen.
export function whereAt(walk: Walk, now: number): Spot {
  if (walk.from === null || walk.dur <= 0) {
    return walk.to
  }

  const t = Math.min(1, Math.max(0, (now - walk.at) / (walk.dur * 1000)))
  const mix = (a: number, b: number) => Math.round((a + (b - a) * t) * 100) / 100

  return { pct: mix(walk.from.pct, walk.to.pct), ux: mix(walk.from.ux, walk.to.ux), uy: mix(walk.from.uy, walk.to.uy) }
}

// Whether a walk is still under way at `now`.
export function isUnderway(walk: { from: Spot | null; at: number; dur: number }, now: number): boolean {
  return walk.from !== null && walk.dur > 0 && now - walk.at < walk.dur * 1000
}
