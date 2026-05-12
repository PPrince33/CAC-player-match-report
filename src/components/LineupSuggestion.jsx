/**
 * LineupSuggestion — Football Data Scientist approach
 *
 * Pipeline:
 *  1. Extract per-player metrics (P90 normalised)
 *  2. Percentile-rank every metric across the squad (0–100)
 *  3. Compute position-specific composite ratings via weighted percentile sums
 *  4. Determine each player's natural position from avg pitch coordinates
 *  5. Greedy 4-4-2 slot assignment: composite rating (65%) + spatial fit (35%)
 *  6. Render pitch + justified selection panel (rating + top-2 metrics)
 */
import { useMemo, useRef, useLayoutEffect } from 'react'
import { drawPitch } from '../utils/pitchRenderer.js'

const FONT   = 'var(--font)'
const ASPECT = 68 / 105   // portrait width / height

// 4-4-2 slots — y-axis: after 90° canvas rotation y=0→screen-RIGHT, y=80→screen-LEFT
// LEFT slots use HIGH y; RIGHT slots use LOW y
const SLOTS = [
  { id: 'LCB', label: 'LCB', type: 'CB', side: 'L', x: 20, y: 54 },
  { id: 'RCB', label: 'RCB', type: 'CB', side: 'R', x: 20, y: 26 },
  { id: 'LB',  label: 'LB',  type: 'FB', side: 'L', x: 22, y: 70 },
  { id: 'RB',  label: 'RB',  type: 'FB', side: 'R', x: 22, y: 10 },
  { id: 'LCM', label: 'LCM', type: 'CM', side: 'L', x: 50, y: 52 },
  { id: 'RCM', label: 'RCM', type: 'CM', side: 'R', x: 50, y: 28 },
  { id: 'LM',  label: 'LM',  type: 'WM', side: 'L', x: 56, y: 72 },
  { id: 'RM',  label: 'RM',  type: 'WM', side: 'R', x: 56, y:  8 },
  { id: 'LST', label: 'LST', type: 'ST', side: 'L', x: 90, y: 50 },
  { id: 'RST', label: 'RST', type: 'ST', side: 'R', x: 90, y: 30 },
]

const GK_POSITIONS = new Set(['gk', 'goalkeeper'])

function firstName(name = '') {
  return name.trim().split(' ')[0].toUpperCase()
}

// Portrait mapping: flip y so y=80→LEFT, y=0→RIGHT (matches rotated drawPitch)
function mapCoords(x, y, w, h) {
  return { px: (1 - y / 80) * w, py: (1 - x / 120) * h }
}

// ─── 1. Metric Extraction (P90 normalised) ────────────────────────────────────

