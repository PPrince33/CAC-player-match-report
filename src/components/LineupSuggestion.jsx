/**
 * LineupSuggestion — algorithmic 4-4-2 lineup suggestion drawn on a pitch.
 * Scores each player for each position using weighted stats, then greedily assigns
 * the best available player to each slot.
 */
import { useMemo, useRef, useLayoutEffect } from 'react'
import { drawPitch } from '../utils/pitchRenderer.js'

const FONT = 'var(--font)'
const ASPECT = 105 / 68

// 4-4-2 slot definitions: pitch coords in data space (x: 0–120, y: 0–80, attack = high x)
const SLOTS = [
  { id: 'LB',   label: 'LB',  type: 'FB',  x: 22, y: 12 },
  { id: 'CB1',  label: 'CB',  type: 'CB',  x: 20, y: 30 },
  { id: 'CB2',  label: 'CB',  type: 'CB',  x: 20, y: 50 },
  { id: 'RB',   label: 'RB',  type: 'FB',  x: 22, y: 68 },
  { id: 'LM',   label: 'LM',  type: 'WM',  x: 55, y:  8 },
  { id: 'CDM1', label: 'CDM', type: 'CDM', x: 50, y: 30 },
  { id: 'CDM2', label: 'CDM', type: 'CDM', x: 50, y: 50 },
  { id: 'RM',   label: 'RM',  type: 'WM',  x: 55, y: 72 },
  { id: 'ST1',  label: 'ST',  type: 'ST',  x: 88, y: 32 },
  { id: 'ST2',  label: 'ST',  type: 'ST',  x: 88, y: 48 },
]

function lastName(name = '') {
  const parts = name.trim().split(' ')
  return parts[parts.length - 1].toUpperCase()
}

function mapCoords(x, y, w, h) {
  return { px: (x / 120) * w, py: (1 - y / 80) * h }
}

/** Score a player for a given slot type. All values normalised against squad max. */
function buildScorer(squad, allStats) {
  const statKeys = [
    'duelsWon', 'tackles', 'interceptions', 'foulsCommitted',
    'progPasses', 'totalPasses', 'passAccuracy', 'completePasses',
    'totalShots', 'totalXG', 'goals', 'matchesPlayed',
    // computed composites
    '_ballRecovery', '_progCarry',
  ]

  // Compute composite stats inline
  const raw = (pid, key) => {
    const s = allStats[pid] ?? {}
    if (key === '_ballRecovery') return (s.tackles ?? 0) + (s.interceptions ?? 0) + (s.clearances ?? 0) + (s.blocks ?? 0)
    if (key === '_progCarry')    return (s.succDribbles ?? 0) + (s.carriesIntoFT ?? 0)
    return s[key] ?? 0
  }

  const maxOf = {}
  for (const key of statKeys) {
    maxOf[key] = Math.max(...squad.map(p => raw(p.player_id, key)), 1)
  }

  const norm = (pid, key) => raw(pid, key) / maxOf[key]

  const scorers = {
    CB:  (pid) => norm(pid,'duelsWon')*0.25 + norm(pid,'tackles')*0.20 + norm(pid,'interceptions')*0.20 + norm(pid,'_ballRecovery')*0.20 + (1 - norm(pid,'foulsCommitted'))*0.15,
    FB:  (pid) => norm(pid,'_progCarry')*0.25 + norm(pid,'totalPasses')*0.15 + norm(pid,'passAccuracy')*0.20 + norm(pid,'_ballRecovery')*0.20 + norm(pid,'duelsWon')*0.20,
    CDM: (pid) => norm(pid,'interceptions')*0.20 + norm(pid,'tackles')*0.20 + norm(pid,'_ballRecovery')*0.20 + norm(pid,'passAccuracy')*0.15 + norm(pid,'progPasses')*0.15 + norm(pid,'duelsWon')*0.10,
    WM:  (pid) => norm(pid,'_progCarry')*0.25 + norm(pid,'progPasses')*0.20 + norm(pid,'totalShots')*0.15 + norm(pid,'totalXG')*0.15 + norm(pid,'totalPasses')*0.15 + norm(pid,'passAccuracy')*0.10,
    ST:  (pid) => norm(pid,'goals')*0.35 + norm(pid,'totalShots')*0.25 + norm(pid,'totalXG')*0.25 + norm(pid,'duelsWon')*0.10 + norm(pid,'_ballRecovery')*0.05,
  }

  return { scorers, norm, raw }
}

