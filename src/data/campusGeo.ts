/**
 * SIMPLIFIED CAMPUS LAYOUT for Penn State Abington.
 *
 * No public building footprints could be downloaded during development, so this scene is a
 * hand-traced schematic: shapes and relative positions follow the public campus map, but sizes,
 * angles and coordinates are APPROXIMATE and must not be read as surveyed geography.
 * The UI labels it as such. When a building row has real `footprint_geojson` (e.g. imported from
 * OpenStreetMap with scripts/import-osm.ts), the map uses that instead.
 *
 * Shapes are authored in pixel space of a 1264×976 reference image (0.5 m per px) and projected
 * around the campus centre.
 */

import type { MultiPolygon, Polygon } from 'geojson'

type Pt = [number, number]
export type Ring = [number, number][]

const ORIGIN = { lat: 40.1146, lng: -75.1113 }
const M_PER_PX = 0.5
const CX = 632
const CY = 488
const M_PER_DEG_LAT = 111_320
const M_PER_DEG_LNG = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180)

export function px(x: number, y: number): [number, number] {
  const east = (x - CX) * M_PER_PX
  const north = -(y - CY) * M_PER_PX
  return [round(ORIGIN.lng + east / M_PER_DEG_LNG), round(ORIGIN.lat + north / M_PER_DEG_LAT)]
}
const round = (n: number) => Math.round(n * 1e7) / 1e7

/** Rectangle centred at (x,y) of w×h px rotated `deg` degrees clockwise on screen. */
function rect(x: number, y: number, w: number, h: number, deg = 0): Ring {
  const a = (deg * Math.PI) / 180
  const corners: Pt[] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ]
  const ring = corners.map(([dx, dy]) => px(x + dx * Math.cos(a) - dy * Math.sin(a), y + dx * Math.sin(a) + dy * Math.cos(a)))
  return [...ring, ring[0]]
}

function ellipse(x: number, y: number, rx: number, ry: number, n = 28): Ring {
  const ring = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    return px(x + rx * Math.cos(t), y + ry * Math.sin(t))
  })
  return [...ring, ring[0]]
}

const poly = (points: Pt[]): Ring => {
  const ring = points.map(([x, y]) => px(x, y))
  return [...ring, ring[0]]
}
const line = (points: Pt[]) => points.map(([x, y]) => px(x, y))

export interface SchematicBuilding {
  /** One or more rings (MultiPolygon parts) */
  parts: Ring[]
  heightM: number
  /** label anchor in px space */
  label: Pt
}

export const SCHEMATIC_BUILDINGS: Record<string, SchematicBuilding> = {
  woodland: {
    parts: [rect(592, 142, 72, 46, -30), rect(548, 214, 60, 98, -30), rect(503, 300, 56, 100, -30), rect(466, 372, 46, 62, -30)],
    heightM: 16,
    label: [530, 250],
  },
  springhouse: { parts: [rect(748, 108, 30, 22, -20)], heightM: 7, label: [748, 108] },
  lares: { parts: [rect(866, 220, 86, 54, -35), rect(902, 250, 34, 30, -35)], heightM: 12, label: [870, 225] },
  sutherland: { parts: [rect(985, 470, 110, 74, -40), rect(1028, 416, 52, 40, -40)], heightM: 15, label: [990, 460] },
  rydal: { parts: [rect(276, 494, 42, 30, -8)], heightM: 9, label: [276, 494] },
  academic: { parts: [rect(156, 700, 120, 84, -10), rect(108, 650, 40, 44, -10)], heightM: 14, label: [150, 695] },
  cloverly: { parts: [rect(206, 816, 56, 34, -5)], heightM: 8, label: [206, 816] },
  athletic: { parts: [rect(386, 832, 100, 138, -18)], heightM: 12, label: [386, 832] },
}

/** Context buildings that exist on the map but are not part of the sample data. */
export const CONTEXT_BUILDINGS: { name: string; parts: Ring[]; heightM: number }[] = [
  { name: 'Sutherland Auditorium', parts: [rect(932, 566, 64, 54, -35)], heightM: 10 },
  { name: 'Parking Lot Kiosk', parts: [rect(990, 302, 12, 12, -30)], heightM: 4 },
]

export const GROUNDS = {
  campus: poly([
    [330, 140], [560, 42], [770, 30], [1000, 165], [1264, 268], [1264, 420], [1050, 820], [905, 976], [0, 976], [0, 560],
  ]),
  lawn: ellipse(560, 560, 175, 92),
  pond: ellipse(700, 160, 38, 27),
  courts: rect(490, 682, 140, 70, -15),
  parking: [rect(392, 292, 62, 260, 33), rect(690, 760, 170, 118, -35), rect(120, 880, 130, 80, 0), rect(1120, 470, 70, 120, -35)],
  roads: [
    { name: 'Woodland Rd', path: line([[300, 110], [560, 22], [790, 18], [1010, 140], [1264, 250]]) },
    { name: 'Cloverly Ln', path: line([[320, 150], [190, 330], [0, 540]]) },
    { name: 'School Ln', path: line([[1264, 410], [1100, 700], [880, 976]]) },
  ],
  paths: [
    line([[440, 420], [560, 468], [700, 462], [860, 520], [930, 540]]),
    line([[690, 190], [760, 300], [830, 380], [945, 420]]),
    line([[300, 500], [420, 468], [440, 420]]),
    line([[560, 560], [620, 700], [700, 760]]),
    line([[600, 160], [690, 190], [800, 240]]),
    line([[386, 750], [430, 640], [440, 560], [395, 505]]),
  ],
}

function centroid(parts: Ring[]): { lat: number; lng: number } {
  // area-weighted centroid of the largest part is good enough for marker placement
  const ring = parts.reduce((a, b) => (area(b) > area(a) ? b : a))
  const pts = ring.slice(0, -1)
  return {
    lng: round(pts.reduce((s, p) => s + p[0], 0) / pts.length),
    lat: round(pts.reduce((s, p) => s + p[1], 0) / pts.length),
  }
}
function area(r: Ring) {
  let s = 0
  for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
  return Math.abs(s / 2)
}

export const schematicCentroid = (slug: string) => {
  const b = SCHEMATIC_BUILDINGS[slug]
  return b ? centroid(b.parts) : null
}
export const schematicLabelPoint = (slug: string) => {
  const b = SCHEMATIC_BUILDINGS[slug]
  return b ? px(b.label[0], b.label[1]) : null
}

export const schematicFootprint = (slug: string): MultiPolygon | null => {
  const b = SCHEMATIC_BUILDINGS[slug]
  return b ? { type: 'MultiPolygon', coordinates: b.parts.map((r) => [r]) } : null
}

export const CAMPUS_BOUNDS: [[number, number], [number, number]] = [px(0, 976), px(1264, 0)]

/** Ray-casting point-in-polygon for MultiPolygon/Polygon geometry. */
export function pointInGeometry(lng: number, lat: number, geom: Polygon | MultiPolygon): boolean {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  return polys.some((rings) => {
    const outer = rings[0]
    let inside = false
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const [xi, yi] = outer[i]
      const [xj, yj] = outer[j]
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  })
}