function extractMetrics(pid, allStats) {
  const s = allStats[pid]
  if (!s) return null

  const mp  = Math.max(s.matchesPlayed ?? 1, 1)
  const p90 = v => (v ?? 0) / mp

  const totalShots    = s.totalShots    ?? 0
  const shotsOnTarget = s.shotsOnTarget ?? 0
  const goals         = s.goals         ?? 0
  const dribbles      = s.dribbles      ?? 0
  const succDribbles  = s.succDribbles  ?? 0
  const totalPasses   = s.totalPasses   ?? 0
  const ownHP         = s.ownHalfPasses ?? 0
  const succOwnHP     = s.succOwnHalfPasses ?? 0
  const tackles       = s.tackles       ?? 0
  const succTackles   = s.succTackles   ?? 0

  return {
    // ── Shooting ──
    totalShots:      p90(totalShots),
    shotsOnTarget:   p90(shotsOnTarget),
    goals:           p90(goals),
    xG:              p90(s.totalXG   ?? 0),
    xGOT:            p90(s.totalXGOT ?? 0),
    conversionRate:  totalShots    > 0 ? goals        / totalShots    : 0,
    shotAccuracy:    totalShots    > 0 ? shotsOnTarget / totalShots   : 0,

    // ── Dribbling & Carries ──
    dribbles:        p90(dribbles),
    succDribbles:    p90(succDribbles),
    dribbleSuccRate: dribbles      > 0 ? succDribbles / dribbles      : 0,
    carriesIntoFT:   p90(s.carriesIntoFT  ?? 0),
    carriesIntoBox:  p90(s.carriesIntoBox ?? 0),

    // ── Passing ──
    totalPasses:     p90(totalPasses),
    passAccuracy:    s.passAccuracy ?? 0,     // already 0–100 %
    progPasses:      p90(s.progPasses        ?? 0),
    succProgPasses:  p90(s.successProgPasses ?? 0),
    longBalls:       p90(s.longBalls         ?? 0),
    crosses:         p90(s.crosses           ?? 0),
    succCrosses:     p90(s.successCrosses    ?? 0),
    passesIntoBox:   p90(s.passesIntoBox     ?? 0),
    keyPasses:       p90(s.keyPasses         ?? 0),
    assists:         p90(s.assists           ?? 0),
    ownHalfPasses:   p90(ownHP),
    oppHalfPasses:   p90(s.oppHalfPasses     ?? 0),
    ownHalfPassAcc:  ownHP > 0 ? (succOwnHP / ownHP) * 100 : 0,  // 0–100 %

    // ── Defensive ──
    tackles:         p90(tackles),
    succTackles:     p90(succTackles),
    tackleSuccRate:  tackles       > 0 ? succTackles / tackles        : 0,
    interceptions:   p90(s.interceptions ?? 0),
    intRegain:       p90(s.intRegain     ?? 0),
    aerialDuels:     p90(s.aerialDuels   ?? 0),
    pressures:       p90(s.pressures     ?? 0),
    blocks:          p90(s.blocks        ?? 0),
    clearances:      p90(s.clearances    ?? 0),

    // ── Meta ──
    mp,
    passPerMatch: p90(totalPasses) * mp,   // raw passes per match
  }
}

// ─── 2. Percentile Ranking ────────────────────────────────────────────────────

function buildPercentileRanker(playerIds, metrics) {
  const skipKeys = new Set(['mp', 'passPerMatch'])
  const dists = {}

  for (const pid of playerIds) {
    const m = metrics[pid]
    if (!m) continue
    for (const [k, v] of Object.entries(m)) {
      if (skipKeys.has(k)) continue
      if (!dists[k]) dists[k] = []
      dists[k].push(v)
    }
  }

  return function rank(pid, key) {
    const val  = metrics[pid]?.[key] ?? 0
    const dist = dists[key] ?? []
    if (dist.length <= 1) return 50
    const below = dist.filter(v => v < val).length
    const equal = dist.filter(v => v === val).length
    return ((below + equal * 0.5) / dist.length) * 100
  }
}

// ─── 3. Position-Specific Composite Ratings ───────────────────────────────────

const POSITION_WEIGHTS = {
  CB: [
    { key: 'aerialDuels',   w: 0.25, label: 'Aerial Duels Won' },
    { key: 'clearances',    w: 0.20, label: 'Clearances' },
    { key: 'interceptions', w: 0.20, label: 'Interceptions' },
    { key: 'succTackles',   w: 0.15, label: 'Tackles Won' },
    { key: 'ownHalfPassAcc',w: 0.10, label: 'Own-Half Pass Acc%' },
    { key: 'blocks',        w: 0.10, label: 'Blocks' },
  ],
  FB: [
    { key: 'succTackles',   w: 0.20, label: 'Tackles Won' },
    { key: 'interceptions', w: 0.15, label: 'Interceptions' },
    { key: 'progPasses',    w: 0.20, label: 'Progressive Passes' },
    { key: 'crosses',       w: 0.20, label: 'Crosses' },
    { key: 'carriesIntoFT', w: 0.15, label: 'Carries into Final 3rd' },
    { key: 'succDribbles',  w: 0.10, label: 'Successful Dribbles' },
  ],
  CM: [
    { key: 'totalPasses',   w: 0.15, label: 'Passes P90' },
    { key: 'passAccuracy',  w: 0.20, label: 'Pass Accuracy%' },
    { key: 'progPasses',    w: 0.20, label: 'Progressive Passes' },
    { key: 'oppHalfPasses', w: 0.15, label: 'Passes in Opp. Half' },
    { key: 'interceptions', w: 0.15, label: 'Interceptions' },
    { key: 'pressures',     w: 0.15, label: 'Pressures Applied' },
  ],
  WM: [
    { key: 'dribbles',       w: 0.20, label: 'Dribbles Attempted' },
    { key: 'dribbleSuccRate',w: 0.15, label: 'Dribble Success%' },
    { key: 'crosses',        w: 0.20, label: 'Crosses' },
    { key: 'keyPasses',      w: 0.20, label: 'Key Passes' },
    { key: 'carriesIntoFT',  w: 0.15, label: 'Carries into Final 3rd' },
    { key: 'progPasses',     w: 0.10, label: 'Progressive Passes' },
  ],
  ST: [
    { key: 'goals',          w: 0.25, label: 'Goals P90' },
    { key: 'xG',             w: 0.20, label: 'xG P90' },
    { key: 'shotsOnTarget',  w: 0.20, label: 'Shots on Target P90' },
    { key: 'conversionRate', w: 0.15, label: 'Conversion Rate' },
    { key: 'carriesIntoBox', w: 0.10, label: 'Carries into Box' },
    { key: 'aerialDuels',    w: 0.10, label: 'Aerial Duels Won' },
  ],
}

