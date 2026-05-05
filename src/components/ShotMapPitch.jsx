/**
 * ShotMapPitch — Canvas pitch component for shot map visualisation.
 *
 * Crops to the attacking half of the pitch and plots each shot as a circle
 * whose radius is proportional to xG. Goal shots are fully opaque with a 'G'
 * label; non-goal shots are semi-transparent.
 *
 * Props:
 *   shots     {ShotEvent[]}           — array of shot events:
 *               { start_x, start_y, xg, outcome, player_name, match_time_seconds }
 *   pitchMode {'standard'|'futsal'}   — controls pitch dimensions and aspect ratio
 */
import { useRef, useEffect, useState } from 'react'
import { drawPitch, PITCH_DIMS } from '../utils/pitchRenderer.js'
import CanvasTooltip from './CanvasTooltip.jsx'

const SHOT_COLOR = '#0077B6'
const HIT_RADIUS = 8

/**
 * Map database coordinates (120×80 space) to canvas pixels.
 * The canvas represents only the attacking half, so we apply an x-offset
 * equal to the half-pitch width in pixels.
 *
 * @param {number} x         - database x (0–120)
 * @param {number} y         - database y (0–80)
 * @param {number} w         - canvas logical width (= half-pitch width in px)
 * @param {number} h         - canvas logical height
 * @param {number} halfWidth - half-pitch width in pitch metres (52.5 or 20)
 * @param {'standard'|'futsal'} mode
 */
function mapCoords(x, y, w, h, halfWidth, mode) {
  const dims = PITCH_DIMS[mode] ?? PITCH_DIMS.standard
  const { W, H } = dims
  // Full-pitch scale factors
  const scaleX = w / halfWidth   // canvas width covers only the half-pitch
  const scaleY = h / H

  // Database coords are 0–120 (standard) or 0–40 (futsal) mapped to pitch metres
  // by the ratio (pitchW / 120) and (pitchH / 80)
  const pitchX = (x / 120) * W
  const pitchY = (y / 80) * H

  // Offset: subtract the left edge of the attacking half
  const offsetX = halfWidth  // left edge of attacking half in pitch metres
  return {
    px: (pitchX - offsetX) * scaleX,
    py: pitchY * scaleY,
  }
}

/**
 * Compute shot circle radius from xG value.
 * r = 4 + (xg / maxXG) * 14, clamped to [4, 18].
 * When maxXG === 0, returns 4.
 */
function shotRadius(xg, maxXG) {
  if (!maxXG || maxXG === 0) return 4
  const r = 4 + (xg / maxXG) * 14
  return Math.min(18, Math.max(4, r))
}

export default function ShotMapPitch({ shots = [], pitchMode = 'standard' }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const hitRegionsRef = useRef([])

  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    fields: [],
  })

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    function draw(ctx, w, h) {
      hitRegionsRef.current = []

      const dims = PITCH_DIMS[pitchMode] ?? PITCH_DIMS.standard
      const { W, H } = dims

      // Half-pitch offset in pitch metres
      const halfWidth = pitchMode === 'futsal' ? 20 : 52.5

      // Scale factors for the full pitch drawn onto a half-pitch canvas
      // The canvas is sized to the half-pitch aspect ratio, so:
      //   canvas width  = halfWidth metres
      //   canvas height = H metres
      const scaleX = w / halfWidth
      const scaleY = h / H

      // Draw the full pitch translated so only the attacking half is visible.
      // We save/restore around the translation so subsequent drawing is unaffected.
      ctx.save()
      // Translate left by the half-pitch width in pixels so the right half
      // of the full pitch aligns with the canvas origin.
      ctx.translate(-halfWidth * scaleX, 0)
      // drawPitch expects (ctx, fullPitchWidth, fullPitchHeight, mode)
      drawPitch(ctx, W * scaleX, H * scaleY, pitchMode)
      ctx.restore()

      if (!shots || shots.length === 0) return

      const maxXG = Math.max(...shots.map((s) => s.xg ?? 0))

      shots.forEach((shot) => {
        const { px: cx, py: cy } = mapCoords(
          shot.start_x,
          shot.start_y,
          w,
          h,
          halfWidth,
          pitchMode
        )

        const r = shotRadius(shot.xg ?? 0, maxXG)
        const isGoal = shot.outcome === 'Goal'

        ctx.save()
        ctx.globalAlpha = isGoal ? 1.0 : 0.66
        ctx.lineWidth = isGoal ? 3 : 1
        ctx.strokeStyle = '#000'
        ctx.fillStyle = SHOT_COLOR

        // Draw filled circle
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        // Draw 'G' label for goals
        if (isGoal) {
          ctx.fillStyle = '#FFFFFF'
          ctx.font = `bold ${Math.max(8, Math.round(r * 0.9))}px monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('G', cx, cy)
        }

        ctx.restore()

        // Register hit region
        hitRegionsRef.current.push({ cx, cy, r, shotData: shot })
      })
    }

    const observer = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      if (w === 0) return

      // Aspect ratio is half the pitch
      const aspectRatio = pitchMode === 'futsal' ? 20 / 20 : 52.5 / 68
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
  }, [pitchMode, shots])

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

    if (nearest && nearestDist <= HIT_RADIUS) {
      const s = nearest.shotData
      const minutes =
        s.match_time_seconds != null
          ? Math.floor(s.match_time_seconds / 60) + "'"
          : 'N/A'

      setTooltip({
        visible: true,
        x: mouseX,
        y: mouseY,
        fields: [
          { label: 'PLAYER', value: s.player_name ?? 'N/A' },
          { label: 'XG', value: (s.xg ?? 0).toFixed(2) },
          { label: 'OUTCOME', value: s.outcome ?? 'N/A' },
          { label: 'MIN', value: minutes },
        ],
      })
    } else {
      setTooltip((prev) => ({ ...prev, visible: false }))
    }
  }

  function handleMouseLeave() {
    setTooltip((prev) => ({ ...prev, visible: false }))
  }

  const containerWidth = containerRef.current?.offsetWidth ?? 0

  return (
    <div style={{ width: '100%' }}>
      {/* Canvas container */}
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

      {/* HTML legend — rendered below canvas, not on canvas */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          padding: '8px 4px 4px',
          fontFamily: 'monospace',
          fontWeight: 700,
          fontSize: '11px',
          textTransform: 'uppercase',
        }}
      >
        {/* Goal indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="18" height="18" aria-hidden="true">
            <circle
              cx="9"
              cy="9"
              r="7"
              fill={SHOT_COLOR}
              stroke="#000"
              strokeWidth="2"
              opacity="1"
            />
            <text
              x="9"
              y="9"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#fff"
              fontSize="8"
              fontWeight="bold"
              fontFamily="monospace"
            >
              G
            </text>
          </svg>
          <span>Goal</span>
        </div>

        {/* Missed / Saved indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="18" height="18" aria-hidden="true">
            <circle
              cx="9"
              cy="9"
              r="7"
              fill={SHOT_COLOR}
              stroke="#000"
              strokeWidth="1"
              opacity="0.66"
            />
          </svg>
          <span>Missed / Saved</span>
        </div>

        {/* Size scale indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="36" height="18" aria-hidden="true">
            {/* Small circle = low xG */}
            <circle cx="5" cy="9" r="4" fill={SHOT_COLOR} opacity="0.66" />
            {/* Large circle = high xG */}
            <circle cx="27" cy="9" r="9" fill={SHOT_COLOR} opacity="0.66" />
          </svg>
          <span>Low → High xG</span>
        </div>
      </div>
    </div>
  )
}
