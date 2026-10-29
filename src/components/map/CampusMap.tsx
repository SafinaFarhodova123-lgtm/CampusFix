import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// Bundle MapLibre's web worker (and its shared chunk) as one file Vite can serve.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { Feature, FeatureCollection } from 'geojson'
import { CAMPUS_BOUNDS, CONTEXT_BUILDINGS, GROUNDS, pointInGeometry, schematicLabelPoint } from '../../data/campusGeo'
import { HEALTH_BAND_META, healthBand } from '../../lib/health'
import { PIN_COLOR, issuePosition, pinTone, worstTone } from '../../lib/mapMarkers'
import { categoryLabel } from '../../lib/constants'
import type { Building, BuildingHealth, Issue } from '../../lib/types'

export type MapMode = 'issues' | 'health'

export interface CampusMapProps {
  buildings: Building[]
  issues: Issue[] // already filtered + mappable
  health: Record<string, BuildingHealth>
  selectedBuildingId: string | null
  focusedIssueId: string | null
  mode: MapMode
  is3D: boolean
  pinMode: boolean
  pin: { lat: number; lng: number } | null
  /** extra padding so fitted views avoid overlay panels */
  padding: { top: number; right: number; bottom: number; left: number }
  onSelectBuilding: (id: string | null) => void
  onSelectIssue: (issue: Issue) => void
  onPin: (p: { lat: number; lng: number } | null, outside?: boolean) => void
  onFail: (reason: string) => void
  /** increment to fly back to the whole campus */
  resetSignal: number
}

maplibregl.setWorkerUrl(maplibreWorkerUrl)

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

const NEAR_ZOOM = 17.2
const DEFAULT_PITCH = 52
const DEFAULT_BEARING = -18

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#E9EDF1' } }],
}

const fc = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features })
const polyF = (rings: [number, number][], props: Record<string, unknown> = {}): Feature => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'Polygon', coordinates: [rings] },
})

function groundsData(): FeatureCollection {
  return fc([
    polyF(GROUNDS.campus, { kind: 'campus' }),
    polyF(GROUNDS.lawn, { kind: 'lawn' }),
    polyF(GROUNDS.pond, { kind: 'pond' }),
    polyF(GROUNDS.courts, { kind: 'courts' }),
    ...GROUNDS.parking.map((r) => polyF(r, { kind: 'parking' })),
  ])
}
const roadsData = () =>
  fc(GROUNDS.roads.map((r) => ({ type: 'Feature', properties: { name: r.name }, geometry: { type: 'LineString', coordinates: r.path } })))
const pathsData = () => fc(GROUNDS.paths.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: p } })))
const contextData = () =>
  fc(
    CONTEXT_BUILDINGS.map((b) => ({
      type: 'Feature',
      properties: { name: b.name, height: b.heightM },
      geometry: { type: 'MultiPolygon', coordinates: b.parts.map((r) => [r]) },
    })),
  )

function buildingsData(p: CampusMapProps): FeatureCollection {
  return fc(
    p.buildings
      .filter((b) => b.footprint)
      .map((b) => {
        const h = p.health[b.id]
        const selected = b.id === p.selectedBuildingId
        const color =
          p.mode === 'health'
            ? HEALTH_BAND_META[healthBand(h?.score ?? null)].color
            : selected
              ? '#1E5AA8'
              : '#CDD5E0'
        return {
          type: 'Feature',
          id: b.id,
          properties: { id: b.id, name: b.name, height: b.heightM, color, selected: selected ? 1 : 0 },
          geometry: b.footprint!,
        }
      }),
  )
}

function labelPoint(b: Building): [number, number] | null {
  return schematicLabelPoint(b.slug) && b.geoSource === 'schematic'
    ? schematicLabelPoint(b.slug)
    : b.longitude != null && b.latitude != null
      ? [b.longitude, b.latitude]
      : null
}

