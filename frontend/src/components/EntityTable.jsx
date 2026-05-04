import { GitBranch, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'

function signalLabel(type) {
  return {
    shared_domain: 'DOMAIN',
    shared_phone: 'PHONE',
    same_state_name: 'NAME/ST',
  }[type] || 'LINK'
}

function scoreColor(score) {
  if (score == null) return 'text-gray-600'
  if (score >= 80) return 'text-red-400'
  if (score >= 60) return 'text-orange-400'
  if (score >= 40) return 'text-yellow-400'
  return 'text-green-400'
}

export default function EntityTable({ onSelectFacility }) {
  const [entities, setEntities] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      api.getEntities({ search: search || undefined, limit: 150 })
        .then((data) => { if (!cancelled) setEntities(data) })
        .catch(() => { if (!cancelled) setEntities([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  return (
    <div className="h-full flex flex-col bg-black">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-600 bg-surface-900 shrink-0">
        <div className="flex items-center gap-2 bg-surface-800 border border-surface-600 rounded px-2 py-1.5 w-80">
          <Search size={12} className="text-gray-600 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entities, domains, phones..."
            className="bg-transparent text-white text-xs focus:outline-none w-full placeholder-gray-700"
          />
        </div>
        <span className="ml-auto text-xs text-gray-600 tabular-nums">
          {loading ? 'loading' : `${entities.length.toLocaleString()} entities`}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-surface-900 z-10">
            <tr className="border-b border-surface-600">
              {['ENTITY', 'SIGNAL', 'FACILITIES', 'HIGH', 'MAX', 'AVG', 'LINKED FACILITIES'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-gray-600 tracking-widest font-normal whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => (
              <tr key={entity.id} className="border-b border-surface-700 hover:bg-surface-800">
                <td className="px-3 py-2 align-top">
                  <div className="flex items-center gap-2 min-w-0">
                    <GitBranch size={12} className="text-gray-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-white font-bold truncate max-w-72">{entity.name}</div>
                      <div className="text-gray-600 truncate max-w-72">{entity.normalized_key}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 align-top text-gray-400">{signalLabel(entity.signals?.type)}</td>
                <td className="px-3 py-2 align-top text-white tabular-nums">{entity.facility_count}</td>
                <td className="px-3 py-2 align-top text-red-400 tabular-nums">{entity.high_opportunity_count}</td>
                <td className={`px-3 py-2 align-top font-bold tabular-nums ${scoreColor(entity.max_score)}`}>
                  {entity.max_score ?? '-'}
                </td>
                <td className="px-3 py-2 align-top text-gray-400 tabular-nums">{entity.avg_score ?? '-'}</td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap gap-1 max-w-xl">
                    {(entity.linked_facilities || []).map((facility) => (
                      <button
                        key={facility.id}
                        onClick={() => onSelectFacility?.(facility)}
                        className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300 hover:text-white hover:bg-white/20 max-w-40 truncate"
                        title={[facility.name, facility.city, facility.state].filter(Boolean).join(' - ')}
                      >
                        {facility.name || 'Unnamed'}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && entities.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-600 text-xs">
            <span className="text-2xl">◎</span>
            <span>No entity links found</span>
          </div>
        )}
      </div>
    </div>
  )
}
