import { Download, GitBranch, Map, RefreshCw, Search, Table2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import DetailPanel from './components/DetailPanel'
import EntityTable from './components/EntityTable'
import FacilityMap from './components/FacilityMap'
import FacilityTable from './components/FacilityTable'
import FilterPanel from './components/FilterPanel'
import ScanModal from './components/ScanModal'
import StatsBar from './components/StatsBar'

const SAVED_VIEWS = [
  {
    label: 'PE Targets',
    filters: { min_target_score: 65, independent_only: true, min_score: 0, max_score: 100 },
  },
  {
    label: 'Prime MHP',
    filters: { facility_type: 'mobile_home_park', min_target_score: 65, independent_only: true, min_score: 0, max_score: 100 },
  },
  {
    label: 'Prime Storage',
    filters: { facility_type: 'self_storage', min_target_score: 65, independent_only: true, min_score: 0, max_score: 100 },
  },
  {
    label: 'No Website',
    filters: { no_website: true, independent_only: true, min_score: 0, max_score: 100 },
  },
  {
    label: 'No Phone',
    filters: { no_phone: true, independent_only: true, min_score: 0, max_score: 100 },
  },
  {
    label: 'Zero Reviews',
    filters: { zero_reviews: true, independent_only: true, min_score: 0, max_score: 100 },
  },
  {
    label: 'Dead Sites',
    filters: { dead_website: true, independent_only: true, min_score: 0, max_score: 100 },
  },
]

const DEFAULT_FILTERS = {
  state: '',
  facility_type: '',
  min_score: 0,
  max_score: 100,
  deal_stage: '',
  search: '',
  independent_only: true,
  no_website: false,
  no_phone: false,
  zero_reviews: false,
  dead_website: false,
  min_target_score: 65,
}

export default function App() {
  const [facilities, setFacilities] = useState([])
  const [stats, setStats] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('map')
  const [showScanModal, setShowScanModal] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filters.state) params.state = filters.state
      if (filters.facility_type) params.facility_type = filters.facility_type
      if (filters.min_score > 0) params.min_score = filters.min_score
      if (filters.max_score < 100) params.max_score = filters.max_score
      if (filters.deal_stage) params.deal_stage = filters.deal_stage
      if (filters.search) params.search = filters.search
      if (filters.independent_only) params.independent_only = true
      if (filters.no_website) params.no_website = true
      if (filters.no_phone) params.no_phone = true
      if (filters.zero_reviews) params.zero_reviews = true
      if (filters.dead_website) params.dead_website = true
      if (filters.min_target_score > 0) params.min_target_score = filters.min_target_score
      params.limit = 5000

      const [facs, statsData] = await Promise.all([
        api.getFacilities(params),
        api.getStats(),
      ])
      setFacilities(facs)
      setStats(statsData)
    } catch (e) {
      console.error('Fetch failed', e)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 8000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleUpdate = async (id, updates) => {
    await api.updateFacility(id, updates)
    setFacilities((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
    setSelected((prev) => (prev?.id === id ? { ...prev, ...updates } : prev))
  }

  const typeCounts = facilities.reduce(
    (acc, facility) => {
      if (facility.facility_type === 'mobile_home_park') acc.mobile += 1
      if (facility.facility_type === 'self_storage') acc.storage += 1
      return acc
    },
    { mobile: 0, storage: 0 }
  )

  const exportCsv = () => {
    const headers = [
      'score', 'name', 'type', 'address', 'city', 'state', 'zip',
      'target_score', 'tier', 'is_chain', 'weaknesses', 'thesis',
      'reviews', 'rating', 'website', 'phone', 'stage', 'notes',
    ]
    const rows = facilities.map((f) => [
      f.opportunity_score ?? '',
      f.name ?? '',
      f.facility_type ?? '',
      f.address ?? '',
      f.city ?? '',
      f.state ?? '',
      f.zip_code ?? '',
      f.target_score ?? '',
      f.lead_tier ?? '',
      f.is_chain ? 'yes' : 'no',
      (f.weakness_flags || []).join('; '),
      f.lead_thesis ?? '',
      f.google_review_count ?? '',
      f.google_rating ?? '',
      f.google_website ?? '',
      f.google_phone ?? '',
      f.deal_stage ?? '',
      f.notes ?? '',
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `storage-scout-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const applySavedView = (viewFilters) => {
    setFilters({ ...DEFAULT_FILTERS, ...viewFilters, search: filters.search })
    setView('map')
    setSelected(null)
  }

  const toggleIndependentScope = () => {
    setFilters((prev) => {
      const nextIndependent = !prev.independent_only
      return {
        ...prev,
        independent_only: nextIndependent,
        min_target_score: nextIndependent ? Math.max(prev.min_target_score, 65) : 0,
      }
    })
  }

  return (
    <div className="flex flex-col h-full bg-black text-white font-mono overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-surface-600 bg-surface-900 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-white font-bold tracking-widest text-sm">STORAGE SCOUT</span>
          <span className="text-surface-600 text-xs hidden sm:block">| Deal Intelligence</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            title="Refresh"
            className="p-1.5 rounded hover:bg-surface-700 text-gray-600 hover:text-white transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowScanModal(true)}
            className="px-3 py-1.5 text-xs bg-white hover:bg-gray-200 text-black font-bold rounded transition-colors tracking-wider"
          >
            + IMPORT STATE
          </button>
        </div>
      </header>

      <StatsBar stats={stats} />

      <div className="flex items-center gap-1 px-3 py-2 border-b border-surface-600 bg-black shrink-0 overflow-x-auto">
        {SAVED_VIEWS.map((saved) => (
          <button
            key={saved.label}
            onClick={() => applySavedView(saved.filters)}
            className="px-2.5 py-1 text-xs rounded bg-surface-800 border border-surface-600 text-gray-300 hover:text-white hover:border-gray-500 whitespace-nowrap"
          >
            {saved.label}
          </button>
        ))}
        <button
          onClick={() => setFilters(DEFAULT_FILTERS)}
          className="px-2.5 py-1 text-xs rounded text-gray-600 hover:text-white whitespace-nowrap"
        >
          Reset Targets
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onToggleIndependentScope={toggleIndependentScope}
        />

        <div className="flex flex-col flex-1 min-w-0">
          {/* View toggle */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-surface-600 bg-surface-900 shrink-0">
            <ViewBtn active={view === 'map'} onClick={() => setView('map')} icon={<Map size={11} />}>MAP</ViewBtn>
            <ViewBtn active={view === 'table'} onClick={() => setView('table')} icon={<Table2 size={11} />}>TABLE</ViewBtn>
            <ViewBtn active={view === 'entities'} onClick={() => setView('entities')} icon={<GitBranch size={11} />}>ENTITIES</ViewBtn>
            {view !== 'entities' && (
              <>
                <button
                  onClick={toggleIndependentScope}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    filters.independent_only ? 'bg-white text-black font-bold' : 'text-gray-500 hover:text-white'
                  }`}
                >
                  {filters.independent_only ? 'INDEPENDENTS' : 'ALL OPS'}
                </button>
                <div className="flex items-center gap-2 bg-surface-800 border border-surface-600 rounded px-2 py-1 ml-2 w-72">
                  <Search size={11} className="text-gray-600 shrink-0" />
                  <input
                    value={filters.search}
                    onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                    placeholder="Search leads..."
                    className="bg-transparent text-white text-xs focus:outline-none w-full placeholder-gray-700"
                  />
                </div>
                <button
                  onClick={exportCsv}
                  title="Export CSV"
                  className="p-1.5 rounded hover:bg-surface-700 text-gray-600 hover:text-white transition-colors"
                >
                  <Download size={12} />
                </button>
              </>
            )}
            <span className="ml-auto text-xs text-gray-600 tabular-nums">
              {view === 'entities' ? 'operator candidates' : `${facilities.length.toLocaleString()} facilities`}
            </span>
            {view !== 'entities' && (
              <span className="text-xs text-gray-600 tabular-nums">
                MHP {typeCounts.mobile.toLocaleString()} / SS {typeCounts.storage.toLocaleString()} / target {filters.min_target_score}+ / {filters.independent_only ? 'independent' : 'all ops'}
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 relative">
            {view === 'map' ? (
              <FacilityMap facilities={facilities} selected={selected} onSelect={setSelected} />
            ) : view === 'table' ? (
              <FacilityTable facilities={facilities} selected={selected} onSelect={setSelected} />
            ) : (
              <EntityTable onSelectFacility={setSelected} />
            )}
          </div>
        </div>

        {selected && (
          <DetailPanel
            facility={selected}
            onClose={() => setSelected(null)}
            onUpdate={handleUpdate}
            onSelectFacility={setSelected}
          />
        )}
      </div>

      {showScanModal && (
        <ScanModal
          hasApiKey={stats?.has_api_key}
          onClose={() => { setShowScanModal(false); fetchData() }}
        />
      )}
    </div>
  )
}

function ViewBtn({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors ${
        active ? 'bg-white text-black font-bold' : 'text-gray-500 hover:text-white'
      }`}
    >
      {icon}{children}
    </button>
  )
}