function computeLineup(lineups, allStats) {
  // Only players with event data, sorted by matchesPlayed desc
  const squad = lineups
    .filter(l => allStats[l.player_id])
    .sort((a, b) => (allStats[b.player_id]?.matchesPlayed ?? 0) - (allStats[a.player_id]?.matchesPlayed ?? 0))

  if (squad.length < 10) return null

  const { scorers, norm, raw } = buildScorer(squad, allStats)

  // Build all (score, pid, slotId) triples
  const triples = []
  for (const slot of SLOTS) {
    const scorer = scorers[slot.type]
    for (const p of squad) {
      triples.push({ score: scorer(p.player_id), pid: p.player_id, slotId: slot.id, slotType: slot.type })
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
    if (Object.keys(lineup).length === 10) break
  }

  // Substitutes — remaining players scored by overall contribution
  const subs = squad
    .filter(p => !usedPlayers.has(p.player_id))
    .map(p => {
      const s = allStats[p.player_id] ?? {}
      const overall =
        norm(p.player_id,'goals')*0.15 + norm(p.player_id,'totalShots')*0.1 +
        norm(p.player_id,'duelsWon')*0.15 + norm(p.player_id,'_ballRecovery')*0.15 +
        norm(p.player_id,'progPasses')*0.1 + norm(p.player_id,'passAccuracy')*0.1 +
        norm(p.player_id,'_progCarry')*0.15 + norm(p.player_id,'interceptions')*0.1
      return { player: p, overall, s }
    })
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 3)

  return { lineup, subs, squad }
}

// Fitness flag: score below this relative threshold is a "poor fit"
const POOR_FIT_THRESHOLD = 0.35

