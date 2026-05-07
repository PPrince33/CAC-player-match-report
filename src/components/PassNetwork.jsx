/**
 * PassNetwork — Team-wide pass network drawn on a canvas pitch.
 *
 * Nodes = average position of each player (sized by pass count).
 * Edges = passes between pairs of players (thickness = frequency).
 * Only shows pairs with ≥ 2 passes between them.
 */
import { useRef, useEffect } from 'react'
import { drawPitch } from '../utils/pitchRenderer.js'

function mapXY(x, y, w, h) {
  return { px: (x / 120) * w, py: (y / 80) * h }
}

function lastName(name = '') {
  const parts = name.trim().split(' ')
  return parts[parts.length - 1].toUpperCase()
}

export default function PassNetwork({ allStats, lineups }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    function draw(w, h) {
      const dpr = window.devicePixelRatio || 1
      canvas.width  = w * dpr
      canvas.height = h * dpr
      canvas.style.width  = `${w}px`
      canvas.style.height = `${h}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)

      // ── Draw pitch ─────────────────────────────────────────────────────
      drawPitch(ctx, w, h, 'standard')

      // ── Build player node data ─────────────────────────────────────────
      // For each player with data: compute avg start position and pass count
      const nodes = {}          // player_id → { x, y, count, name, jersey }
      const edges = {}          // `idA-idB` → count (idA < idB lexicographically)

      for (const [pid, stats] of Object.entries(allStats ?? {})) {
        const passes = stats.passEvents ?? []
        if (passes.length === 0) continue

        const validPasses = passes.filter(e => e.start_x != null && e.start_y != null)
        if (validPasses.length === 0) continue

        const avgX = validPasses.reduce((s, e) => s + e.start_x, 0) / validPasses.length
        const avgY = validPasses.reduce((s, e) => s + e.start_y, 0) / validPasses.length

        const lineup = lineups.find(l => l.player_id === pid)
        const name   = lineup?.player?.player_name ?? lineup?.player_name ?? `#${lineup?.jersey_no ?? '?'}`
        const jersey = lineup?.jersey_no ?? ''

        nodes[pid] = { x: avgX, y: avgY, count: validPasses.length, name, jersey }

        // Build edges using receiver inference
        for (const pass of passes) {
          const rid =
            pass.receiver_player_id ??
            pass.secondary_player_id ??
            null
          if (!rid || rid === pid) continue

          const key = [pid, rid].sort().join('|')
          edges[key] = (edges[key] ?? 0) + 1
        }
      }

      const nodeList  = Object.entries(nodes)   // [[pid, data], ...]
      const maxCount  = Math.max(...nodeList.map(([, n]) => n.count), 1)
      const maxEdge   = Math.max(...Object.values(edges), 1)

      // ── Draw edges ─────────────────────────────────────────────────────
      for (const [key, count] of Object.entries(edges)) {
        if (count < 2) continue   // filter noise
        const [idA, idB] = key.split('|')
        const nA = nodes[idA]
        const nB = nodes[idB]
        if (!nA || !nB) continue

        const { px: ax, py: ay } = mapXY(nA.x, nA.y, w, h)
        const { px: bx, py: by } = mapXY(nB.x, nB.y, w, h)

        const alpha    = 0.15 + (count / maxEdge) * 0.6
        const lineW    = 1 + (count / maxEdge) * 5

        ctx.save()
        ctx.globalAlpha = alpha
        ctx.strokeStyle = '#0077B6'
        ctx.lineWidth   = lineW
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
        ctx.restore()
      }

      // ── Draw nodes ─────────────────────────────────────────────────────
      for (const [, node] of nodeList) {
        const { px, py } = mapXY(node.x, node.y, w, h)
        const r = 6 + (node.count / maxCount) * 10

        // Circle
        ctx.save()
        ctx.fillStyle   = '#0077B6'
        ctx.strokeStyle = '#000'
        ctx.lineWidth   = 1.5
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.restore()

        // Jersey number inside circle
        ctx.save()
        ctx.fillStyle    = '#fff'
        ctx.font         = `bold ${Math.max(7, Math.round(r * 0.9))}px monospace`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(node.jersey), px, py)
        ctx.restore()

        // Last name label below
        ctx.save()
        ctx.fillStyle    = '#000'
        ctx.font         = `bold ${Math.max(7, Math.min(10, w / 80))}px monospace`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(lastName(node.name), px, py + r + 2)
        ctx.restore()
      }
    }

    const observer = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      if (w === 0) return
      const h = w / (105 / 68)
      draw(w, h)
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [allStats, lineups])

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  )
}
