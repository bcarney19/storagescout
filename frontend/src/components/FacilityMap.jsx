import { useEffect, useRef } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'

// HIGH score = red (prime lead), LOW score = green (well-run, skip)
function scoreColor(score) {
  if (score === null || score === undefined) return '#444444'
  if (score >= 80) return '#ff2020'
  if (score >= 60) return '#ff7700'
  if (score >= 40) return '#ffdd00'
  if (score >= 20) return '#88dd22'
  return '#22cc44'
}

function FlyTo({ facility }) {
  const map = useMap()
  useEffect(() => {
    if (facility) map.flyTo([facility.lat, facility.lng], 14, { duration: 0.7 })
  }, [facility, map])
  return null
}

function FitToFacilities({ facilities, selected }) {
  const map = useMap()
  const lastSignature = useRef('')

  useEffect(() => {
    if (selected || facilities.length === 0) return
    const first = facilities[0]?.id || ''
    const last = facilities[facilities.length - 1]?.id || ''
    const signature = `${facilities.length}:${first}:${last}`
    if (signature === lastSignature.current) return
    lastSignature.current = signature

    const points = facilities
      .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng))
      .map((f) => [f.lat, f.lng])
    if (points.length === 1) {
      map.setView(points[0], 9)
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 8 })
    }
  }, [facilities, map, selected])

  return null
}

export default function FacilityMap({ facilities, selected, onSelect }) {
  return (
    <MapContainer center={[39.5, -98.35]} zoom={4} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
        maxZoom={20}
      />
      <FitToFacilities facilities={facilities} selected={selected} />
      {selected && <FlyTo facility={selected} />}
      {facilities.map((f) => {
        const isSelected = selected?.id === f.id
        const color = scoreColor(f.opportunity_score)
        return (
          <CircleMarker
            key={f.id}
            center={[f.lat, f.lng]}
            radius={isSelected ? 9 : 5}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: isSelected ? 1 : 0.8,
              weight: isSelected ? 2 : 1,
            }}
            eventHandlers={{ click: () => onSelect(f) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <div>
                <div style={{ fontWeight: 'bold' }}>{f.name || '(unnamed)'}</div>
                <div>{[f.city, f.state].filter(Boolean).join(', ')}</div>
                <div>{f.facility_type === 'self_storage' ? 'Self Storage' : 'Mobile Home Park'}</div>
                {f.opportunity_score != null && (
                  <div>Score: {f.opportunity_score}/100</div>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