function computeComposite(pid, posType, rank, metrics) {
  const weights = POSITION_WEIGHTS[posType] ?? []
  const contribs = weights.map(({ key, w, label }) => {
    const pct = rank(pid, key)
    return { key, label, w, pct, contrib: w * pct, rawVal: metrics[pid]?.[key] ?? 0 }
  })
  const totalW = weights.reduce((s, c) => s + c.w, 0) || 1
  const rating = contribs.reduce((s, c) => s + c.contrib, 0) / totalW
  const top2   = [...contribs].sort((a, b) => b.contrib - a.contrib).slice(0, 2)
  return { rating, top2 }
}

// Format a raw metric value for display
function fmtVal(key, val) {
  if (key === 'passAccuracy' || key === 'ownHalfPassAcc') return `${val.toFixed(0)}%`
  if (key === 'conversionRate' || key === 'dribbleSuccRate' || key === 'tackleSuccRate' || key === 'shotAccuracy')
    return `${(val * 100).toFixed(0)}%`
  if (key === 'xG' || key === 'xGOT') return val.toFixed(2)
  return val.toFixed(1)
}

// ─── 4. Spatial: Avg position from all events ─────────────────────────────────

function avgLocation(pid, allStats) {
  const evs = (allStats[pid]?.allEvents ?? []).filter(e => e.start_x != null && e.start_y != null)
  if (evs.length < 3) return null
  return {
    x: evs.reduce((a, e) => a + e.start_x, 0) / evs.length,
    y: evs.reduce((a, e) => a + e.start_y, 0) / evs.length,
  }
}

function spatialDist(loc, slot) {
  if (!loc) return 1.0
  const dx = (loc.x - slot.x) / 120
  const dy = (loc.y - slot.y) / 80
  return Math.sqrt(dx * dx + dy * dy)
}

// ─── 5. Lineup Computation ────────────────────────────────────────────────────

