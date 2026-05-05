// SVG pitch — 120×80 coordinate system (matches database)
export default function Pitch({ children, className = '' }) {
  const W = 120, H = 80

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      {/* Grass */}
      <rect width={W} height={H} fill="#2d6a2d" />
      {/* Stripe pattern */}
      {Array.from({ length: 12 }).map((_, i) => (
        <rect key={i} x={i * 10} y={0} width={10} height={H}
          fill={i % 2 === 0 ? '#2d6a2d' : '#2f7030'} />
      ))}

      {/* Boundary */}
      <rect x={0} y={0} width={W} height={H} fill="none" stroke="white" strokeWidth={0.5} />

      {/* Halfway line */}
      <line x1={60} y1={0} x2={60} y2={H} stroke="white" strokeWidth={0.4} />

      {/* Centre circle */}
      <circle cx={60} cy={40} r={9.15} fill="none" stroke="white" strokeWidth={0.4} />
      <circle cx={60} cy={40} r={0.5} fill="white" />

      {/* Left penalty area: x=0–16.5, y=20–60 */}
      <rect x={0} y={20} width={16.5} height={40} fill="none" stroke="white" strokeWidth={0.4} />
      {/* Left 6-yard box */}
      <rect x={0} y={30} width={5.5} height={20} fill="none" stroke="white" strokeWidth={0.3} />
      {/* Left penalty spot */}
      <circle cx={11} cy={40} r={0.4} fill="white" />

      {/* Right penalty area: x=103.5–120, y=20–60 */}
      <rect x={103.5} y={20} width={16.5} height={40} fill="none" stroke="white" strokeWidth={0.4} />
      {/* Right 6-yard box */}
      <rect x={114.5} y={30} width={5.5} height={20} fill="none" stroke="white" strokeWidth={0.3} />
      {/* Right penalty spot */}
      <circle cx={109} cy={40} r={0.4} fill="white" />

      {/* Goals */}
      <rect x={-2} y={36} width={2} height={8} fill="none" stroke="white" strokeWidth={0.4} />
      <rect x={120} y={36} width={2} height={8} fill="none" stroke="white" strokeWidth={0.4} />

      {/* Corner arcs */}
      {[[0, 0], [120, 0], [0, 80], [120, 80]].map(([cx, cy], i) => (
        <path key={i}
          d={`M ${cx === 0 ? 1 : 119} ${cy === 0 ? cy : cy} A 1 1 0 0 ${cx === 0 ? 1 : 0} ${cx === 0 ? cx : cx} ${cy === 0 ? 1 : 79}`}
          fill="none" stroke="white" strokeWidth={0.3}
        />
      ))}

      {children}
    </svg>
  )
}
