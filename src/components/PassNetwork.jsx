/**
 * PassNetwork — Team-wide pass network drawn on a canvas pitch.
 *
 * Edges  = lines between player pairs; thickness = number of passes between them.
 * Nodes  = each player's average position; radius = pass success rate (0–100%).
 * Only edges with ≥ 2 passes are drawn.
 */
import { useRef, useLayoutEffect, useState } from 'react'
import { drawPitch } from '../utils/pitchRenderer.js'

const ASPECT = 105 / 68

function mapXY(x, y, w, h) {
  return { px: (x / 120) * w, py: (y / 80) * h }
}

function lastName(name = '') {
  const parts = name.trim().split(' ')
  return parts[parts.length - 1].toUpperCase()
}

// Map success rate [0,1] to a color between red and green via yellow
function rateColor(rate) {
  // rate 0 → red, 0.5 → yellow, 1 → green
  if (rate >= 0.5) {
    const t = (rate - 0.5) * 2          // 0→1 from yellow to green
    const r = Math.round(255 * (1 - t))
    return `rgb(${r},200,50)`
  } else {
    const t = rate * 2                   // 0→1 from red to yellow
    const g = Math.round(200 * t)
    return `rgb(220,${g},30)`
  }
}

// Infer receiver: earliest teammate event whose start_x/y is within 10 units
// of the pass end_x/y and within 8 seconds after the pass.
function inferReceiverId(pass, allTeamEvents) {
  if (pass.end_x == null || pass.end_y == null) return null
  const T  = pass.match_time_seconds ?? 0
  const ex = pass.end_x
  const ey = pass.end_y
  for (const ev of allTeamEvents) {
    if (ev.player_id === pass.player_id) continue
    const t = ev.match_time_seconds ?? 0
    if (t < T || t > T + 8) continue
    if (Math.abs((ev.start_x ?? 0) - ex) < 10 && Math.abs((ev.start_y ?? 0) - ey) < 10) {
      return ev.player_id
    }
  }
  return null
}

