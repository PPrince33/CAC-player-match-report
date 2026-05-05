/**
 * FutsalDistributionPitch — Canvas pitch component for event scatter telemetry.
 *
 * Plots each event as a line with arrowhead (when end coords exist) or a circle
 * (when end coords are null). Color is determined by outcome.
 *
 * Props:
 *   events     {MatchEvent[]}          — array of event objects from Supabase
 *   pitchMode  {'standard'|'futsal'}   — controls pitch dimensions and aspect ratio
 *   teamColor  {string}                — team accent color (unused for line color, kept for future use)
 *   playerName {string}                — player name shown in tooltip
 */
import { useRef, useEffect, useState } from 'react'
import { drawPitch } from '../utils/pitchRenderer.js'
import CanvasTooltip from './CanvasTooltip.jsx'

const SUCCESS_OUTCOMES = ['Successful', 'Key Pass', 'Assist']
const COLOR_SUCCESS = '#06D6A0'
const COLOR_FAIL = '#D90429'

/**
 * Map database coordinates (120×80 space) to canvas pixels.
 */
function mapCoords(x, y, w, h) {
  return {
    px: (x / 120) * w,
    py: (y / 80) * h,
  }
}

/**
 * Draw a filled equilateral-triangle arrowhead at (tipX, tipY) pointing in
 * the direction from (fromX, fromY) to (tipX, tipY). Base width = 6px.
 */
function drawArrowhead(ctx, fromX, fromY, tipX, tipY) {
  const angle = Math.atan2(tipY - fromY, tipX - fromX)
  const baseHalf = 3 // half of 6px base
  const height = (Math.sqrt(3) / 2) * 6 // equilateral triangle height for base=6

  // Tip of the triangle
  const tx = tipX
  const ty = tipY

  // Base midpoint (behind the tip)
  const bx = tipX - height * Math.cos(angle)
  const by = tipY - height * Math.sin(angle)

  // Two base corners (perpendicular to direction)
  const perpAngle = angle + Math.PI / 2
  const b1x = bx + baseHalf * Math.cos(perpAngle)
  const b1y = by + baseHalf * Math.sin(perpAngle)
  const b2x = bx - baseHalf * Math.cos(perpAngle)
  const b2y = by - baseHalf * Math.sin(perpAngle)

  ctx.beginPath()
  ctx.moveTo(tx, ty)
  ctx.lineTo(b1x, b1y)
  ctx.lineTo(b2x, b2y)
  ctx.closePath()
  ctx.fill()
}

export default function FutsalDistributionPitch({ events = [], pitchMode = 'standard', teamColor, playerName }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const hitRegionsRef = useRef([])

  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    fields: [],
  })

  // Store latest draw dimensions for hit-testing coordinate mapping
  const drawDimsRef = useRef({ w: 0, h: 0 })

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    function draw(ctx, w, h) {
      drawDimsRef.current = { w, h }
      hitRegionsRef.current = []

      // Draw the pitch background and markings
      drawPitch(ctx, w, h, pitchMode)

      // Overlay events
      if (!events || events.length === 0) return

      events.forEach((event) => {
        const isSuccess = SUCCESS_OUTCOMES.includes(event.outcome)
        const color = isSuccess ? COLOR_SUCCESS : COLOR_FAIL

        const { px: sx, py: sy } = mapCoords(event.start_x, event.start_y, w, h)

        const hasEnd = event.end_x != null && event.end_y != null

        if (hasEnd) {
          const { px: ex, py: ey } = mapCoords(event.end_x, event.end_y, w, h)

          ctx.save()
          ctx.globalAlpha = isSuccess ? 1.0 : 0.5
          ctx.strokeStyle = color
          ctx.fillStyle = color
          ctx.lineWidth = 1.5

          // Draw line
          ctx.beginPath()
          ctx.moveTo(sx, sy)
          ctx.lineTo(ex, ey)
          ctx.stroke()

          // Draw arrowhead at end point
          drawArrowhead(ctx, sx, sy, ex, ey)

          ctx.restore()

          // Hit region: midpoint of the line for proximity testing
          const midX = (sx + ex) / 2
          const midY = (sy + ey) / 2
          hitRegionsRef.current.push({ cx: midX, cy: midY, eventData: event })
          // Also register the end point for arrowhead hits
          hitRegionsRef.current.push({ cx: ex, cy: ey, eventData: event })
        } else {
          // No end coords — draw circle only
          ctx.save()
          ctx.globalAlpha = isSuccess ? 1.0 : 0.5
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(sx, sy, 4, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()

          hitRegionsRef.current.push({ cx: sx, cy: sy, eventData: event })
        }
      })
    }

    const observer = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      if (w === 0) return

      const aspectRatio = pitchMode === 'futsal' ? 40 / 20 : 105 / 68
      const h = w / aspectRatio
      const dpr = window.devicePixelRatio || 1

      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      draw(ctx, w, h)
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [pitchMode, events])

  function handleMouseMove(e) {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const regions = hitRegionsRef.current
    let nearest = null
    let nearestDist = Infinity

    for (const region of regions) {
      const dx = region.cx - mouseX
      const dy = region.cy - mouseY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = region
      }
    }

    if (nearest && nearestDist <= 8) {
      const ev = nearest.eventData
      const minutes = ev.match_time_seconds != null
        ? Math.floor(ev.match_time_seconds / 60) + "'"
        : 'N/A'

      setTooltip({
        visible: true,
        x: mouseX,
        y: mouseY,
        fields: [
          { label: 'ACTION', value: ev.action ?? 'N/A' },
          { label: 'TIME', value: minutes },
          { label: 'OUTCOME', value: ev.outcome ?? 'N/A' },
          { label: 'PLAYER', value: playerName ?? ev.player_name ?? 'N/A' },
        ],
      })
    } else {
      setTooltip((prev) => ({ ...prev, visible: false }))
    }
  }

  function handleMouseLeave() {
    setTooltip((prev) => ({ ...prev, visible: false }))
  }

  // Measure container width for tooltip overflow detection
  const containerWidth = containerRef.current?.offsetWidth ?? 0

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      <CanvasTooltip
        visible={tooltip.visible}
        x={tooltip.x}
        y={tooltip.y}
        fields={tooltip.fields}
        containerWidth={containerWidth}
      />
    </div>
  )
}
