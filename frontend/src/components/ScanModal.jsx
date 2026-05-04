import { AlertCircle, CheckCircle, Loader, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

const DONE_STATUSES = new Set(['complete', 'complete_no_key', 'error'])

export default function ScanModal({ onClose, hasApiKey }) {
  const [state, setState] = useState('TX')
  const [types, setTypes] = useState({ self_storage: true, mobile_home_park: true })
  const [scanId, setScanId] = useState(null)
  const [scanData, setScanData] = useState(null)
  const [importToken, setImportToken] = useState(() => localStorage.getItem('storageScoutImportToken') || '')
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  const toggleType = (key) => setTypes((p) => ({ ...p, [key]: !p[key] }))

  const start = async () => {
    const facility_types = Object.entries(types).filter(([, v]) => v).map(([k]) => k)
    if (!facility_types.length) return
    localStorage.setItem('storageScoutImportToken', importToken)
    setError('')
    try {
      const res = await api.importState(state, { facility_types })
      setScanId(res.scan_id)
    } catch (e) {
      if (e.response?.status === 401) {
        setError('Import token required or incorrect.')
      } else {
        setError(e.response?.data?.detail || 'Import failed.')
      }
    }
  }

  useEffect(() => {
    if (!scanId) return
    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      const data = await api.getScan(scanId)
      if (!cancelled) setScanData(data)
      if (!cancelled && !DONE_STATUSES.has(data.status)) {
        pollRef.current = setTimeout(poll, 1500)
      }
    }
    poll()
    return () => { cancelled = true; clearTimeout(pollRef.current) }
  }, [scanId])

  const isDone = scanData && DONE_STATUSES.has(scanData.status)
  const progress = scanData?.total > 0 ? Math.round((scanData.progress / scanData.total) * 100) : 0

  const statusLabel = {
    starting: 'Starting...',
    fetching: 'Searching Google Places...',
    fetching_osm: 'Searching Google Places...',
    scoring: 'Scoring online presence...',
    complete: 'Complete',
    complete_no_key: 'Imported (no API key)',
    error: 'Error',
  }[scanData?.status] ?? scanData?.status

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-surface-900 border border-surface-600 rounded-lg w-96 p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-white tracking-wide">Import State Data</span>
          <button onClick={onClose} className="text-gray-600 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {!scanId ? (
          <>
            {!hasApiKey && (
              <div className="mb-4 p-3 bg-surface-800 border border-surface-600 rounded text-xs text-yellow-500 leading-relaxed">
                No API key detected. Add <code className="bg-surface-700 px-1 rounded">GOOGLE_PLACES_API_KEY</code> to{' '}
                <code className="bg-surface-700 px-1 rounded">backend/.env</code> and restart to enable scoring.
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs text-gray-600 tracking-widest block mb-1.5">STATE</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full bg-surface-800 border border-surface-600 text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-white"
              >
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="mb-5">
              <label className="text-xs text-gray-600 tracking-widest block mb-2">FACILITY TYPES</label>
              <div className="flex flex-col gap-2">
                {[
                  { key: 'self_storage', label: 'Self Storage' },
                  { key: 'mobile_home_park', label: 'Mobile Home Parks' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                    <input type="checkbox" checked={types[key]} onChange={() => toggleType(key)}
                      className="w-3.5 h-3.5" />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="text-xs text-gray-600 tracking-widest block mb-1.5">IMPORT TOKEN</label>
              <input
                type="password"
                value={importToken}
                onChange={(e) => setImportToken(e.target.value)}
                placeholder="Optional unless configured"
                className="w-full bg-surface-800 border border-surface-600 text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-white placeholder-gray-700"
              />
            </div>

            {error && (
              <div className="mb-4 text-xs text-red-400 bg-surface-800 border border-surface-600 rounded p-2">
                {error}
              </div>
            )}

            <button
              onClick={start}
              disabled={!Object.values(types).some(Boolean)}
              className="w-full py-2.5 bg-white hover:bg-gray-200 text-black font-bold text-sm rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors tracking-wide"
            >
              START IMPORT
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm">
              {isDone
                ? scanData.status === 'error'
                  ? <AlertCircle size={16} className="text-red-400" />
                  : <CheckCircle size={16} className="text-white" />
                : <Loader size={16} className="text-white animate-spin" />
              }
              <span className={isDone ? 'text-gray-400' : 'text-white'}>{statusLabel}</span>
            </div>

            {scanData?.fetched != null && (
              <div className="text-xs text-gray-500">
                Found <span className="text-white">{scanData.fetched}</span> facilities
                {scanData.new_count != null && <span> ({scanData.new_count} new)</span>}
              </div>
            )}

            {scanData?.status === 'scoring' && scanData.total > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                  <span>Scoring</span>
                  <span className="tabular-nums">{scanData.progress} / {scanData.total}</span>
                </div>
                <div className="bg-surface-700 rounded-full h-1">
                  <div className="bg-white h-1 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {scanData?.message && (
              <div className="text-xs text-yellow-500 bg-surface-800 border border-surface-600 rounded p-2 leading-relaxed">
                {scanData.message}
              </div>
            )}
            {scanData?.error && (
              <div className="text-xs text-red-400 bg-surface-800 border border-surface-600 rounded p-2">
                {scanData.error}
              </div>
            )}

            {isDone && (
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-white hover:bg-gray-200 text-black font-bold text-sm rounded transition-colors tracking-wide"
              >
                VIEW RESULTS
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
