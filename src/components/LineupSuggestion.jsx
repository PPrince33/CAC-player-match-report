/**
 * LineupSuggestion — elite analyst 4-4-2 lineup suggestion drawn on a portrait pitch.
 * Spatial (positional) data is the PRIMARY filter; per-position stat weights refine the ranking.
 */
import { useMemo, useRef, useLayoutEffect } from 'react'
import { drawPitch } from '../utils/pitchRenderer.js'

const FONT = 'var(--font)'
// Portrait: pitch is taller than wide (68 wide × 105 tall)
const ASPECT = 68 / 105  // width / height

// 4-4-2 slot definitions in data space
// x=0–120: 0 = own goal, 120 = opponent goal (attack = high x)
// y=0–80:  data y=0 = RIGHT flank on screen (after 90° canvas rotation),
//          data y=80 = LEFT flank on screen.
// So LEFT-side slots use HIGH y values, RIGHT-side slots use LOW y values.
const SLOTS = [
  { id: 'LCB',  label: 'LCB', type: 'CB',  side: 'L', x: 20, y: 54 },
  { id: 'RCB',  label: 'RCB', type: 'CB',  side: 'R', x: 20, y: 26 },
  { id: 'LB',   label: 'LB',  type: 'FB',  side: 'L', x: 22, y: 70 },
  { id: 'RB',   label: 'RB',  type: 'FB',  side: 'R', x: 22, y: 10 },
  { id: 'LCM',  label: 'LCM', type: 'CM',  side: 'L', x: 50, y: 52 },
  { id: 'RCM',  label: 'RCM', type: 'CM',  side: 'R', x: 50, y: 28 },
  { id: 'LM',   label: 'LM',  type: 'WM',  side: 'L', x: 56, y: 72 },
  { id: 'RM',   label: 'RM',  type: 'WM',  side: 'R', x: 56, y:  8 },
  { id: 'LST',  label: 'LST', type: 'ST',  side: 'L', x: 90, y: 50 },
  { id: 'RST',  label: 'RST', type: 'ST',  side: 'R', x: 90, y: 30 },
]

function firstName(name = '') {
  const parts = name.trim().split(' ')
  return parts[0].toUpperCase()
}

// Portrait mapping (after 90° clockwise canvas rotation):
//   x (0–120) → vertical:   x=0 = bottom (defense), x=120 = top (attack)
//   y (0–80)  → horizontal: the rotation makes y=0 appear on RIGHT, y=80 on LEFT
//                            so we flip: px = (1 - y/80) * w
function mapCoords(x, y, w, h) {
  return {
    px: (1 - y / 80) * w,   // flipped: y=0 → right edge, y=80 → left edge
    py: (1 - x / 120) * h,
  }
}

const DEF_ACTIONS = ['Standing Tackle', 'Sliding Tackle', 'Pass Intercept', 'Pressure', 'Block', 'Clearance']

// ─── Step 1: Average Pass-Receiving Location ─────────────────────────────────
//
// A player's "natural position" on the pitch = where they typically RECEIVE the ball.
// Best proxy from our data: average start_x / start_y of ALL their actions
// (where they ARE when they do anything = where they received the ball and now act on it).
// We also include the end_x/end_y of passes they make (= where they like to be in possession).

function avgReceivingLocation(pid, allStats) {
  const s = allStats[pid] ?? {}

  // All action start positions (where the player physically is)
  const allEvs = (s.allEvents ?? []).filter(e => e.start_x != null && e.start_y != null)
  if (allEvs.length < 3) return null

  const rx = allEvs.reduce((a, e) => a + e.start_x, 0) / allEvs.length
  const ry = allEvs.reduce((a, e) => a + e.start_y, 0) / allEvs.length

  return { x: rx, y: ry }   // raw data coords (x: 0–120, y: 0–80)
}

// ─── Step 2: Euclidean distance between player's avg location and a slot ─────

function spatialDist(loc, slot) {
  if (!loc) return Infinity
  // Scale x and y to same range so distance is balanced (pitch is 120×80)
  const dx = (loc.x - slot.x) / 120
  const dy = (loc.y - slot.y) / 80
  return Math.sqrt(dx * dx + dy * dy)
}

// Convert distance (0–∞) to a score (0–1): closer = higher score
function distToScore(dist) {
  // max meaningful distance on a normalised pitch ≈ sqrt(2) ≈ 1.414
  return Math.max(0, 1 - dist / 1.0)
}

// ─── Step 3: Position-specific stat score (tiebreaker) ───────────────────────