function PitchCanvas({ lineup, lineups }) {
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
      drawPitch(ctx, w, h)

      const r      = Math.max(8, Math.min(16, w / 50))
      const fsName = Math.max(6, Math.min(9, w / 70))
      const fsPos  = Math.max(5, Math.min(8, w / 80))

      for (const slot of SLOTS) {
        const entry = lineup[slot.id]
        if (!entry) continue
        const { px, py } = mapCoords(slot.x, slot.y, w, h)
        const isPoorFit  = entry.score < POOR_FIT_THRESHOLD

        // Circle
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
        ctx.fillText(lastName(entry.player?.player?.player_name ?? ''), px, py + r + 2)
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

export default function LineupSuggestion({ lineups, allStats }) {
  const result = useMemo(() => computeLineup(lineups, allStats), [lineups, allStats])

  if (!result) return (
    <div style={{ padding: 24, fontFamily: FONT, fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
      Not enough players with data to suggest a lineup.
    </div>
  )

  const { lineup, subs } = result

  // Build justification rows
  const rows = SLOTS.map(slot => {
    const entry = lineup[slot.id]
    if (!entry) return null
    const s      = allStats[entry.pid] ?? {}
    const isPoor = entry.score < POOR_FIT_THRESHOLD
    const name   = entry.player?.player?.player_name ?? 'Unknown'
    const jersey = entry.player?.jersey_no ?? '?'

    // One-line justification per position type
    const justifications = {
      CB:  `${(s.duelsWon??0)} duels won · ${(s.tackles??0)} tackles · ${(s.interceptions??0)} interceptions`,
      FB:  `${(s.succDribbles??0)+(s.carriesIntoFT??0)} prog carries · ${(s.passAccuracy??0)}% pass accuracy · ${(s.duelsWon??0)} duels won`,
      CDM: `${(s.interceptions??0)} interceptions · ${(s.tackles??0)} tackles · ${(s.passAccuracy??0)}% pass accuracy`,
      WM:  `${(s.succDribbles??0)+(s.carriesIntoFT??0)} prog carries · ${(s.progPasses??0)} prog passes · ${(s.totalShots??0)} shots`,
      ST:  `${(s.goals??0)} goals · ${(s.totalShots??0)} shots · ${+(s.totalXG??0).toFixed(2)} xG`,
    }

    return { slot, entry, name, jersey, isPoor, justification: justifications[slot.type] }
  }).filter(Boolean)

  // Tactical note
  const starters     = SLOTS.map(s => lineup[s.id]).filter(Boolean)
  const avgDefense   = starters.filter(e => ['CB','FB'].includes(e.slotType))
    .reduce((a,e) => a + (allStats[e.pid]?.duelsWon??0), 0) / 4
  const avgMidPass   = starters.filter(e => ['CDM','WM'].includes(e.slotType))
    .reduce((a,e) => a + (allStats[e.pid]?.passAccuracy??0), 0) / 4
  const fwdGoals     = starters.filter(e => e.slotType === 'ST')
    .reduce((a,e) => a + (allStats[e.pid]?.goals??0), 0)

  const tacticalNote = `The team's defensive shape looks ${avgDefense >= 3 ? 'strong' : 'moderate'} with an average of ${avgDefense.toFixed(1)} duels won per defensive player. Midfield passing quality sits at ${avgMidPass.toFixed(0)}% accuracy across the four midfielders. The two strikers combine for ${fwdGoals} goal${fwdGoals !== 1 ? 's' : ''} — ${fwdGoals >= 2 ? 'showing a promising attacking threat' : 'so adding a creative midfielder or target man could improve output'}.`

  const posColors = { CB: '#0077B6', FB: '#00B4D8', CDM: '#023E8A', WM: '#48CAE4', ST: '#D90429' }

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Header */}
      <div style={{ background: '#000', color: '#FFD166', padding: '8px 16px', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
        Suggested Starting XI — 4-4-2 (CDM)
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        {/* Pitch */}
        <div style={{ flex: '0 0 55%', borderRight: '2px solid #000' }}>
          <PitchCanvas lineup={lineup} lineups={lineups} />
          <div style={{ padding: '6px 12px', background: '#f7f7f7', borderTop: '1px solid #ddd', fontSize: 8, color: '#666', fontFamily: FONT, letterSpacing: 1, textTransform: 'uppercase' }}>
            <span style={{ color: '#0077B6', fontWeight: 700 }}>●</span> Best fit &nbsp;
            <span style={{ color: '#D90429', fontWeight: 700 }}>●</span> Poor fit (flagged)
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Player list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {rows.map(({ slot, entry, name, jersey, isPoor, justification }) => (
              <div key={slot.id} style={{ borderBottom: '1px solid #eee', padding: '7px 12px', display: 'flex', gap: 8, alignItems: 'flex-start', background: isPoor ? '#fff5f5' : '#fff' }}>
                {/* Position badge */}
                <div style={{ minWidth: 38, background: posColors[slot.type] ?? '#333', color: '#fff', fontSize: 8, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 4px', textAlign: 'center', flexShrink: 0, marginTop: 1 }}>
                  {slot.label}
                </div>
                {/* Player info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#000' }}>
                    <span style={{ opacity: 0.5, marginRight: 5, fontSize: 9 }}>#{jersey}</span>
                    {name}
                    {isPoor && <span style={{ marginLeft: 6, fontSize: 7, background: '#D90429', color: '#fff', padding: '1px 4px', fontWeight: 700, letterSpacing: 1 }}>POOR FIT</span>}
                  </div>
                  <div style={{ fontSize: 8, color: '#666', marginTop: 2, letterSpacing: 0.3 }}>{justification}</div>
                </div>
                {/* Score */}
                <div style={{ fontSize: 9, fontWeight: 700, color: isPoor ? '#D90429' : '#0077B6', flexShrink: 0 }}>
                  {(entry.score * 100).toFixed(0)}
                </div>
              </div>
            ))}
          </div>

          {/* Tactical note */}
          <div style={{ borderTop: '2px solid #000', padding: '10px 12px', background: '#111', color: '#ccc', fontSize: 9, lineHeight: 1.6, letterSpacing: 0.3 }}>
            <div style={{ color: '#FFD166', fontWeight: 700, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Tactical Note</div>
            {tacticalNote}
          </div>

          {/* Substitutes */}
          {subs.length > 0 && (
            <div style={{ borderTop: '2px solid #000' }}>
              <div style={{ background: '#222', color: '#FFD166', padding: '4px 12px', fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                Suggested Subs
              </div>
              {subs.map(({ player, s }) => {
                const name = player.player?.player_name ?? 'Unknown'
                const jersey = player.jersey_no ?? '?'
                return (
                  <div key={player.player_id} style={{ borderBottom: '1px solid #eee', padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center', background: '#fff' }}>
                    <span style={{ fontSize: 9, opacity: 0.5, minWidth: 20 }}>#{jersey}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>{name}</span>
                    <span style={{ fontSize: 8, color: '#666' }}>
                      {(s.goals??0)}G · {(s.totalShots??0)} shots · {(s.duelsWon??0)} duels
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