export function CampusMap(props: CampusMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const [ready, setReady] = useState(false)
  const labelMarkers = useRef<maplibregl.Marker[]>([])
  const issueMarkers = useRef<maplibregl.Marker[]>([])
  const pinMarker = useRef<maplibregl.Marker | null>(null)

  // ---------------------------------------------------------------- init once
  useEffect(() => {
    if (!container.current) return
    if (!webglAvailable()) {
      props.onFail('WebGL is not available in this browser.')
      return
    }
    let map: MLMap
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: BASE_STYLE,
        bounds: CAMPUS_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        pitch: DEFAULT_PITCH,
        bearing: DEFAULT_BEARING,
        maxPitch: 70,
        minZoom: 14.5,
        maxZoom: 20.5,
        attributionControl: false,
        dragRotate: true,
        touchPitch: true,
      })
    } catch (e) {
      props.onFail(e instanceof Error ? e.message : 'Map failed to start')
      return
    }
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'top-right')

    const setZoomClass = () => container.current?.setAttribute('data-zoom', map.getZoom() >= NEAR_ZOOM ? 'near' : 'far')
    map.on('zoom', setZoomClass)
    map.on('error', (e) => console.warn('map', e.error?.message))

    map.on('load', () => {
      const p = propsRef.current
      map.addSource('grounds', { type: 'geojson', data: groundsData() })
      map.addSource('roads', { type: 'geojson', data: roadsData() })
      map.addSource('paths', { type: 'geojson', data: pathsData() })
      map.addSource('context', { type: 'geojson', data: contextData() })
      map.addSource('buildings', { type: 'geojson', data: buildingsData(p) })

      map.addLayer({ id: 'campus', type: 'fill', source: 'grounds', filter: ['==', ['get', 'kind'], 'campus'], paint: { 'fill-color': '#D9E6D2' } })
      map.addLayer({ id: 'lawn', type: 'fill', source: 'grounds', filter: ['==', ['get', 'kind'], 'lawn'], paint: { 'fill-color': '#C8DEBB' } })
      map.addLayer({ id: 'parking', type: 'fill', source: 'grounds', filter: ['==', ['get', 'kind'], 'parking'], paint: { 'fill-color': '#C3C9D2' } })
      map.addLayer({ id: 'courts', type: 'fill', source: 'grounds', filter: ['==', ['get', 'kind'], 'courts'], paint: { 'fill-color': '#5B86B8' } })
      map.addLayer({ id: 'pond', type: 'fill', source: 'grounds', filter: ['==', ['get', 'kind'], 'pond'], paint: { 'fill-color': '#9EC3E6' } })
      map.addLayer({
        id: 'roads-casing',
        type: 'line',
        source: 'roads',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#B8C0CB', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 15, 6, 19, 44] },
      })
      map.addLayer({
        id: 'roads',
        type: 'line',
        source: 'roads',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 15, 4, 19, 38] },
      })
      map.addLayer({
        id: 'paths',
        type: 'line',
        source: 'paths',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#F8FAFC', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 15, 1.2, 19, 12] },
      })
      map.addLayer({
        id: 'context-3d',
        type: 'fill-extrusion',
        source: 'context',
        paint: { 'fill-extrusion-color': '#E3E7ED', 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0.9 },
      })
      map.addLayer({
        id: 'buildings-3d',
        type: 'fill-extrusion',
        source: 'buildings',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-opacity': 0.94,
          'fill-extrusion-vertical-gradient': true,
        },
      })
      map.addLayer({
        id: 'buildings-outline',
        type: 'line',
        source: 'buildings',
        filter: ['==', ['get', 'selected'], 1],
        paint: { 'line-color': '#041E42', 'line-width': 3 },
      })

      map.on('mouseenter', 'buildings-3d', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'buildings-3d', () => (map.getCanvas().style.cursor = propsRef.current.pinMode ? 'crosshair' : ''))
      map.on('click', (e) => {
        const p = propsRef.current
        const hit = map.queryRenderedFeatures(e.point, { layers: ['buildings-3d'] })[0]
        if (p.pinMode) {
          const b = p.buildings.find((x) => x.id === p.selectedBuildingId)
          if (b?.footprint && pointInGeometry(e.lngLat.lng, e.lngLat.lat, b.footprint)) {
            p.onPin({ lat: e.lngLat.lat, lng: e.lngLat.lng })
          } else if (hit && hit.properties?.id === b?.id) {
            p.onPin({ lat: e.lngLat.lat, lng: e.lngLat.lng })
          } else {
            p.onPin(null, true)
          }
          return
        }
        p.onSelectBuilding(hit ? String(hit.properties?.id) : null)
      })
      setZoomClass()
      setReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------- building colours / selection
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource('buildings') as GeoJSONSource | undefined)?.setData(buildingsData(props))
  }, [ready, props.buildings, props.health, props.mode, props.selectedBuildingId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- building labels (with issue-count bubble when zoomed out)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    labelMarkers.current.forEach((m) => m.remove())
    labelMarkers.current = props.buildings.flatMap((b) => {
      const at = labelPoint(b)
      if (!at) return []
      const own = props.issues.filter((i) => i.buildingId === b.id && i.repairStatus !== 'resolved')
      const tone = worstTone(own)
      const h = props.health[b.id]
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'cf-label' + (b.id === props.selectedBuildingId ? ' is-selected' : '')
      const dot = HEALTH_BAND_META[healthBand(h?.score ?? null)].color
      el.innerHTML = `<span class="cf-label-dot" style="background:${dot}"></span><span class="cf-label-name"></span>${
        own.length ? `<span class="cf-label-count" style="background:${PIN_COLOR[tone!]}" aria-hidden="true">${own.length}</span>` : ''
      }<span class="sr-only"></span>`
      el.querySelector('.cf-label-name')!.textContent = b.shortName
      el.querySelector('.sr-only')!.textContent = ` — ${b.name}${h?.score != null ? `, health ${h.score} of 100` : ', no health data yet'}, ${own.length} open ${own.length === 1 ? 'issue' : 'issues'}`
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        if (!propsRef.current.pinMode) propsRef.current.onSelectBuilding(b.id)
      })
      return [new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -6] }).setLngLat(at).addTo(map)]
    })
  }, [ready, props.buildings, props.issues, props.health, props.selectedBuildingId])

  // ---------------------------------------------------------------- issue pins
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    issueMarkers.current.forEach((m) => m.remove())
    const perBuilding: Record<string, number> = {}
    issueMarkers.current = props.issues.flatMap((issue) => {
      const b = props.buildings.find((x) => x.id === issue.buildingId)
      const idx = (perBuilding[issue.buildingId] = (perBuilding[issue.buildingId] ?? -1) + 1)
      const pos = issuePosition(issue, b, idx + 1)
      if (!pos) return []
      const tone = pinTone(issue)
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'cf-pin' + (issue.id === props.focusedIssueId ? ' is-focused' : '')
      el.style.setProperty('--pin', PIN_COLOR[tone])
      el.setAttribute('aria-label', `${issue.title} — ${categoryLabel(issue.category)}, ${b?.name ?? ''}`)
      el.innerHTML = `<span class="cf-pin-head">${tone === 'green' ? '✓' : tone === 'red' ? '!' : ''}</span>`
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        propsRef.current.onSelectIssue(issue)
      })
      return [new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(pos).addTo(map)]
    })
  }, [ready, props.issues, props.buildings, props.focusedIssueId])

  // ---------------------------------------------------------------- user pin
  useEffect(() => {
    container.current?.setAttribute('data-pinmode', props.pinMode ? 'on' : 'off')
    container.current?.setAttribute('data-panel', props.padding.right > 0 ? 'open' : 'closed')
  })

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.getCanvas().style.cursor = props.pinMode ? 'crosshair' : ''
    if (!props.pin) {
      pinMarker.current?.remove()
      pinMarker.current = null
      return
    }
    if (!pinMarker.current) {
      const el = document.createElement('div')
      el.className = 'cf-userpin'
      el.innerHTML = '<span></span>'
      pinMarker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
    }
    pinMarker.current.setLngLat([props.pin.lng, props.pin.lat]).addTo(map)
  }, [ready, props.pin, props.pinMode])

  // ---------------------------------------------------------------- camera
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const focus = props.issues.find((i) => i.id === props.focusedIssueId)
    const b = props.buildings.find((x) => x.id === (focus?.buildingId ?? props.selectedBuildingId))
    if (b?.footprint) {
      const coords = (b.footprint.type === 'Polygon' ? [b.footprint.coordinates] : b.footprint.coordinates).flat(2) as [number, number][]
      const bounds = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
      map.fitBounds(bounds, {
        padding: props.padding,
        maxZoom: 18.6,
        pitch: props.is3D ? DEFAULT_PITCH : 0,
        bearing: map.getBearing(),
        duration: 900,
      })
    }
  }, [ready, props.selectedBuildingId, props.focusedIssueId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !props.resetSignal) return
    map.fitBounds(CAMPUS_BOUNDS, { padding: 24, pitch: props.is3D ? DEFAULT_PITCH : 0, bearing: props.is3D ? DEFAULT_BEARING : 0, duration: 800 })
  }, [ready, props.resetSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pin placement happens in a flat top-down view so the tap maps exactly onto the footprint.
  const firstPitchRun = useRef(true)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    // Skip the initial run: the map already starts at the right pitch, and an easeTo here would
    // cancel the fitBounds that a deep link (?building= / ?issue=) triggers on load.
    if (firstPitchRun.current) {
      firstPitchRun.current = false
      return
    }
    const flat = !props.is3D || props.pinMode
    map.easeTo({ pitch: flat ? 0 : DEFAULT_PITCH, bearing: props.pinMode ? map.getBearing() : props.is3D ? map.getBearing() : 0, duration: 600 })
  }, [ready, props.is3D, props.pinMode])

  return (
    <div className="absolute inset-0">
      {/* maplibre sets position:relative on its container, so size it with h/w rather than inset */}
      <div ref={container} className="cf-map h-full w-full" data-zoom="far" role="region" aria-label="Interactive campus map" />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-canvas" aria-live="polite">
          <div className="flex flex-col items-center gap-3 text-sm text-muted">
            <div className="size-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600" />
            Loading campus map…
          </div>
        </div>
      )}
    </div>
  )
}

