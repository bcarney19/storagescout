import {
  createColumnHelper, flexRender,
  getCoreRowModel, getSortedRowModel, useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'

const col = createColumnHelper()

// HIGH score = red (prime lead), LOW score = green (skip)
function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className="text-gray-600 tabular-nums">—</span>
  const color =
    score >= 80 ? 'text-red-400' :
    score >= 60 ? 'text-orange-400' :
    score >= 40 ? 'text-yellow-400' :
    score >= 20 ? 'text-lime-400' : 'text-green-400'
  return <span className={`font-bold tabular-nums ${color}`}>{score}</span>
}

const STAGE_PILL = {
  new:        'bg-white/10 text-white',
  contacted:  'bg-white/10 text-gray-300',
  interested: 'bg-white/20 text-white',
  under_loi:  'bg-white/30 text-white font-bold',
  closed:     'bg-green-900/60 text-green-300',
  dead:       'bg-white/5 text-gray-600',
}

const columns = [
  col.accessor('target_score', {
    header: 'TARGET',
    cell: (i) => <ScoreBadge score={i.getValue()} />,
    size: 70,
  }),
  col.accessor('opportunity_score', {
    header: 'WEB',
    cell: (i) => <ScoreBadge score={i.getValue()} />,
    size: 65,
  }),
  col.accessor('name', {
    header: 'NAME',
    cell: (i) => i.getValue()
      ? <span className="text-white">{i.getValue()}</span>
      : <span className="text-gray-600 italic">unnamed</span>,
  }),
  col.accessor('facility_type', {
    header: 'TYPE',
    cell: (i) => <span className="text-gray-500">{i.getValue() === 'self_storage' ? 'SS' : 'MHP'}</span>,
    size: 45,
  }),
  col.accessor('city', { header: 'CITY', size: 130 }),
  col.accessor('state', { header: 'ST', size: 38 }),
  col.accessor('google_review_count', {
    header: 'REVIEWS',
    cell: (i) => <span className="tabular-nums text-gray-400">{i.getValue() ?? '—'}</span>,
    size: 75,
  }),
  col.accessor('google_website', {
    header: 'SITE',
    cell: (i) => i.getValue()
      ? <span className="text-green-400 text-xs">✓</span>
      : <span className="text-red-400 text-xs">✗</span>,
    size: 45,
  }),
  col.accessor('google_phone', {
    header: 'PHONE',
    cell: (i) => i.getValue()
      ? <span className="text-green-400 text-xs">✓</span>
      : <span className="text-red-400 text-xs">✗</span>,
    size: 55,
  }),
  col.accessor('deal_stage', {
    header: 'STAGE',
    cell: (i) => (
      <span className={`text-xs px-1.5 py-0.5 rounded ${STAGE_PILL[i.getValue()] || ''}`}>
        {i.getValue()}
      </span>
    ),
    size: 90,
  }),
  col.accessor('lead_thesis', {
    header: 'THESIS',
    cell: (i) => <span className="text-gray-500 truncate block max-w-96">{i.getValue()}</span>,
  }),
]

export default function FacilityTable({ facilities, selected, onSelect }) {
  const [sorting, setSorting] = useState([{ id: 'opportunity_score', desc: true }])

  const table = useReactTable({
    data: facilities,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-surface-900 z-10">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-surface-600">
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  onClick={h.column.getToggleSortingHandler()}
                  className="px-3 py-2 text-left text-gray-600 tracking-widest font-normal cursor-pointer hover:text-white select-none whitespace-nowrap"
                  style={{ width: h.column.columnDef.size }}
                >
                  <span className="flex items-center gap-1">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' && <ArrowUp size={10} />}
                    {h.column.getIsSorted() === 'desc' && <ArrowDown size={10} />}
                  </span>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelect(row.original)}
              className={`border-b border-surface-700 cursor-pointer transition-colors ${
                selected?.id === row.original.id ? 'bg-surface-700' : 'hover:bg-surface-800'
              }`}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-1.5 whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {facilities.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-600 text-xs">
          <span className="text-2xl">◎</span>
          <span>No facilities — click IMPORT STATE to begin</span>
        </div>
      )}
    </div>
  )
}
