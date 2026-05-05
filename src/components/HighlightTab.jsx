import { useState, useRef, useCallback, useMemo } from 'react'

const B  = '2px solid #000'
const BT = '3px solid #000'

const unique = (arr) => [...new Set(arr.filter(Boolean))].sort()

function PitchBrush({ events, onBrushChange }) {
  const svgRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [start, setStart]       = useState(null)
  const [rect, setRect]         = useState(null)   // {x,y,w,h} in pitch coords (0-120, 0-80)

  const getSVGPoint = useCallback((e) => {
    const svg = svgRef.current
    if (!svg) return null
    const br = svg.getBoundingClientRect()
    const relX = (e.clientX - br.left) / br.width  * 120
    const relY = (e.clientY - br.top)  / br.height * 80
    return { x: Math.max(0, Math.min(120, relX)), y: Math.max(0, Math.min(80, relY)) }
  }, [])

  const onMouseDown = useCallback((e) => {
    const pt = getSVGPoint(e)
    if (!pt) return
    setDragging(true)
    setStart(pt)
    setRect(null)
    onBrushChange(null)
  }, [getSVGPoint, onBrushChange])

  const onMouseMove = useCallback((e) => {
    if (!dragging || !start) return
    const pt = getSVGPoint(e)
    if (!pt) return
    const x = Math.min(start.x, pt.x)
    const y = Math.min(start.y, pt.y)
    const w = Math.abs(pt.x - start.x)
    const h = Math.abs(pt.y - start.y)
    setRect({ x, y, w, h })
  }, [dragging, start, getSVGPoint])

  const onMouseUp = useCallback((e) => {
    if (!dragging) return
    setDragging(false)
    const pt = getSVGPoint(e)
    if (!pt || !start) return
    const x = Math.min(start.x, pt.x)
    const y = Math.min(start.y, pt.y)
    const w = Math.abs(pt.x - start.x)
    const h = Math.abs(pt.y - start.y)
    if (w < 2 && h < 2) {
      setRect(null)
      onBrushChange(null)
    } else {
      const box = { x, y, w, h }
      setRect(box)
      onBrushChange(box)
    }
  }, [dragging, start, getSVGPoint, onBrushChange])

  const clearBrush = useCallback(() => {
    setRect(null)
    setStart(null)
    onBrushChange(null)
  }, [onBrushChange])

  // Dots for all events (start position)
  const dots = useMemo(() => events.map((ev, i) => ({
    cx: ev.start_x,
    cy: ev.start_y,
    key: i,
  })), [events])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, opacity: 0.6 }}>
          DRAG TO SELECT ZONE · CLICK EMPTY AREA TO CLEAR
        </span>
        {rect && (
          <button onClick={clearBrush} style={{
            fontFamily: 'var(--font)', fontSize: 9, fontWeight: 700,
            background: '#000', color: '#FFD166', border: 'none',
            padding: '3px 8px', letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
          }}>✕ CLEAR</button>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 120 80"
        style={{ width: '100%', border: BT, display: 'block', cursor: dragging ? 'crosshair' : 'crosshair', userSelect: 'none', background: '#fff' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => dragging && setDragging(false)}
      >
        {/* Pitch lines */}
        <rect x={0} y={0} width={120} height={80} fill="#fff" stroke="#000" strokeWidth={0.6} />
        <line x1={60} y1={0} x2={60} y2={80} stroke="#000" strokeWidth={0.4} />
        <circle cx={60} cy={40} r={9.15} fill="none" stroke="#000" strokeWidth={0.4} />
        <circle cx={60} cy={40} r={0.5} fill="#000" />
        {/* Left box */}
        <rect x={0} y={20} width={16.5} height={40} fill="none" stroke="#000" strokeWidth={0.4} />
        <rect x={0} y={30} width={5.5} height={20} fill="none" stroke="#000" strokeWidth={0.3} />
        <circle cx={11} cy={40} r={0.4} fill="#000" />
        {/* Right box */}
        <rect x={103.5} y={20} width={16.5} height={40} fill="none" stroke="#000" strokeWidth={0.4} />
        <rect x={114.5} y={30} width={5.5} height={20} fill="none" stroke="#000" strokeWidth={0.3} />
        <circle cx={109} cy={40} r={0.4} fill="#000" />
        {/* Goals */}
        <rect x={-2} y={36} width={2} height={8} fill="none" stroke="#000" strokeWidth={0.4} />
        <rect x={120} y={36} width={2} height={8} fill="none" stroke="#000" strokeWidth={0.4} />

        {/* Event dots */}
        {dots.map(d => (
          <circle key={d.key} cx={d.cx} cy={d.cy} r={1.2} fill="#0277B6" opacity={0.45} />
        ))}

        {/* Brush rectangle */}
        {rect && (
          <rect
            x={rect.x} y={rect.y} width={rect.w} height={rect.h}
            fill="rgba(255,209,102,0.25)" stroke="#FFD166" strokeWidth={0.8} strokeDasharray="2 1"
          />
        )}
      </svg>
    </div>
  )
}

function fmtTime(sec) {
  if (sec == null) return '—'
  return `${Math.floor(sec / 60)}'${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

export default function HighlightTab({ events = [], playerName }) {
  const [filters, setFilters] = useState({ action: '', outcome: '', type: '' })
  const [brush, setBrush] = useState(null)
  const [selected, setSelected] = useState(null)

  const actions  = useMemo(() => unique(events.map(e => e.action)), [events])
  const outcomes = useMemo(() => unique(events.map(e => e.outcome)), [events])
  const types    = useMemo(() => unique(events.map(e => e.type)), [events])

  const setFilter = (key, val) => setFilters(f => ({ ...f, [key]: val }))

  const filtered = useMemo(() => events.filter(ev => {
    if (filters.action  && ev.action  !== filters.action)  return false
    if (filters.outcome && ev.outcome !== filters.outcome) return false
    if (filters.type    && ev.type    !== filters.type)    return false
    if (brush) {
      const sx = ev.start_x, sy = ev.start_y
      const inStart = sx >= brush.x && sx <= brush.x + brush.w && sy >= brush.y && sy <= brush.y + brush.h
      const ex = ev.end_x, ey = ev.end_y
      const inEnd = ex != null && ey != null && ex >= brush.x && ex <= brush.x + brush.w && ey >= brush.y && ey <= brush.y + brush.h
      if (!inStart && !inEnd) return false
    }
    return true
  }), [events, filters, brush])

  const Select = ({ label, value, options, onChange }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontFamily: 'var(--font)', fontSize: 8, letterSpacing: 1.5, fontWeight: 700, textTransform: 'uppercase', opacity: 0.6 }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          border: BT, background: value ? '#FFD166' : '#fff', color: '#000',
          padding: '4px 6px', cursor: 'pointer', letterSpacing: 0.5,
        }}
      >
        <option value="">ALL</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  return (
    <div style={{ padding: 0 }}>
      {/* Filters row */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 12px 0', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Select label="ACTION"  value={filters.action}  options={actions}  onChange={v => setFilter('action', v)} />
        <Select label="OUTCOME" value={filters.outcome} options={outcomes} onChange={v => setFilter('outcome', v)} />
        <Select label="TYPE"    value={filters.type}    options={types}    onChange={v => setFilter('type', v)} />
        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
          <button
            onClick={() => { setFilters({ action: '', outcome: '', type: '' }); setBrush(null) }}
            style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 700, background: '#000', color: '#FFD166', border: 'none', padding: '6px 12px', letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer' }}
          >
            RESET ALL
          </button>
        </div>
        <div style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, opacity: 0.5, alignSelf: 'flex-end' }}>
          {filtered.length} / {events.length} EVENTS
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: BT, marginTop: 12 }}>
        {/* Left: pitch brush */}
        <div style={{ borderRight: B, padding: 12 }}>
          <PitchBrush events={filtered} onBrushChange={setBrush} />
        </div>

        {/* Right: event list */}
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 480, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 1fr 1fr 60px', background: '#000', color: '#FFD166', padding: '5px 8px', fontFamily: 'var(--font)', fontSize: 8, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            <span>MIN</span><span>ACTION</span><span>OUTCOME</span><span>TYPE</span><span>VIDEO</span>
          </div>
          {/* Scrollable rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', fontFamily: 'var(--font)', fontSize: 11, opacity: 0.4, letterSpacing: 2, textTransform: 'uppercase' }}>
                NO EVENTS MATCH FILTERS
              </div>
            )}
            {filtered.map((ev, i) => {
              const isSelected = selected === i
              const hasVideo   = !!ev.video_url
              return (
                <div
                  key={i}
                  onClick={() => setSelected(isSelected ? null : i)}
                  style={{
                    display: 'grid', gridTemplateColumns: '48px 1fr 1fr 1fr 60px',
                    padding: '5px 8px', borderBottom: B,
                    background: isSelected ? '#FFD166' : i % 2 === 0 ? '#fff' : '#fafafa',
                    cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.3,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ opacity: 0.6, fontSize: 9 }}>{fmtTime(ev.match_time_seconds)}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9 }}>{ev.action ?? '—'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9,
                    color: ev.outcome === 'Goal' ? '#09D69F' : ev.outcome === 'Successful' ? '#0277B6' : ev.outcome?.includes('Fail') || ev.outcome?.includes('Miss') || ev.outcome === 'Unsuccessful' ? '#D90429' : 'inherit' }}>
                    {ev.outcome ?? '—'}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, opacity: 0.6 }}>{ev.type ?? '—'}</span>
                  <span>
                    {hasVideo
                      ? <a href={ev.video_url} target="_blank" rel="noreferrer"
                          style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 700, background: '#000', color: '#FFD166', padding: '2px 6px', textDecoration: 'none', letterSpacing: 1 }}
                          onClick={e => e.stopPropagation()}>
                          ▶ PLAY
                        </a>
                      : <span style={{ fontSize: 8, opacity: 0.25 }}>—</span>
                    }
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Expanded event detail */}
      {selected != null && filtered[selected] && (() => {
        const ev = filtered[selected]
        return (
          <div style={{ border: BT, borderTop: 'none', padding: 12, background: '#fff', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, color: '#FFD166', background: '#000', padding: '2px 8px', alignSelf: 'flex-start' }}>EVENT DETAIL</div>
            {[
              ['TIME',    fmtTime(ev.match_time_seconds)],
              ['ACTION',  ev.action],
              ['OUTCOME', ev.outcome],
              ['TYPE',    ev.type],
              ['BODY',    ev.body_part],
              ['START',   ev.start_x != null ? `(${ev.start_x.toFixed(1)}, ${ev.start_y.toFixed(1)})` : '—'],
              ['END',     ev.end_x != null ? `(${ev.end_x.toFixed(1)}, ${ev.end_y.toFixed(1)})` : '—'],
              ['PRESSURE',ev.pressure_on ? 'YES' : 'NO'],
            ].map(([label, val]) => val != null && (
              <div key={label} style={{ fontFamily: 'var(--font)', fontSize: 10 }}>
                <span style={{ fontWeight: 700, opacity: 0.5, letterSpacing: 1, fontSize: 8, textTransform: 'uppercase', display: 'block' }}>{label}</span>
                <span style={{ fontWeight: 700 }}>{val}</span>
              </div>
            ))}
            {ev.video_url && (
              <a href={ev.video_url} target="_blank" rel="noreferrer"
                style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700, background: '#000', color: '#FFD166', padding: '6px 14px', textDecoration: 'none', letterSpacing: 1.5, alignSelf: 'center', marginLeft: 'auto', textTransform: 'uppercase' }}>
                ▶ WATCH CLIP
              </a>
            )}
          </div>
        )
      })()}
    </div>
  )
}
