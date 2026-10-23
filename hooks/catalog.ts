import type { OutfitId } from '../types'

// What Clawd unlocks as he levels up: furniture for his room and outfits
// for his wardrobe. A level is 10 finished turns.

export type ItemId = 'rug' | 'plant' | 'lamp' | 'poster' | 'wardrobe' | 'lights' | 'fishbowl'

export const ITEMS: { id: ItemId; name: string; level: number }[] = [
  { id: 'rug', name: 'Rug', level: 2 },
  { id: 'plant', name: 'Potted plant', level: 3 },
  { id: 'lamp', name: 'Floor lamp (glows at night)', level: 4 },
  { id: 'poster', name: 'Poster', level: 5 },
  { id: 'wardrobe', name: 'Wardrobe', level: 6 },
  { id: 'lights', name: 'Fairy lights', level: 7 },
  { id: 'fishbowl', name: 'Goldfish', level: 8 },
]

export const OUTFITS: { id: OutfitId; name: string; level: number }[] = [
  { id: 'beanie', name: 'Beanie', level: 3 },
  { id: 'bowtie', name: 'Bow tie', level: 5 },
  { id: 'shades', name: 'Sunglasses', level: 7 },
  { id: 'wizard', name: 'Wizard hat', level: 9 },
  { id: 'crown', name: 'Crown', level: 10 },
]

export function unlockedItems(level: number): Set<ItemId> {
  return new Set(ITEMS.filter(item => item.level <= level).map(item => item.id))
}

export function isOutfitUnlocked(id: OutfitId, level: number) {
  return OUTFITS.some(outfit => outfit.id === id && outfit.level <= level)
}