function computeLineup(lineups, allStats) {
  // Full outfield pool (for subs — no pass filter)
  const outfield = lineups.filter(l => {
    const pos = (l.player?.position ?? '').trim().toLowerCase()
    return !GK_POSITIONS.has(pos) && !!allStats[l.player_id]
  })

  // Starter pool: ≥ 20 passes/match
  const squad = outfield.filter(l => {
    const s = allStats[l.player_id]
    return ((s.totalPasses ?? 0) / (s.matchesPlayed ?? 1)) >= 20
  })

  if (squad.length < 10) return null

  const pids = squad.map(p => p.player_id)

  // Extract metrics
  const metrics = {}
  for (const pid of pids) metrics[pid] = extractMetrics(pid, allStats)

  // Build percentile ranker
  const rank = buildPercentileRanker(pids, metrics)

  // Composite ratings for all position types
  const composites = {}
  for (const pid of pids) {
    composites[pid] = {}
    for (const type of ['CB', 'FB', 'CM', 'WM', 'ST']) {
      composites[pid][type] = computeComposite(pid, type, rank, metrics)
    }
  }

  // Avg locations
  const locations = {}
  for (const pid of pids) locations[pid] = avgLocation(pid, allStats)

  // Score each (player × slot):
  // final_score = composite_rating (0–100) * 0.65 + spatial_score (0–100) * 0.35
  const RATING_W  = 0.65
  const SPATIAL_W = 0.35

  const triples = []
  for (const slot of SLOTS) {
    for (const p of squad) {
      const { rating, top2 } = composites[p.player_id][slot.type]
      const dist    = spatialDist(locations[p.player_id], slot)
      const spatPct = Math.max(0, (1 - dist / 0.8)) * 100
      const score   = rating * RATING_W + spatPct * SPATIAL_W
      triples.push({ score, rating, spatPct, dist, pid: p.player_id, slotId: slot.id, slotType: slot.type, side: slot.side, top2 })
    }
  }
  triples.sort((a, b) => b.score - a.score)

  const usedPlayers = new Set()
  const usedSlots   = new Set()
  const lineup      = {}

  for (const t of triples) {
    if (usedPlayers.has(t.pid) || usedSlots.has(t.slotId)) continue
    const player = squad.find(p => p.player_id === t.pid)
    lineup[t.slotId] = { ...t, player }
    usedPlayers.add(t.pid)
    usedSlots.add(t.slotId)
    if (Object.keys(lineup).length === SLOTS.length) break
  }

  // Subs: remaining outfield sorted by overall contribution score
  const subMetrics = {}
  const subPids    = outfield.map(l => l.player_id)
  for (const pid of subPids) subMetrics[pid] = extractMetrics(pid, allStats)
  const subRank = buildPercentileRanker(subPids, subMetrics)

  const overall = (pid) => {
    const r = (key) => subRank(pid, key)
    return r('goals')*0.15 + r('xG')*0.10 + r('shotsOnTarget')*0.08 +
           r('succTackles')*0.12 + r('interceptions')*0.12 +
           r('progPasses')*0.10 + r('keyPasses')*0.10 +
           r('dribbles')*0.10 + r('passAccuracy')*0.08 + r('pressures')*0.05
  }

  const subs = outfield
    .filter(p => !usedPlayers.has(p.player_id))
    .map(p => ({ player: p, overall: overall(p.player_id), s: allStats[p.player_id] ?? {} }))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 3)

  return { lineup, subs, metrics, composites }
}

// ─── Canvas Pitch ─────────────────────────────────────────────────────────────

const POOR_FIT = 45   // composite rating below this = flagged

const posColors = { CB: '#0077B6', FB: '#00B4D8', CM: '#023E8A', WM: '#48CAE4', ST: '#D90429' }

