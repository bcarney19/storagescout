import { Map, RefreshCw, Table2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import DetailPanel from './components/DetailPanel'
import FacilityMap from './components/FacilityMap'
import FacilityTable from './components/FacilityTable'
import FilterPanel from './components/FilterPanel'
import ScanModal from './components/ScanModal'
import StatsBar from './components/StatsBar'

export default function App() {
  const [facilities, setFacilities] = useState([])
  const [stats, setStats] = useState(null)
  const [filters, setFilters] = useState({
    state: '',
    facility_type: '',
    min_score: 0,
    max_score: 100,
    deal_stage: '',
  })
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

      <div className="flex flex-1 min-h-0">
        <FilterPanel filters={filters} onChange={setFilters} />

        <div className="flex flex-col flex-1 min-w-0">
          {/* View toggle */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-surface-600 bg-surface-900 shrink-0">
            <ViewBtn active={view === 'map'} onClick={() => setView('map')} icon={<Map size={11} />}>MAP</ViewBtn>
            <ViewBtn active={view === 'table'} onClick={() => setView('table')} icon={<Table2 size={11} />}>TABLE</ViewBtn>
            <span className="ml-auto text-xs text-gray-600 tabular-nums">
              {facilities.length.toLocaleString()} facilities
            </span>
          </div>

          <div className="flex-1 min-h-0 relative">
            {view === 'map' ? (
              <FacilityMap facilities={facilities} selected={selected} onSelect={setSelected} />
            ) : (
              <FacilityTable facilities={facilities} selected={selected} onSelect={setSelected} />
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
