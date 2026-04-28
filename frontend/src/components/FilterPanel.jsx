const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

const FACILITY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'self_storage', label: 'Self Storage' },
  { value: 'mobile_home_park', label: 'Mobile Home' },
]

const DEAL_STAGES = [
  { value: '', label: 'All Stages' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'interested', label: 'Interested' },
  { value: 'under_loi', label: 'Under LOI' },
  { value: 'closed', label: 'Closed' },
  { value: 'dead', label: 'Dead' },
]

export default function FilterPanel({ filters, onChange }) {
  const set = (key, val) => onChange((prev) => ({ ...prev, [key]: val }))

  return (
    <div className="w-52 shrink-0 border-r border-surface-600 bg-surface-900 flex flex-col gap-5 p-3 overflow-y-auto">
      <Section label="STATE">
        <select
          value={filters.state}
          onChange={(e) => set('state', e.target.value)}
          className="w-full bg-surface-800 border border-surface-600 text-white text-xs px-2 py-1.5 rounded focus:outline-none focus:border-white"
        >
          <option value="">All States</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Section>

      <Section label="TYPE">
        <div className="flex flex-col gap-1">
          {FACILITY_TYPES.map((opt) => (
            <ToggleBtn key={opt.value} active={filters.facility_type === opt.value} onClick={() => set('facility_type', opt.value)}>
              {opt.label}
            </ToggleBtn>
          ))}
        </div>
      </Section>

      <Section label="OPPORTUNITY SCORE">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Min: {filters.min_score}</span>
            <span>Max: {filters.max_score}</span>
          </div>
          <input type="range" min={0} max={100} value={filters.min_score}
            onChange={(e) => set('min_score', Number(e.target.value))} className="w-full" />
          <input type="range" min={0} max={100} value={filters.max_score}
            onChange={(e) => set('max_score', Number(e.target.value))} className="w-full" />
          <button
            onClick={() => onChange((p) => ({ ...p, min_score: 70, max_score: 100 }))}
            className="text-xs text-red-400 hover:text-red-300 text-left mt-1"
          >
            Prime leads only (70+)
          </button>
          <button
            onClick={() => onChange((p) => ({ ...p, min_score: 0, max_score: 100 }))}
            className="text-xs text-gray-600 hover:text-gray-400 text-left"
          >
            Reset
          </button>
        </div>
      </Section>

      <Section label="DEAL STAGE">
        <div className="flex flex-col gap-1">
          {DEAL_STAGES.map((opt) => (
            <ToggleBtn key={opt.value} active={filters.deal_stage === opt.value} onClick={() => set('deal_stage', opt.value)}>
              {opt.label}
            </ToggleBtn>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div>
      <div className="text-xs text-gray-600 mb-2 tracking-widest">{label}</div>
      {children}
    </div>
  )
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-left px-2 py-1 text-xs rounded transition-colors ${
        active ? 'bg-white text-black font-bold' : 'text-gray-500 hover:text-white hover:bg-surface-700'
      }`}
    >
      {children}
    </button>
  )
}