function PitchCanvas({ lineup }) {
  const containerRef = useRef(null)
  const canvasRef    = useRef(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const canvas    = canvasRef.current
    if (!container || !canvas || !lineup) return

    function draw(w) {
      if (w <= 0) return
      const h   = w / ASPECT
      const dpr = window.devicePixelRatio || 1
      canvas.width  = w * dpr; canvas.height  = h * dpr
      canvas.style.width  = `${w}px`; canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)

      // Rotate 90° clockwise → horizontal drawPitch renders as portrait
      ctx.save()
      ctx.translate(w, 0)
      ctx.rotate(Math.PI / 2)
      drawPitch(ctx, h, w)
      ctx.restore()

      const r      = Math.max(9, Math.min(17, w / 46))
      const fsName = Math.max(6, Math.min(9, w / 68))
      const fsPosL = Math.max(5, Math.min(8, w / 82))

      for (const slot of SLOTS) {
        const entry = lineup[slot.id]
        if (!entry) continue
        const { px, py } = mapCoords(slot.x, slot.y, w, h)
        const isPoor     = entry.rating < POOR_FIT
        const fillColor  = posColors[slot.type] ?? '#333'
        const ratingPct  = Math.round(entry.rating)

        // Outer ring — rating arc
        ctx.save()
        ctx.beginPath()
        ctx.arc(px, py, r + 3, -Math.PI / 2, -Math.PI / 2 + (ratingPct / 100) * Math.PI * 2)
        ctx.strokeStyle = isPoor ? '#FFD166' : '#00FF88'
        ctx.lineWidth   = 2
        ctx.stroke()
        ctx.restore()

        // Main circle
        ctx.save()
        ctx.fillStyle   = fillColor
        ctx.strokeStyle = isPoor ? '#D90429' : '#fff'
        ctx.lineWidth   = isPoor ? 2.5 : 1.5
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill(); ctx.stroke()
        ctx.restore()

        // Jersey number
        ctx.save()
        ctx.fillStyle    = '#fff'
        ctx.font         = `bold ${Math.max(6, r * 0.75)}px ${FONT}`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(entry.player?.jersey_no ?? '?'), px, py)
        ctx.restore()

        // Position label (above)
        ctx.save()
        ctx.fillStyle    = '#FFD166'
        ctx.font         = `bold ${fsPosL}px ${FONT}`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(slot.label, px, py - r - 2)
        ctx.restore()

        // Rating badge (below circle)
        ctx.save()
        ctx.fillStyle    = isPoor ? '#D90429' : '#00FF88'
        ctx.font         = `bold ${Math.max(5, r * 0.65)}px ${FONT}`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(`${ratingPct}`, px, py + r + 2)
        ctx.restore()

        // Player first name (below rating)
        ctx.save()
        ctx.fillStyle    = '#111'
        ctx.font         = `bold ${fsName}px ${FONT}`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(firstName(entry.player?.player?.player_name ?? ''), px, py + r + 2 + Math.max(5, r * 0.65) + 1)
        ctx.restore()
      }
    }

    const initW = container.offsetWidth || container.getBoundingClientRect().width
    draw(initW)
    const obs = new ResizeObserver(([e]) => draw(e.contentRect.width))
    obs.observe(container)
    return () => obs.disconnect()
  }, [lineup])

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LineupSuggestion({ lineups, allStats }) {
  const result = useMemo(() => computeLineup(lineups, allStats), [lineups, allStats])

  if (!result) return (
    <div style={{ padding: 24, fontFamily: FONT, fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
      Not enough players with ≥ 20 passes/match to suggest a lineup.
    </div>
  )

  const { lineup, subs, metrics, composites } = result

  // Build justification rows
  const rows = SLOTS.map(slot => {
    const entry = lineup[slot.id]
    if (!entry) return null
    const name   = entry.player?.player?.player_name ?? 'Unknown'
    const jersey = entry.player?.jersey_no ?? '?'
    const rating = Math.round(entry.rating)
    const isPoor = rating < POOR_FIT
    const m      = metrics[entry.pid] ?? {}

    // Top 2 metrics that justified selection
    const top2Lines = entry.top2.map(({ label, pct, rawVal, key }) =>
      `${label}: ${fmtVal(key, rawVal)} (${Math.round(pct)}th pct)`
    )

    return { slot, entry, name, jersey, rating, isPoor, top2Lines }
  }).filter(Boolean)

  // Tactical summary
  const starters    = SLOTS.map(s => lineup[s.id]).filter(Boolean)
  const avgCBrating = starters.filter(e => e.slotType === 'CB').reduce((a, e) => a + e.rating, 0) / 2
  const avgMFrating = starters.filter(e => ['CM','WM'].includes(e.slotType)).reduce((a, e) => a + e.rating, 0) / 4
  const avgSTrating = starters.filter(e => e.slotType === 'ST').reduce((a, e) => a + e.rating, 0) / 2
  const overallRating = starters.reduce((a, e) => a + e.rating, 0) / starters.length
  const poorCount   = rows.filter(r => r.isPoor).length

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Header */}
      <div style={{ background: '#000', color: '#FFD166', padding: '8px 16px', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Suggested Starting XI — 4-4-2</span>
        <span style={{ fontSize: 9, color: '#aaa', letterSpacing: 1 }}>
          Squad Rating: <span style={{ color: '#00FF88', fontSize: 11 }}>{overallRating.toFixed(0)}</span>/100
        </span>
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        {/* Pitch */}
        <div style={{ flex: '0 0 50%', borderRight: '2px solid #000' }}>
          <PitchCanvas lineup={lineup} />
          <div style={{ padding: '5px 12px', background: '#f0f0f0', borderTop: '1px solid #ddd', fontSize: 8, color: '#555', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span><span style={{ color: '#00FF88', fontWeight: 700 }}>━</span> Rating arc</span>
            <span><span style={{ color: '#00FF88', fontWeight: 700 }}>●</span> Good fit</span>
            <span><span style={{ color: '#D90429', fontWeight: 700 }}>●</span> Poor fit (&lt;{POOR_FIT})</span>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Player justification list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {rows.map(({ slot, entry, name, jersey, rating, isPoor, top2Lines }) => (
              <div key={slot.id} style={{ borderBottom: '1px solid #eee', padding: '6px 10px', display: 'flex', gap: 7, alignItems: 'flex-start', background: isPoor ? '#fff8f8' : '#fff' }}>
                {/* Position badge */}
                <div style={{ minWidth: 36, background: posColors[slot.type] ?? '#333', color: '#fff', fontSize: 7, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 2px', textAlign: 'center', flexShrink: 0, marginTop: 1 }}>
                  {slot.label}
                </div>

                {/* Player info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, opacity: 0.4 }}>#{jersey}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{name}</span>
                    {isPoor && <span style={{ fontSize: 7, background: '#D90429', color: '#fff', padding: '1px 4px', fontWeight: 700 }}>⚠ POOR FIT</span>}
                  </div>
                  {/* Top 2 metrics */}
                  {top2Lines.map((line, i) => (
                    <div key={i} style={{ fontSize: 8, color: '#555', marginTop: 1, letterSpacing: 0.2 }}>
                      <span style={{ color: i === 0 ? '#0077B6' : '#00B4D8', fontWeight: 700, marginRight: 3 }}>#{i + 1}</span>
                      {line}
                    </div>
                  ))}
                </div>

                {/* Composite rating */}
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isPoor ? '#D90429' : rating >= 65 ? '#0077B6' : '#555', lineHeight: 1 }}>
                    {rating}
                  </div>
                  <div style={{ fontSize: 7, color: '#999', letterSpacing: 0.5 }}>/100</div>
                </div>
              </div>
            ))}
          </div>

          {/* Rating breakdown bar */}
          <div style={{ borderTop: '1px solid #eee', padding: '8px 10px', background: '#fafafa', display: 'flex', gap: 8 }}>
            {[
              { label: 'Defense', val: avgCBrating, color: '#0077B6' },
              { label: 'Midfield', val: avgMFrating, color: '#023E8A' },
              { label: 'Attack',  val: avgSTrating, color: '#D90429' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 7, color: '#999', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                <div style={{ height: 4, background: '#eee', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${val}%`, height: '100%', background: color, borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color, marginTop: 2 }}>{val.toFixed(0)}</div>
              </div>
            ))}
          </div>

          {/* Tactical note */}
          <div style={{ borderTop: '2px solid #000', padding: '9px 12px', background: '#111', color: '#ccc', fontSize: 8.5, lineHeight: 1.7 }}>
            <div style={{ color: '#FFD166', fontWeight: 700, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Tactical Analysis</div>
            Defense rated <strong style={{ color: '#6ec6ff' }}>{avgCBrating.toFixed(0)}/100</strong> · Midfield <strong style={{ color: '#6ec6ff' }}>{avgMFrating.toFixed(0)}/100</strong> · Attack <strong style={{ color: '#ff8888' }}>{avgSTrating.toFixed(0)}/100</strong>.
            {poorCount > 0
              ? ` ⚠ ${poorCount} player${poorCount > 1 ? 's' : ''} rated below ${POOR_FIT} — squad depth may be limited in those positions.`
              : ' ✓ All selections meet the positional fit threshold.'
            }
          </div>

          {/* Substitutes */}
          {subs.length > 0 && (
            <div style={{ borderTop: '2px solid #000' }}>
              <div style={{ background: '#222', color: '#FFD166', padding: '4px 12px', fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                Suggested Substitutes
              </div>
              {subs.map(({ player, s }) => {
                const subName   = player.player?.player_name ?? 'Unknown'
                const subJersey = player.jersey_no ?? '?'
                return (
                  <div key={player.player_id} style={{ borderBottom: '1px solid #eee', padding: '5px 12px', display: 'flex', gap: 8, alignItems: 'center', background: '#fff' }}>
                    <span style={{ fontSize: 9, opacity: 0.4, minWidth: 22 }}>#{subJersey}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>{subName}</span>
                    <span style={{ fontSize: 8, color: '#666' }}>
                      {(s.goals ?? 0)}G · {(s.totalShots ?? 0)} shots · {(s.succTackles ?? 0)} tkl won · {(s.passAccuracy ?? 0)}% pass
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
