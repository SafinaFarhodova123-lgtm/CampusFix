import { tokenize } from './similarity'
import type { IssueCategory } from './types'

/**
 * Deterministic "smart" helpers for the report form — no external AI calls.
 *  - suggestCategory: keyword evidence → best category (or null when unsure)
 *  - routeReport: flags emergencies and non-facilities requests
 */

// canonical tokens come from similarity.tokenize (synonyms already folded)
const EVIDENCE: Record<IssueCategory, Record<string, number>> = {
  plumbing: { leak: 3, faucet: 3, clog: 2, fountain: 2, toilet: 2, pipe: 3, drain: 3, flush: 3, shower: 2, urinal: 3 },
  electrical: { light: 3, flicker: 3, outlet: 3, wire: 2, wiring: 2, switch: 2, breaker: 3, electrical: 3, projector: 2, power: 2 },
  furniture: { chair: 3, desk: 3, couch: 3, sofa: 3, bench: 2, shelf: 2, cabinet: 2, drawer: 2, furniture: 3, locker: 2, wobbly: 2 },
  heating_cooling: { heat: 3, cool: 3, vent: 2, thermostat: 3, temperature: 2, hvac: 3, humid: 2, draft: 2 },
  cleaning: { trash: 3, spill: 3, dirty: 3, smell: 2, odor: 2, mess: 2, clean: 3, vomit: 3, stain: 1, sticky: 2, mold: 2 },
  building_damage: { ceiling: 3, door: 2, window: 2, damage: 2, wall: 2, roof: 3, carpet: 2, paint: 2, crack: 2, hole: 2, stair: 1, elevator: 2 },
  safety: { hazard: 3, exposed: 3, trip: 3, slippery: 3, sharp: 3, unsafe: 3, lock: 2, emergency: 2, glass: 1, railing: 3, fall: 2 },
  other: {},
}

export interface CategorySuggestion {
  category: IssueCategory
  confidence: 'high' | 'medium'
}

export function suggestCategory(text: string): CategorySuggestion | null {
  const tokens = tokenize(text)
  // also look at raw words for terms the synonym table doesn't fold
  for (const w of text.toLowerCase().split(/[^a-z]+/)) if (w) tokens.add(w)
  const scores = (Object.keys(EVIDENCE) as IssueCategory[]).map((c) => {
    let s = 0
    for (const [k, v] of Object.entries(EVIDENCE[c])) if (tokens.has(k)) s += v
    return { c, s }
  })
  // exposed wiring is a safety issue, not just electrical
  if (tokens.has('exposed') && (tokens.has('wire') || tokens.has('wiring') || tokens.has('outlet'))) {
    scores.find((x) => x.c === 'safety')!.s += 3
  }
  scores.sort((a, b) => b.s - a.s)
  const [best, next] = scores
  if (best.s < 3) return null
  return { category: best.c, confidence: best.s - next.s >= 3 ? 'high' : 'medium' }
}

export type RouteKind = 'emergency' | 'it' | 'not_facilities'
export interface RouteAdvice {
  kind: RouteKind
  title: string
  body: string
}

const RULES: { kind: RouteKind; re: RegExp; title: string; body: string }[] = [
  {
    kind: 'emergency',
    re: /\b(fire|flames?|smoke|smell(s|ing)? (of )?gas|gas leak|carbon monoxide|injur(y|ed|ies)|bleeding|unconscious|electrocut|flood(ing|ed)?|someone (is )?(hurt|trapped))\b/i,
    title: 'Is anyone in danger right now?',
    body: 'Call 911 or University Police first. CampusFix is not monitored around the clock and is not for emergencies.',
  },
  {
    kind: 'it',
    re: /\b(wi-?fi|internet|network|password|log ?in|canvas|email|laptop|software|printer|printing|vpn|zoom)\b/i,
    title: 'This looks like an IT request',
    body: 'Wi-Fi, accounts, software and printing are handled by the IT Service Desk, not facilities. You can still submit if it’s a physical problem.',
  },
  {
    kind: 'not_facilities',
    re: /\b(parking (ticket|citation|permit)|grade|grades|roommate|lost (my|a)|found (a|an)|tuition|financial aid|schedule|class registration)\b/i,
    title: 'This may not be a facilities issue',
    body: 'CampusFix is for physical problems with buildings and grounds. For other campus services, please contact the relevant office.',
  },
]

export function routeReport(text: string): RouteAdvice | null {
  for (const r of RULES) if (r.re.test(text)) return { kind: r.kind, title: r.title, body: r.body }
  return null
}