function buildStatHelpers(squad, allStats) {
  const raw = (pid, key) => {
    const s = allStats[pid] ?? {}
    if (key === '_totalDefActions') return (s.tackles ?? 0) + (s.interceptions ?? 0) + (s.clearances ?? 0) + (s.blocks ?? 0) + (s.aerialDuels ?? 0)
    if (key === '_progCarry')       return (s.succDribbles ?? 0) + (s.carriesIntoFT ?? 0)
    if (key === '_passPerMatch')    return (s.totalPasses ?? 0) / (s.matchesPlayed ?? 1)
    return s[key] ?? 0
  }

  const statKeys = [
    'duelsWon', 'tackles', 'interceptions', 'intRegain', 'foulsCommitted',
    'progPasses', 'totalPasses', 'passAccuracy',
    'totalShots', 'totalXG', 'goals', 'aerialDuels', 'succDribbles', 'dribbles',
    '_totalDefActions', '_progCarry', '_passPerMatch',
  ]

  const maxOf = {}
  for (const key of statKeys) {
    maxOf[key] = Math.max(...squad.map(p => raw(p.player_id, key)), 1)
  }

  const norm = (pid, key) => raw(pid, key) / maxOf[key]

  function statScore(pid, slotType) {
    const passPerMatch = raw(pid, '_passPerMatch')
    const paWeight     = passPerMatch > 50 ? 1.0 : 0.4

    switch (slotType) {
      case 'CB':
        return norm(pid,'aerialDuels')         * 0.22
             + norm(pid,'_totalDefActions')     * 0.22
             + norm(pid,'duelsWon')             * 0.18
             + norm(pid,'tackles')              * 0.16
             + norm(pid,'interceptions')        * 0.14
             + (1 - norm(pid,'foulsCommitted')) * 0.05
             + (1 - norm(pid,'dribbles'))       * 0.03

      case 'FB':
        return norm(pid,'_totalDefActions')     * 0.22
             + norm(pid,'_progCarry')           * 0.22
             + norm(pid,'passAccuracy')         * 0.18
             + norm(pid,'duelsWon')             * 0.18
             + norm(pid,'dribbles')             * 0.10
             + norm(pid,'totalPasses')          * 0.10

      case 'CM': {
        const paW  = paWeight * 0.18
        const rest = 1 - paW
        return norm(pid,'intRegain')            * (rest * 0.30)
             + norm(pid,'_totalDefActions')      * (rest * 0.20)
             + norm(pid,'tackles')              * (rest * 0.16)
             + norm(pid,'progPasses')           * (rest * 0.22)
             + norm(pid,'_progCarry')           * (rest * 0.12)
             + norm(pid,'passAccuracy')         * paW
      }

      case 'WM': {
        const paW  = paWeight * 0.08
        const rest = 1 - paW
        return norm(pid,'dribbles')             * (rest * 0.28)
             + norm(pid,'succDribbles')         * (rest * 0.24)
             + norm(pid,'_progCarry')           * (rest * 0.18)
             + norm(pid,'progPasses')           * (rest * 0.14)
             + norm(pid,'totalShots')           * (rest * 0.10)
             + norm(pid,'intRegain')            * (rest * 0.06)
             + norm(pid,'passAccuracy')         * paW
      }

      case 'ST':
        return norm(pid,'goals')                * 0.28
             + norm(pid,'totalShots')           * 0.26
             + norm(pid,'totalXG')             * 0.20
             + norm(pid,'dribbles')             * 0.14
             + norm(pid,'duelsWon')             * 0.08
             + norm(pid,'_totalDefActions')     * 0.04

      default: return 0.5
    }
  }

  return { norm, raw, statScore }
}

// ─── Lineup Computation ───────────────────────────────────────────────────────

const GK_POSITIONS = ['GK', 'Goalkeeper', 'goalkeeper', 'gk']

