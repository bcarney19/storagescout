export default function StatsBar({ stats }) {
  if (!stats) return null
  return (
    <div className="flex items-center gap-6 px-4 py-2 border-b border-surface-600 bg-surface-900 text-xs shrink-0 flex-wrap">
      <Stat label="TOTAL" value={stats.total_facilities} />
      <Stat label="SCANNED" value={stats.scanned} />
      <Stat label="PRIME LEADS (70+)" value={stats.high_opportunity} highlight />
      <Stat label="PENDING" value={stats.pending} />
      {!stats.has_api_key && (
        <span className="ml-auto text-yellow-500 text-xs">
          ⚠ No Google Places API key — add to backend/.env
        </span>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-600 tracking-widest">{label}</span>
      <span className={`font-bold tabular-nums ${highlight ? 'text-red-400' : 'text-white'}`}>
        {(value ?? 0).toLocaleString()}
      </span>
    </div>
  )
}
