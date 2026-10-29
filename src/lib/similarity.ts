import type { Issue, IssueCategory } from './types'

/**
 * Deterministic duplicate detection.
 *
 * Score (0–1) combines location, category and text overlap. Text is normalised with a
 * small maintenance-specific synonym table so that "bathroom sink keeps dripping" and
 * "leaking faucet in restroom" share the concepts {restroom, faucet, leak}.
 */

const STOPWORDS = new Set(
  'a an the and or but of in on at to for from by with near next by is are was were be been being it its this that these those there here very really keeps keep kept still again some any my our your their his her has have had not no just also into onto over under up down out off than then so too can cant cannot wont doesnt dont isnt building bldg room floor area issue problem please help'.split(
    ' ',
  ),
)

// canonical concept ← variants
const SYNONYMS: Record<string, string[]> = {
  restroom: ['bathroom', 'washroom', 'toilet', 'toilets', 'lavatory', 'restrooms', 'bathrooms', 'mens', 'womens', 'wc'],
  faucet: ['sink', 'tap', 'faucets', 'sinks', 'taps', 'spigot'],
  leak: ['leaking', 'leaks', 'leaky', 'leaked', 'drip', 'dripping', 'drips', 'dripped', 'water'],
  clog: ['clogged', 'blocked', 'backed', 'drain', 'overflowing', 'overflow'],
  light: ['lights', 'lamp', 'lamps', 'bulb', 'bulbs', 'lighting', 'fixture', 'fluorescent'],
  flicker: ['flickering', 'flickers', 'blinking', 'flashing', 'strobing'],
  outage: ['out', 'dead', 'broken', 'busted', 'notworking', 'off'],
  heat: ['heating', 'heater', 'radiator', 'furnace', 'hvac', 'thermostat', 'cold', 'freezing', 'chilly'],
  cool: ['ac', 'aircon', 'airconditioning', 'conditioner', 'hot', 'stuffy', 'warm'],
  chair: ['chairs', 'seat', 'seats', 'stool', 'stools'],
  desk: ['desks', 'table', 'tables'],
  ceiling: ['ceilings', 'tile', 'tiles', 'panel'],
  door: ['doors', 'doorway', 'hinge', 'handle', 'lock', 'latch', 'closer'],
  window: ['windows', 'pane', 'glass', 'blinds'],
  outlet: ['outlets', 'socket', 'sockets', 'plug', 'receptacle', 'power'],
  trash: ['garbage', 'rubbish', 'bin', 'bins', 'litter', 'waste', 'can'],
  spill: ['spilled', 'sticky', 'mess', 'stain', 'stains', 'stained'],
  damage: ['damaged', 'cracked', 'crack', 'hole', 'dent', 'torn', 'ripped', 'collapsed', 'sagging', 'falling'],
  fountain: ['bottle', 'filler', 'drinking'],
  floor1: ['first', '1st', 'one'],
  floor2: ['second', '2nd', 'two'],
  floor3: ['third', '3rd', 'three'],
  floor0: ['ground', 'basement', 'lower'],
}

const LOOKUP: Record<string, string> = {}
for (const [canonical, variants] of Object.entries(SYNONYMS)) {
  LOOKUP[canonical] = canonical
  for (const v of variants) LOOKUP[v] = canonical
}

function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3)
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

export function tokenize(text: string): Set<string> {
  const out = new Set<string>()
  const words = text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/not working|doesn'?t work|isn'?t working|won'?t work/g, ' notworking ')
    .replace(/air condition(ing|er)?/g, ' aircon ')
    .split(/[^a-z0-9]+/)
  for (const w of words) {
    if (!w || STOPWORDS.has(w)) continue
    const mapped = LOOKUP[w] ?? LOOKUP[stem(w)] ?? stem(w)
    if (mapped.length < 2 || STOPWORDS.has(mapped)) continue
    out.add(mapped)
  }
  return out
}

/** Overlap coefficient (|A∩B| / min(|A|,|B|)) blended with Jaccard to reward shared concepts. */
export function textSimilarity(a: string, b: string): number {
  const A = tokenize(a)
  const B = tokenize(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  const overlap = inter / Math.min(A.size, B.size)
  const jaccard = inter / (A.size + B.size - inter)
  return 0.65 * overlap + 0.35 * jaccard
}

const normRoom = (r: string | null | undefined) =>
  (r ?? '')
    .toLowerCase()
    .replace(/room|rm\.?|#/g, '')
    .trim()

export interface DuplicateCandidateInput {
  buildingId: string
  floor?: string | null
  room?: string | null
  category: IssueCategory
  title: string
  description: string
}

export interface DuplicateMatch {
  issue: Issue
  score: number
  reasons: string[]
}

export const DUPLICATE_THRESHOLD = 0.5

export function scoreDuplicate(input: DuplicateCandidateInput, issue: Issue): DuplicateMatch {
  const reasons: string[] = []
  let score = 0

  const sameBuilding = input.buildingId === issue.buildingId
  if (sameBuilding) {
    score += 0.25
    reasons.push('Same building')
  }

  if (input.floor && issue.floor && input.floor === issue.floor) {
    score += 0.1
    reasons.push('Same floor')
  }

  const r1 = normRoom(input.room)
  const r2 = normRoom(issue.room)
  if (r1 && r2) {
    const t = textSimilarity(r1, r2)
    if (r1 === r2 || t >= 0.6) {
      score += 0.15
      reasons.push('Same room or area')
    }
  }

  if (input.category === issue.category) {
    score += 0.15
    reasons.push('Same category')
  }

  const text = textSimilarity(
    `${input.title} ${input.title} ${input.description}`,
    `${issue.title} ${issue.title} ${issue.description} ${issue.room ?? ''}`,
  )
  score += 0.4 * text
  if (text >= 0.35) reasons.push('Similar description')

  // Different buildings are almost never the same physical problem.
  if (!sameBuilding) score *= 0.4

  return { issue, score: Math.min(1, score), reasons }
}

/** Open, non-rejected, non-merged issues ranked by similarity. */
export function findDuplicates(input: DuplicateCandidateInput, issues: Issue[], limit = 3): DuplicateMatch[] {
  return issues
    .filter(
      (i) =>
        i.repairStatus !== 'resolved' && i.verificationStatus !== 'rejected' && i.verificationStatus !== 'merged',
    )
    .map((i) => scoreDuplicate(input, i))
    .filter((m) => m.score >= DUPLICATE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
