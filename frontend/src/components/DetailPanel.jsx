import { Building2, ExternalLink, Globe, Home, MapPin, Phone, Star, X } from 'lucide-react'
import { useState } from 'react'

const STAGE_OPTIONS = [
  { value: 'new',        label: 'New',       ring: 'border-gray-600' },
  { value: 'contacted',  label: 'Contacted', ring: 'border-gray-400' },
  { value: 'interested', label: 'Interested',ring: 'border-white' },
  { value: 'under_loi',  label: 'Under LOI', ring: 'border-yellow-400' },
  { value: 'closed',     label: 'Closed',    ring: 'border-green-400' },
  { value: 'dead',       label: 'Dead',      ring: 'border-gray-700' },
]

// HIGH score = red (prime lead), LOW score = green (well-run)
function scoreColor(score) {
  if (score >= 80) return '#ff2020'
  if (score >= 60) return '#ff7700'
  if (score >= 40) return '#ffdd00'
  if (score >= 20) return '#88dd22'
  return '#22cc44'
}

function scoreLabel(score) {
  if (score >= 80) return { text: 'PRIME LEAD', color: 'text-red-400' }
  if (score >= 60) return { text: 'GOOD LEAD', color: 'text-orange-400' }
  if (score >= 40) return { text: 'FAIR LEAD', color: 'text-yellow-400' }
  return { text: 'WELL RUN', color: 'text-green-400' }
}

function ScoreRing({ score }) {
  if (score === null || score === undefined) {
    return (
      <div className="flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 border-gray-700 text-gray-600 text-xs">
        N/A
      </div>
    )
  }
  const color = scoreColor(score)
  return (
    <div
      className="flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 font-bold"
      style={{ borderColor: color, color }}
    >
      <span className="text-xl leading-none">{score}</span>
      <span className="text-xs opacity-60">/ 100</span>
    </div>
  )
}

function BreakdownBar({ label, points, max }) {
  const pct = max > 0 ? Math.round((points / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-500 w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-surface-700 rounded-full h-1">
        <div className="h-1 rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-gray-400 w-6 text-right tabular-nums">+{points}</span>
    </div>
  )
}

export default function DetailPanel({ facility: f, onClose, onUpdate }) {
  const [notes, setNotes] = useState(f.notes || '')
  const [saving, setSaving] = useState(false)

  const bd = f.score_breakdown || {}
  const mapsUrl = `https://www.google.com/maps?q=${f.lat},${f.lng}`
  const label = f.opportunity_score != null ? scoreLabel(f.opportunity_score) : null

  const saveNotes = async () => {
    setSaving(true)
    await onUpdate(f.id, { notes })
    setSaving(false)
  }

  return (
    <div className="w-72 shrink-0 border-l border-surface-600 bg-surface-900 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-start gap-2 p-3 border-b border-surface-600">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {f.facility_type === 'self_storage'
              ? <Building2 size={11} className="text-gray-400 shrink-0" />
              : <Home size={11} className="text-gray-400 shrink-0" />
            }
            <span className="text-xs text-gray-500">
              {f.facility_type === 'self_storage' ? 'Self Storage' : 'Mobile Home Park'}
            </span>
          </div>
          <div className="text-sm font-bold text-white leading-tight">
            {f.name || <span className="text-gray-600 italic">Unnamed Facility</span>}
          </div>
          <div className="text-xs text-gray-600 mt-0.5">
            {[f.address, f.city, f.state].filter(Boolean).join(', ')}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-white shrink-0 mt-0.5">
          <X size={15} />
        </button>
      </div>

      {/* Score */}
      <div className="flex items-center gap-4 p-3 border-b border-surface-600">
        <ScoreRing score={f.opportunity_score} />
        <div className="text-xs">
          <div className="text-gray-500 mb-0.5">Opportunity Score</div>
          {label && <div className={`font-bold ${label.color}`}>{label.text}</div>}
          {f.scan_status === 'pending' && <div className="text-gray-600">Not yet scored</div>}
        </div>
      </div>

      {/* Score breakdown */}
      {Object.keys(bd).length > 0 && (
        <div className="p-3 border-b border-surface-600">
          <div className="text-xs text-gray-600 tracking-widest mb-2">BREAKDOWN</div>
          <div className="flex flex-col gap-2">
            {bd.website && (
              <BreakdownBar
                label={!bd.website.found ? 'No website' : !bd.website.alive ? 'Dead website' : 'Has website'}
                points={bd.website.points} max={45}
              />
            )}
            {bd.reviews && (
              <BreakdownBar label={`${bd.reviews.count} reviews`} points={bd.reviews.points} max={25} />
            )}
            {bd.phone && (
              <BreakdownBar label={bd.phone.found ? 'Phone listed' : 'No phone'} points={bd.phone.points} max={15} />
            )}
            {bd.photos && (
              <BreakdownBar label={bd.photos.count === 0 ? 'No photos' : `${bd.photos.count} photos`} points={bd.photos.points} max={10} />
            )}
          </div>
        </div>
      )}

      {/* Online presence */}
      <div className="p-3 border-b border-surface-600">
        <div className="text-xs text-gray-600 tracking-widest mb-2">ONLINE PRESENCE</div>
        <div className="flex flex-col gap-2 text-xs">
          <InfoRow icon={<Globe size={10} />} label="Website">
            {f.google_website ? (
              <a href={f.google_website} target="_blank" rel="noreferrer"
                className="text-white hover:underline flex items-center gap-1 min-w-0">
                <span className="truncate max-w-32">{f.google_website.replace(/^https?:\/\//, '')}</span>
                <ExternalLink size={8} className="shrink-0" />
              </a>
            ) : <span className="text-red-400">None</span>}
          </InfoRow>
          <InfoRow icon={<Phone size={10} />} label="Phone">
            {f.google_phone
              ? <span className="text-white">{f.google_phone}</span>
              : <span className="text-red-400">None</span>}
          </InfoRow>
          <InfoRow icon={<Star size={10} />} label="Reviews">
            {f.google_review_count != null
              ? <span className="text-white">{f.google_review_count}{f.google_rating != null && ` (${f.google_rating}★)`}</span>
              : <span className="text-red-400">None</span>}
          </InfoRow>
          <InfoRow icon={<MapPin size={10} />} label="Maps">
            <a href={mapsUrl} target="_blank" rel="noreferrer"
              className="text-white hover:underline flex items-center gap-1">
              View <ExternalLink size={8} />
            </a>
          </InfoRow>
        </div>
      </div>

      {/* Deal stage */}
      <div className="p-3 border-b border-surface-600">
        <div className="text-xs text-gray-600 tracking-widest mb-2">DEAL STAGE</div>
        <div className="grid grid-cols-3 gap-1">
          {STAGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onUpdate(f.id, { deal_stage: opt.value })}
              className={`px-1 py-1 text-xs rounded border transition-colors ${
                f.deal_stage === opt.value
                  ? `${opt.ring} bg-surface-700 text-white font-bold`
                  : 'border-surface-600 text-gray-600 hover:text-white hover:border-gray-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="p-3 flex-1 flex flex-col">
        <div className="text-xs text-gray-600 tracking-widest mb-2">NOTES</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Add notes..."
          className="flex-1 min-h-24 bg-surface-800 border border-surface-600 text-white text-xs p-2 rounded resize-none focus:outline-none focus:border-white placeholder-gray-700"
        />
        {saving && <span className="text-xs text-gray-600 mt-1">Saving...</span>}
      </div>
    </div>
  )
}

function InfoRow({ icon, label, children }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-600 shrink-0">{icon}</span>
      <span className="text-gray-600 w-14 shrink-0">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}