export default function PassNetwork({ allStats, lineups }) {
  const containerRef = useRef(null)
  const canvasRef    = useRef(null)
  const [filter, setFilter] = useState('starting11') // 'starting11' | 'all'

  // Derive the set of player IDs to show based on filter
  const visiblePlayerIds = new Set(
    lineups
      .filter(l => filter === 'all' || l.starting_xi)
      .map(l => l.player_id)
      .filter(Boolean)
  )

  useLayoutEffect(() => {
    const container = containerRef.current
    const canvas    = canvasRef.current
    if (!container || !canvas) return

    function draw(w, h) {
      const dpr = window.devicePixelRatio || 1
      canvas.width        = w * dpr
      canvas.height       = h * dpr
      canvas.style.width  = `${w}px`
      canvas.style.height = `${h}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)

      drawPitch(ctx, w, h)

      // ── Flatten all team events sorted by time (for receiver inference) ─
      const allTeamEvents = Object.entries(allStats ?? {})
        .flatMap(([pid, s]) => (s.allEvents ?? []).map(e => ({ ...e, player_id: e.player_id ?? pid })))
        .sort((a, b) => (a.match_time_seconds ?? 0) - (b.match_time_seconds ?? 0))

      // ── Build nodes & edges ────────────────────────────────────────────
      const nodes = {}   // pid → { x, y, total, successful, successRate, name, jersey }
      const edges = {}   // "pidA|pidB" → pass count

      for (const [pid, stats] of Object.entries(allStats ?? {})) {
        if (!visiblePlayerIds.has(pid)) continue
        const passes = stats.passEvents ?? []
        if (passes.length === 0) continue

        const valid = passes.filter(e => e.start_x != null && e.start_y != null)
        if (valid.length === 0) continue

        const avgX = valid.reduce((s, e) => s + e.start_x, 0) / valid.length
        const avgY = valid.reduce((s, e) => s + e.start_y, 0) / valid.length

        const SUCCESS = ['Successful', 'Key Pass', 'Assist']
        const successful = passes.filter(e => SUCCESS.includes(e.outcome)).length
        const successRate = passes.length > 0 ? successful / passes.length : 0

        const lineup = lineups.find(l => l.player_id === pid)
        const name   = lineup?.player?.player_name ?? lineup?.player_name ?? `#${lineup?.jersey_no ?? '?'}`
        const jersey = lineup?.jersey_no ?? ''

        nodes[pid] = { x: avgX, y: avgY, total: passes.length, successful, successRate, name, jersey }

        // Build edges: use DB receiver fields first, fall back to spatial inference
        for (const pass of passes) {
          const rid =
            pass.receiver_player_id ??
            pass.secondary_player_id ??
            inferReceiverId(pass, allTeamEvents)
          if (!rid || rid === pid) continue
          if (!visiblePlayerIds.has(rid)) continue   // only connect visible players
          const key = [pid, rid].sort().join('|')
          edges[key] = (edges[key] ?? 0) + 1
        }
      }

      const nodeList = Object.entries(nodes)
      if (nodeList.length === 0) return

      const maxEdge = Math.max(...Object.values(edges), 1)

      // ── Draw edges — thickness = pass count ───────────────────────────
      for (const [key, count] of Object.entries(edges)) {
        if (count < 2) continue
        const [idA, idB] = key.split('|')
        const nA = nodes[idA]
        const nB = nodes[idB]
        if (!nA || !nB) continue

        const { px: ax, py: ay } = mapXY(nA.x, nA.y, w, h)
        const { px: bx, py: by } = mapXY(nB.x, nB.y, w, h)

        const alpha = 0.25 + (count / maxEdge) * 0.65
        const lineW = 1   + (count / maxEdge) * 7

        ctx.save()
        ctx.globalAlpha = alpha
        ctx.strokeStyle = '#0077B6'
        ctx.lineWidth   = lineW
        ctx.lineCap     = 'round'
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
        ctx.restore()

        // Pass count label at midpoint
        const mx = (ax + bx) / 2
        const my = (ay + by) / 2
        ctx.save()
        ctx.globalAlpha    = 0.9
        ctx.fillStyle      = '#fff'
        ctx.font           = `bold ${Math.max(7, Math.min(10, w / 90))}px monospace`
        ctx.textAlign      = 'center'
        ctx.textBaseline   = 'middle'
        // small background pill
        const label = String(count)
        const tw    = ctx.measureText(label).width + 4
        ctx.fillRect(mx - tw / 2, my - 6, tw, 12)
        ctx.fillStyle = '#0077B6'
        ctx.fillText(label, mx, my)
        ctx.restore()
      }

      // ── Draw nodes — size = success rate ──────────────────────────────
      // Min radius 8px, max radius 20px, scaled by success rate
      const MIN_R = 8
      const MAX_R = 20

      for (const [, node] of nodeList) {
        const { px, py } = mapXY(node.x, node.y, w, h)
        const r = MIN_R + node.successRate * (MAX_R - MIN_R)
        const color = rateColor(node.successRate)

        // Filled circle — color = success rate
        ctx.save()
        ctx.fillStyle   = color
        ctx.strokeStyle = '#000'
        ctx.lineWidth   = 1.5
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.restore()

        // Jersey number inside
        ctx.save()
        ctx.fillStyle    = '#fff'
        ctx.font         = `bold ${Math.max(7, Math.round(r * 0.85))}px monospace`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(node.jersey), px, py)
        ctx.restore()

        // Last name below
        const labelSize = Math.max(7, Math.min(10, w / 85))
        ctx.save()
        ctx.fillStyle    = '#111'
        ctx.font         = `bold ${labelSize}px monospace`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(lastName(node.name), px, py + r + 2)
        ctx.restore()

        // Success % below name
        ctx.save()
        ctx.fillStyle    = '#444'
        ctx.font         = `${Math.max(6, labelSize - 1)}px monospace`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(`${Math.round(node.successRate * 100)}%`, px, py + r + 2 + labelSize + 2)
        ctx.restore()
      }

      // ── Legend ─────────────────────────────────────────────────────────
      const leg = { x: 6, y: h - 36, lineH: 13 }
      const fs  = Math.max(7, Math.min(9, w / 100))

      // Edge thickness legend
      ctx.save()
      ctx.strokeStyle = '#0077B6'
      ctx.lineCap     = 'round'
      ctx.lineWidth   = 1; ctx.globalAlpha = 0.6
      ctx.beginPath(); ctx.moveTo(leg.x, leg.y); ctx.lineTo(leg.x + 18, leg.y); ctx.stroke()
      ctx.lineWidth   = 4; ctx.globalAlpha = 0.9
      ctx.beginPath(); ctx.moveTo(leg.x, leg.y + leg.lineH); ctx.lineTo(leg.x + 18, leg.y + leg.lineH); ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle   = '#111'
      ctx.font        = `${fs}px monospace`
      ctx.textBaseline = 'middle'
      ctx.fillText('Few passes', leg.x + 22, leg.y)
      ctx.fillText('Many passes', leg.x + 22, leg.y + leg.lineH)
      ctx.restore()

      // Node color legend (right side)
      const rx = w - 70
      const ry = h - 38
      ;[
        { rate: 1,   label: 'High accuracy' },
        { rate: 0.5, label: 'Mid accuracy' },
        { rate: 0,   label: 'Low accuracy' },
      ].forEach(({ rate, label }, i) => {
        ctx.save()
        ctx.fillStyle   = rateColor(rate)
        ctx.strokeStyle = '#000'
        ctx.lineWidth   = 1
        ctx.beginPath()
        ctx.arc(rx, ry + i * 13, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle    = '#111'
        ctx.font         = `${fs}px monospace`
        ctx.textAlign    = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, rx + 9, ry + i * 13)
        ctx.restore()
      })
    }

    const initW = container.offsetWidth || container.getBoundingClientRect().width
    if (initW > 0) draw(initW, initW / ASPECT)

    const observer = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      if (w > 0) draw(w, w / ASPECT)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [allStats, lineups, visiblePlayerIds])

  const btnBase = {
    padding: '4px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
    textTransform: 'uppercase', fontFamily: 'monospace', cursor: 'pointer',
    border: '2px solid #000', background: '#fff', color: '#000',
  }
  const btnActive = { ...btnBase, background: '#000', color: '#FFD166' }

  return (
    <div style={{ width: '100%' }}>
      {/* Toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {[
          { key: 'starting11', label: 'Starting 11' },
          { key: 'all',        label: 'All Players'  },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={filter === key ? btnActive : btnBase}
          >
            {label}
          </button>
        ))}
      </div>

      <div ref={containerRef} style={{ width: '100%' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
    </div>
  )
}
