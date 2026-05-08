/**
 * AveragePitchLocations — 2x2 grid of pitch canvases showing average positions
 * for different action types per player.
 */
import { useRef, useLayoutEffect } from 'react'
import { drawPitch } from '../utils/pitchRenderer.js'

const ASPECT = 105 / 68
const COLOR  = '#0077B6'

const PASS_ACTIONS     = ['Pass', 'Through Ball']
const DEF_ACTIONS      = ['Standing Tackle', 'Sliding Tackle', 'Pass Intercept', 'Pressure', 'Block', 'Clearance']

function mapCoords(x, y, w, h) {
  return { px: (x / 120) * w, py: (1 - y / 80) * h }
}

function lastName(fullName = '') {
  const parts = fullName.trim().split(' ')
  return parts[parts.length - 1].toUpperCase()
}

function buildPlayerAvgPositions(allStats, lineups, filterFn, xKey = 'start_x', yKey = 'start_y') {
  const result = []
  for (const [pid, stats] of Object.entries(allStats ?? {})) {
    const events = (stats.allEvents ?? []).filter(filterFn)
    if (events.length < 2) continue

    const xs = events.map(e => e[xKey]).filter(v => v != null)
    const ys = events.map(e => e[yKey]).filter(v => v != null)
    if (xs.length < 2) continue

    const avgX = xs.reduce((s, v) => s + v, 0) / xs.length
    const avgY = ys.reduce((s, v) => s + v, 0) / ys.length

    const lineup = lineups.find(l => l.player_id === pid)
    const name   = lineup?.player?.player_name ?? 'Unknown'
    const jersey = lineup?.jersey_no ?? '?'

    result.push({ pid, avgX, avgY, name, jersey, count: xs.length })
  }
  return result
}

function PitchCanvas({ allStats, lineups, title, filterFn, xKey = 'start_x', yKey = 'start_y' }) {
  const containerRef = useRef(null)
  const canvasRef    = useRef(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const canvas    = canvasRef.current
    if (!container || !canvas) return

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

      const players = buildPlayerAvgPositions(allStats, lineups, filterFn, xKey, yKey)

      const fontSize = Math.max(6, Math.min(9, w / 60))

      for (const p of players) {
        const { px, py } = mapCoords(p.avgX, p.avgY, w, h)
        const r = Math.max(6, Math.min(12, w / 55))

        // Circle
        ctx.save()
        ctx.fillStyle   = COLOR
        ctx.strokeStyle = '#fff'
        ctx.lineWidth   = 1.5
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.restore()

        // Jersey number inside
        ctx.save()
        ctx.fillStyle    = '#fff'
        ctx.font         = `bold ${Math.max(5, r * 0.9)}px var(--font)`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(p.jersey), px, py)
        ctx.restore()

        // Last name below
        ctx.save()
        ctx.fillStyle    = '#111'
        ctx.font         = `bold ${fontSize}px var(--font)`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(lastName(p.name), px, py + r + 2)
        ctx.restore()
      }
    }

    const initW = container.offsetWidth || container.getBoundingClientRect().width
    draw(initW)

    const observer = new ResizeObserver(([entry]) => draw(entry.contentRect.width))
    observer.observe(container)
    return () => observer.disconnect()
  }, [allStats, lineups, filterFn, xKey, yKey])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '2px solid #000' }}>
      <div style={{
        background: '#000', color: '#FFD166',
        padding: '4px 10px', fontSize: 9, fontWeight: 700,
        letterSpacing: 2, textTransform: 'uppercase',
        fontFamily: 'var(--font)',
      }}>
        {title}
      </div>
      <div ref={containerRef} style={{ width: '100%' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
    </div>
  )
}

export default function AveragePitchLocations({ allStats, lineups }) {
  const views = [
    {
      title: 'Avg Passing Location',
      filterFn: e => PASS_ACTIONS.includes(e.action),
      xKey: 'start_x', yKey: 'start_y',
    },
    {
      title: 'Avg Receiving Position',
      filterFn: e => PASS_ACTIONS.includes(e.action) && e.end_x != null,
      xKey: 'end_x', yKey: 'end_y',
    },
    {
      title: 'Avg Defensive Position',
      filterFn: e => DEF_ACTIONS.includes(e.action),
      xKey: 'start_x', yKey: 'start_y',
    },
    {
      title: 'Avg Shooting Location',
      filterFn: e => e.action === 'Shoot',
      xKey: 'start_x', yKey: 'start_y',
    },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      padding: 16,
    }}>
      {views.map(v => (
        <PitchCanvas
          key={v.title}
          allStats={allStats}
          lineups={lineups}
          title={v.title}
          filterFn={v.filterFn}
          xKey={v.xKey}
          yKey={v.yKey}
        />
      ))}
    </div>
  )
}