function computeLineup(lineups, allStats) {
  // Full outfield pool — used for substitutes (no pass-volume filter)
  const outfield = lineups
    .filter(l => {
      const pos = (l.player?.position ?? '').trim()
      if (GK_POSITIONS.some(g => pos.toLowerCase() === g.toLowerCase())) return false
      return !!allStats[l.player_id]
    })
    .sort((a, b) => (allStats[b.player_id]?.matchesPlayed ?? 0) - (allStats[a.player_id]?.matchesPlayed ?? 0))

  // Starter-eligible pool: must average ≥ 20 passes per match
  const squad = outfield.filter(l => {
    const s = allStats[l.player_id]
    const passPerMatch = (s.totalPasses ?? 0) / (s.matchesPlayed ?? 1)
    return passPerMatch >= 20
  })

  if (squad.length < 10) return null

  // ── Step 1: Compute each player's avg receiving location ──────────────────
  const positions = {}
  for (const p of squad) positions[p.player_id] = avgReceivingLocation(p.player_id, allStats)

  // ── Step 2 & 3: Score = spatial proximity (primary) + stats (tiebreaker) ──
  const { statScore } = buildStatHelpers(squad, allStats)

  const SPATIAL_W = 0.70  // avg receiving location is the dominant signal
  const STAT_W    = 0.30  // stats break ties and confirm role suitability

  // Build all (score, pid, slotId) triples
  const triples = []
  for (const slot of SLOTS) {
    for (const p of squad) {
      const loc  = positions[p.player_id]
      const dist = spatialDist(loc, slot)
      const spatScore = distToScore(dist)
      const score = spatScore * SPATIAL_W + statScore(p.player_id, slot.type) * STAT_W
      triples.push({ score, spatScore, dist, pid: p.player_id, slotId: slot.id, slotType: slot.type, side: slot.side })
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

  // Substitutes — drawn from full outfield pool (incl. low-pass players) excluding starters
  // Score each sub by their stat contribution (no position-specific weighting)
  const { norm: normSub } = buildStatHelpers(outfield, allStats)
  const subs = outfield
    .filter(p => !usedPlayers.has(p.player_id))
    .map(p => {
      const overall =
        normSub(p.player_id,'goals')           * 0.15
      + normSub(p.player_id,'totalShots')      * 0.10
      + normSub(p.player_id,'duelsWon')        * 0.15
      + normSub(p.player_id,'_totalDefActions')* 0.15
      + normSub(p.player_id,'progPasses')      * 0.10
      + normSub(p.player_id,'passAccuracy')    * 0.10
      + normSub(p.player_id,'_progCarry')      * 0.15
      + normSub(p.player_id,'interceptions')   * 0.10
      return { player: p, overall, s: allStats[p.player_id] ?? {} }
    })
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 3)

  return { lineup, subs, squad, positions }
}

// ─── Poor fit detection ───────────────────────────────────────────────────────

const POOR_FIT_THRESHOLD = 0.38

function poorFitReason(entry, pos, allStats) {
  const s = allStats[entry.pid] ?? {}
  const reasons = []

  // Spatial mismatch: player's avg receiving location is far from this slot
  if (entry.dist != null && entry.dist > 0.55) reasons.push('avg position far from this zone')

  switch (entry.slotType) {
    case 'CB':
      if ((s.aerialDuels ?? 0) < 1) reasons.push('0 aerial duels won')
      if ((s.duelsWon ?? 0) < 3)    reasons.push('low duels won')
      if ((s.tackles ?? 0) + (s.interceptions ?? 0) < 3) reasons.push('low defensive actions')
      break
    case 'FB':
      if ((s.passAccuracy ?? 0) < 60) reasons.push('pass accuracy <60%')
      break
    case 'CM':
      if ((s.intRegain ?? 0) < 1)   reasons.push('0 interceptions regained')
      if ((s.interceptions ?? 0) < 2) reasons.push('low interceptions')
      if ((s.passAccuracy ?? 0) < 60) reasons.push('pass accuracy <60%')
      break
    case 'WM':
      if ((s.succDribbles ?? 0) < 2) reasons.push('few successful dribbles')
      if (((s.succDribbles ?? 0) + (s.carriesIntoFT ?? 0)) < 2) reasons.push('low progressive carry')
      break
    case 'ST':
      if ((s.totalShots ?? 0) < 2)  reasons.push('fewer than 2 shots total')
      if ((s.goals ?? 0) === 0 && (s.totalShots ?? 0) < 2) reasons.push('no goals, few shots')
      break
  }

  return reasons.length > 0 ? reasons.join(' · ') : null
}

// ─── Canvas Pitch ─────────────────────────────────────────────────────────────

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
      canvas.width        = w * dpr
      canvas.height       = h * dpr
      canvas.style.width  = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)

      // Rotate 90° clockwise so drawPitch (horizontal) renders as portrait
      ctx.save()
      ctx.translate(w, 0)
      ctx.rotate(Math.PI / 2)
      drawPitch(ctx, h, w)
      ctx.restore()

      const r      = Math.max(8, Math.min(16, w / 50))
      const fsName = Math.max(6, Math.min(9, w / 70))
      const fsPos  = Math.max(5, Math.min(8, w / 80))

      for (const slot of SLOTS) {
        const entry = lineup[slot.id]
        if (!entry) continue
        const { px, py } = mapCoords(slot.x, slot.y, w, h)
        const isPoorFit  = entry.score < POOR_FIT_THRESHOLD

        ctx.save()
        ctx.fillStyle   = isPoorFit ? '#D90429' : '#0077B6'
        ctx.strokeStyle = isPoorFit ? '#FFD166' : '#fff'
        ctx.lineWidth   = isPoorFit ? 2.5 : 1.5
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.restore()

        // Jersey number
        ctx.save()
        ctx.fillStyle    = '#fff'
        ctx.font         = `bold ${Math.max(6, r * 0.85)}px ${FONT}`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(entry.player?.jersey_no ?? '?'), px, py)
        ctx.restore()

        // Position label above
        ctx.save()
        ctx.fillStyle    = '#FFD166'
        ctx.font         = `bold ${fsPos}px ${FONT}`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(slot.label, px, py - r - 1)
        ctx.restore()

        // Name below
        ctx.save()
        ctx.fillStyle    = '#111'
        ctx.font         = `bold ${fsName}px ${FONT}`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(firstName(entry.player?.player?.player_name ?? ''), px, py + r + 2)
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

