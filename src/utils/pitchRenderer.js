/**
 * pitchRenderer.js
 * Pure canvas utility for drawing football/futsal pitches.
 * No React dependency — usable in any canvas context.
 */

export const PITCH_DIMS = {
  standard: { W: 105, H: 68 },
  futsal:   { W: 40,  H: 20 },
}

/**
 * Draw a football or futsal pitch onto a 2D canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width  - canvas logical width in pixels
 * @param {number} height - canvas logical height in pixels
 * @param {'standard'|'futsal'} mode
 * @param {boolean} flipX - mirror the pitch horizontally (for R2L teams)
 */
export function drawPitch(ctx, width, height, mode = 'standard', flipX = false) {
  if (!ctx) return

  const dims = PITCH_DIMS[mode] ?? PITCH_DIMS.standard
  const { W, H } = dims
  const scaleX = width / W
  const scaleY = height / H

  // Helper: convert pitch-space metres → canvas pixels
  const px = (x) => x * scaleX
  const py = (y) => y * scaleY

  if (flipX) {
    ctx.save()
    ctx.transform(-1, 0, 0, 1, width, 0)
  }

  // ── Fill pitch ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#4a7c59'
  ctx.fillRect(0, 0, width, height)

  // ── Stroke settings ─────────────────────────────────────────────────────────
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = Math.max(1, width / 400)

  if (mode === 'futsal') {
    drawFutsalMarkings(ctx, px, py)
  } else {
    drawStandardMarkings(ctx, px, py)
  }

  if (flipX) {
    ctx.restore()
  }
}

// ── Standard mode (FIFA 105×68 m) ─────────────────────────────────────────────

function drawStandardMarkings(ctx, px, py) {
  // Outer boundary
  ctx.strokeRect(px(0), py(0), px(105), py(68))

  // Halfway line
  ctx.beginPath()
  ctx.moveTo(px(52.5), py(0))
  ctx.lineTo(px(52.5), py(68))
  ctx.stroke()

  // Centre circle (r = 9.15 m)
  ctx.beginPath()
  ctx.arc(px(52.5), py(34), px(9.15), 0, Math.PI * 2)
  ctx.stroke()

  // Centre spot (filled, r = 0.3 m)
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.arc(px(52.5), py(34), px(0.3), 0, Math.PI * 2)
  ctx.fill()

  // Left penalty area: (0, 13.84) → (16.5, 54.16)
  ctx.strokeRect(px(0), py(13.84), px(16.5), py(40.32))

  // Right penalty area: (88.5, 13.84) → (105, 54.16)
  ctx.strokeRect(px(88.5), py(13.84), px(16.5), py(40.32))

  // Left 6-yard box: (0, 24.84) → (5.5, 43.16)
  ctx.strokeRect(px(0), py(24.84), px(5.5), py(18.32))

  // Right 6-yard box: (99.5, 24.84) → (105, 43.16)
  ctx.strokeRect(px(99.5), py(24.84), px(5.5), py(18.32))

  // Left penalty spot (filled, r = 0.3 m) at (11, 34)
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.arc(px(11), py(34), px(0.3), 0, Math.PI * 2)
  ctx.fill()

  // Right penalty spot (filled, r = 0.3 m) at (94, 34)
  ctx.beginPath()
  ctx.arc(px(94), py(34), px(0.3), 0, Math.PI * 2)
  ctx.fill()

  // Left penalty arc: r = 9.15 m, centred at (11, 34)
  // Only the portion outside the penalty area (x > 16.5)
  // The arc exits the penalty area at x = 16.5.
  // cos(θ) = (16.5 - 11) / 9.15 → θ = acos(5.5/9.15)
  const leftArcAngle = Math.acos(5.5 / 9.15)
  ctx.beginPath()
  ctx.arc(px(11), py(34), px(9.15), -leftArcAngle, leftArcAngle)
  ctx.stroke()

  // Right penalty arc: r = 9.15 m, centred at (94, 34)
  // Only the portion outside the penalty area (x < 88.5)
  // cos(θ) = (94 - 88.5) / 9.15 → θ = acos(5.5/9.15)
  const rightArcAngle = Math.acos(5.5 / 9.15)
  ctx.beginPath()
  ctx.arc(px(94), py(34), px(9.15), Math.PI - rightArcAngle, Math.PI + rightArcAngle)
  ctx.stroke()

  // Left goal: from (0, 30.34) to (-2.44, 37.66) — depth extends left (negative x)
  ctx.strokeRect(px(-2.44), py(30.34), px(2.44), py(7.32))

  // Right goal: from (105, 30.34) to (107.44, 37.66)
  ctx.strokeRect(px(105), py(30.34), px(2.44), py(7.32))

  // Corner arcs (r = 1 m, quarter circles)
  // Top-left corner (0, 0): arc from 0 to π/2
  ctx.beginPath()
  ctx.arc(px(0), py(0), px(1), 0, Math.PI / 2)
  ctx.stroke()

  // Top-right corner (105, 0): arc from π/2 to π
  ctx.beginPath()
  ctx.arc(px(105), py(0), px(1), Math.PI / 2, Math.PI)
  ctx.stroke()

  // Bottom-left corner (0, 68): arc from -π/2 (= 3π/2) to 0
  ctx.beginPath()
  ctx.arc(px(0), py(68), px(1), -Math.PI / 2, 0)
  ctx.stroke()

  // Bottom-right corner (105, 68): arc from π to 3π/2
  ctx.beginPath()
  ctx.arc(px(105), py(68), px(1), Math.PI, (3 * Math.PI) / 2)
  ctx.stroke()
}

// ── Futsal mode (40×20 m) ─────────────────────────────────────────────────────

function drawFutsalMarkings(ctx, px, py) {
  // Outer boundary
  ctx.strokeRect(px(0), py(0), px(40), py(20))

  // Halfway line
  ctx.beginPath()
  ctx.moveTo(px(20), py(0))
  ctx.lineTo(px(20), py(20))
  ctx.stroke()

  // Centre circle (r = 3 m)
  ctx.beginPath()
  ctx.arc(px(20), py(10), px(3), 0, Math.PI * 2)
  ctx.stroke()

  // Centre spot (filled, r = 0.2 m)
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.arc(px(20), py(10), px(0.2), 0, Math.PI * 2)
  ctx.fill()

  // Left penalty area: (0, 8.5) → (6, 11.5) — width 6, height 3
  ctx.strokeRect(px(0), py(8.5), px(6), py(3))

  // Right penalty area: (34, 8.5) → (40, 11.5)
  ctx.strokeRect(px(34), py(8.5), px(6), py(3))

  // Left penalty spot (filled, r = 0.2 m) at (6, 10)
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.arc(px(6), py(10), px(0.2), 0, Math.PI * 2)
  ctx.fill()

  // Right penalty spot (filled, r = 0.2 m) at (34, 10)
  ctx.beginPath()
  ctx.arc(px(34), py(10), px(0.2), 0, Math.PI * 2)
  ctx.fill()

  // Left goal: from (0, 8.5) to (-1, 11.5) — depth 1, width 3
  ctx.strokeRect(px(-1), py(8.5), px(1), py(3))

  // Right goal: from (40, 8.5) to (41, 11.5)
  ctx.strokeRect(px(40), py(8.5), px(1), py(3))
}