const posColors = { CB: '#0077B6', FB: '#00B4D8', CM: '#023E8A', WM: '#48CAE4', ST: '#D90429' }

export default function LineupSuggestion({ lineups, allStats }) {
  const result = useMemo(() => computeLineup(lineups, allStats), [lineups, allStats])

  if (!result) return (
    <div style={{ padding: 24, fontFamily: FONT, fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
      Not enough players with data to suggest a lineup.
    </div>
  )

  const { lineup, subs, positions } = result

  // Build justification rows
  const rows = SLOTS.map(slot => {
    const entry = lineup[slot.id]
    if (!entry) return null
    const s       = allStats[entry.pid] ?? {}
    const isPoor  = entry.score < POOR_FIT_THRESHOLD
    const name    = entry.player?.player?.player_name ?? 'Unknown'
    const jersey  = entry.player?.jersey_no ?? '?'
    const loc     = positions[entry.pid]  // { x, y } in data coords

    // Spatial note — show where this player naturally operates vs the slot's target zone
    const spatialNote = loc
      ? `avg zone x=${loc.x.toFixed(0)} y=${loc.y.toFixed(0)} (slot x=${slot.x} y=${slot.y})`
      : 'no spatial data'

    // Per-position stat justification
    const passPerMatch = (s.totalPasses ?? 0) / (s.matchesPlayed ?? 1)
    const paNote = passPerMatch > 50 ? `${s.passAccuracy ?? 0}% pass% (${passPerMatch.toFixed(0)}/match)` : `${s.passAccuracy ?? 0}% pass% (low vol.)`
    const totalDefActions = (s.tackles??0)+(s.interceptions??0)+(s.clearances??0)+(s.blocks??0)+(s.aerialDuels??0)
    const justMap = {
      CB:  `${s.aerialDuels??0} aerial duels won · ${totalDefActions} def. actions · ${s.duelsWon??0} duels won · ${spatialNote}`,
      FB:  `${totalDefActions} def. actions · ${(s.succDribbles??0)+(s.carriesIntoFT??0)} prog carries · ${paNote} · ${spatialNote}`,
      CM:  `${s.intRegain??0} int. regained · ${totalDefActions} def. actions · ${paNote} · ${s.progPasses??0} prog passes · ${spatialNote}`,
      WM:  `${s.dribbles??0} dribbles att. · ${s.succDribbles??0} succ. · ${s.progPasses??0} prog passes · ${s.totalShots??0} shots · ${spatialNote}`,
      ST:  `${s.goals??0} goals · ${s.totalShots??0} shots · ${+(s.totalXG??0).toFixed(2)} xG · ${s.dribbles??0} dribbles att. · ${spatialNote}`,
    }

    const poorReason = isPoor ? poorFitReason(entry, pos, allStats) : null

    return { slot, entry, name, jersey, isPoor, poorReason, justification: justMap[slot.type] }
  }).filter(Boolean)

  // Tactical summary
  const starters   = SLOTS.map(s => lineup[s.id]).filter(Boolean)
  const avgDefDuels = starters.filter(e => ['CB','FB'].includes(e.slotType))
    .reduce((a, e) => a + (allStats[e.pid]?.duelsWon ?? 0), 0) / 4
  const avgMidPass  = starters.filter(e => ['CM','WM'].includes(e.slotType))
    .reduce((a, e) => a + (allStats[e.pid]?.passAccuracy ?? 0), 0) / 4
  const fwdGoals    = starters.filter(e => e.slotType === 'ST')
    .reduce((a, e) => a + (allStats[e.pid]?.goals ?? 0), 0)
  const poorCount   = rows.filter(r => r.isPoor).length

  const tacticalNote = [
    `Defensive shape is ${avgDefDuels >= 4 ? 'strong' : avgDefDuels >= 2 ? 'solid' : 'stretched'} (avg ${avgDefDuels.toFixed(1)} duels won per defensive player).`,
    `Midfield passing quality: ${avgMidPass.toFixed(0)}% accuracy across four midfielders.`,
    `Strikers combine for ${fwdGoals} goal${fwdGoals !== 1 ? 's' : ''}${fwdGoals === 0 ? ' — consider a target man or creative playmaker' : fwdGoals >= 3 ? ' — strong attacking output' : ''}.`,
    poorCount > 0 ? `⚠️ ${poorCount} player${poorCount > 1 ? 's' : ''} flagged as poor fit — review squad depth.` : '✓ All selections meet positional fit thresholds.',
  ].join(' ')

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Header */}
      <div style={{ background: '#000', color: '#FFD166', padding: '8px 16px', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
        Suggested Starting XI — 4-4-2
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        {/* Pitch */}
        <div style={{ flex: '0 0 52%', borderRight: '2px solid #000' }}>
          <PitchCanvas lineup={lineup} />
          <div style={{ padding: '5px 12px', background: '#f7f7f7', borderTop: '1px solid #ddd', fontSize: 8, color: '#666', fontFamily: FONT, letterSpacing: 1, textTransform: 'uppercase' }}>
            <span style={{ color: '#0077B6', fontWeight: 700 }}>●</span> Best fit &nbsp;
            <span style={{ color: '#D90429', fontWeight: 700 }}>●</span> Poor fit ⚠️
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Player list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {rows.map(({ slot, entry, name, jersey, isPoor, poorReason, justification }) => (
              <div key={slot.id} style={{ borderBottom: '1px solid #eee', padding: '7px 10px', display: 'flex', gap: 7, alignItems: 'flex-start', background: isPoor ? '#fff5f5' : '#fff' }}>
                {/* Position badge */}
                <div style={{ minWidth: 36, background: posColors[slot.type] ?? '#333', color: '#fff', fontSize: 7, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 3px', textAlign: 'center', flexShrink: 0, marginTop: 1 }}>
                  {slot.label}
                </div>
                {/* Player info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#000', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ opacity: 0.45, fontSize: 9 }}>#{jersey}</span>
                    <span>{name}</span>
                    {isPoor && <span style={{ fontSize: 7, background: '#D90429', color: '#fff', padding: '1px 4px', fontWeight: 700, letterSpacing: 1 }}>⚠ POOR FIT</span>}
                  </div>
                  <div style={{ fontSize: 8, color: '#555', marginTop: 2, letterSpacing: 0.2, lineHeight: 1.4 }}>{justification}</div>
                  {isPoor && poorReason && (
                    <div style={{ fontSize: 7.5, color: '#D90429', marginTop: 2, fontWeight: 700 }}>⚠ {poorReason}</div>
                  )}
                </div>
                {/* Score */}
                <div style={{ fontSize: 9, fontWeight: 700, color: isPoor ? '#D90429' : '#0077B6', flexShrink: 0 }}>
                  {(entry.score * 100).toFixed(0)}
                </div>
              </div>
            ))}
          </div>

          {/* Tactical note */}
          <div style={{ borderTop: '2px solid #000', padding: '10px 12px', background: '#111', color: '#ccc', fontSize: 8.5, lineHeight: 1.7, letterSpacing: 0.3 }}>
            <div style={{ color: '#FFD166', fontWeight: 700, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Tactical Analysis</div>
            {tacticalNote}
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
                  <div key={player.player_id} style={{ borderBottom: '1px solid #eee', padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center', background: '#fff' }}>
                    <span style={{ fontSize: 9, opacity: 0.45, minWidth: 22 }}>#{subJersey}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>{subName}</span>
                    <span style={{ fontSize: 8, color: '#666' }}>
                      {(s.goals ?? 0)}G · {(s.totalShots ?? 0)} shots · {(s.duelsWon ?? 0)} duels · {(s.passAccuracy ?? 0)}% pass
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
