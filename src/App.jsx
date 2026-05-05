import { useState, useRef, useCallback } from 'react'
import { useMatchData } from './hooks/useMatchData.js'
import { hasCredentials } from './lib/supabase.js'
import PlayerReport from './components/PlayerReport.jsx'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const S = {
  navBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    background: '#000',
    color: '#fff',
    borderBottom: '3px solid #000',
    padding: '0 20px',
    height: 48,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  navTitle: {
    fontFamily: 'var(--font)',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: '#FFD166',
    paddingRight: 24,
    borderRight: '2px solid #444',
    marginRight: 20,
  },
  modeBtn: (active) => ({
    fontFamily: 'var(--font)',
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    background: active ? '#FFD166' : 'transparent',
    color: active ? '#000' : '#fff',
    border: '2px solid',
    borderColor: active ? '#FFD166' : '#555',
    padding: '6px 14px',
    cursor: 'pointer',
    marginRight: 8,
  }),
  sidebar: {
    width: 220,
    minWidth: 220,
    background: '#000',
    color: '#fff',
    borderRight: '3px solid #000',
    display: 'flex',
    flexDirection: 'column',
    position: 'sticky',
    top: 48,
    height: 'calc(100vh - 48px)',
    overflowY: 'auto',
  },
  sideHeader: {
    padding: '16px 14px 12px',
    borderBottom: '2px solid #333',
  },
  sectionLabel: {
    padding: '8px 14px 4px',
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#888',
    fontWeight: 700,
    fontFamily: 'var(--font)',
  },
  playerRow: (selected, color) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 14px',
    cursor: 'pointer',
    background: selected ? color : 'transparent',
    borderLeft: selected ? `4px solid ${color === '#FFD166' ? '#000' : '#FFD166'}` : '4px solid transparent',
    color: selected ? (color === '#FFD166' ? '#000' : '#fff') : 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontFamily: 'var(--font)',
    fontWeight: 700,
    textTransform: 'uppercase',
    transition: 'none',
  }),
  downloadBtn: (disabled) => ({
    background: disabled ? '#555' : '#FFD166',
    color: '#000',
    border: '2px solid #000',
    fontFamily: 'var(--font)',
    fontWeight: 700,
    fontSize: 11,
    padding: '7px 14px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: 1,
    textTransform: 'uppercase',
  }),
  topBar: {
    background: '#FFD166',
    borderBottom: '3px solid #000',
    padding: '8px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
}

export default function App() {
  const { match, lineups, allStats, loading, error } = useMatchData()
  const [mode, setMode] = useState('single') // 'single' | 'compare'
  const [playerA, setPlayerA] = useState(null)
  const [playerB, setPlayerB] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const reportRefA = useRef(null)
  const reportRefB = useRef(null)

  const starters = lineups.filter(l => l.starting_xi)
  const subs     = lineups.filter(l => !l.starting_xi)

  const selectedId = mode === 'single' ? playerA : null

  const handleSelect = useCallback((pid) => {
    if (mode === 'single') {
      setPlayerA(pid)
    } else {
      if (!playerA) { setPlayerA(pid); return }
      if (playerA === pid) { setPlayerA(null); return }
      if (!playerB) { setPlayerB(pid); return }
      if (playerB === pid) { setPlayerB(null); return }
      setPlayerA(pid); setPlayerB(null)
    }
  }, [mode, playerA, playerB])

  const getRowColor = (pid) => {
    if (mode === 'single') return pid === playerA ? '#FFD166' : null
    if (pid === playerA) return '#0277B6'
    if (pid === playerB) return '#D90429'
    return null
  }

  const downloadSingle = useCallback(async (ref, lineup) => {
    if (!ref.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(ref.current, { scale: 2, useCORS: true, allowTaint: true })
      const pdf = new jsPDF('p', 'mm', 'a4')
      const w = pdf.internal.pageSize.getWidth()
      const h = (canvas.height / canvas.width) * w
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h)
      const name = lineup?.player?.player_name?.replace(/\s+/g, '_') ?? 'player'
      pdf.save(`${name}_report.pdf`)
    } finally {
      setDownloading(false)
    }
  }, [])

  if (!hasCredentials) {
    return (
      <div style={{ padding: 40, fontFamily: 'var(--font)', maxWidth: 600, margin: '60px auto', border: '3px solid #000' }}>
        <h2 style={{ marginBottom: 12 }}>SETUP REQUIRED</h2>
        <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your <code>.env</code> file.</p>
      </div>
    )
  }

  const lineupA = lineups.find(l => l.player_id === playerA) ?? null
  const lineupB = lineups.find(l => l.player_id === playerB) ?? null
  const statsA  = playerA ? allStats[playerA] : null
  const statsB  = playerB ? allStats[playerB] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#fff' }}>

      {/* ── Top nav ─────────────────────────────────────────── */}
      <nav style={S.navBar}>
        <span style={S.navTitle}>CAC PLAYER REPORT</span>
        <button style={S.modeBtn(mode === 'single')} onClick={() => setMode('single')}>SINGLE</button>
        <button style={S.modeBtn(mode === 'compare')} onClick={() => setMode('compare')}>COMPARE</button>
        {mode === 'compare' && (
          <span style={{ fontSize: 10, color: '#888', marginLeft: 12, fontFamily: 'var(--font)', letterSpacing: 1 }}>
            {playerA && lineups.find(l => l.player_id === playerA)?.player?.player_name
              ? <span style={{ color: '#6ec6ff' }}>{lineups.find(l => l.player_id === playerA).player.player_name}</span>
              : <span style={{ color: '#555' }}>SELECT PLAYER 1</span>
            }
            {' '}<span style={{ color: '#555' }}>vs</span>{' '}
            {playerB && lineups.find(l => l.player_id === playerB)?.player?.player_name
              ? <span style={{ color: '#ff8888' }}>{lineups.find(l => l.player_id === playerB).player.player_name}</span>
              : <span style={{ color: '#555' }}>SELECT PLAYER 2</span>
            }
          </span>
        )}
        <div style={{ flex: 1 }} />
        {match && (
          <span style={{ fontSize: 10, color: '#888', fontFamily: 'var(--font)', letterSpacing: 1, textTransform: 'uppercase' }}>
            {match.match_name} · {match.match_date}
          </span>
        )}
      </nav>

      <div style={{ display: 'flex', flex: 1 }}>

        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside style={S.sidebar}>
          <div style={S.sideHeader}>
            <div style={{ fontSize: 8, letterSpacing: 2, color: '#FFD166', fontWeight: 700, fontFamily: 'var(--font)', textTransform: 'uppercase', marginBottom: 4 }}>
              MKS Podlasie
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)', textTransform: 'uppercase', lineHeight: 1.3 }}>
              {loading ? 'LOADING…' : (match?.home_team?.team_name ?? match?.away_team?.team_name ?? 'MKS')}
            </div>
            {match?.home_team_score != null && (
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 4, marginTop: 6, fontFamily: 'var(--font)' }}>
                {match.home_team_score} – {match.away_team_score}
              </div>
            )}
          </div>

          {error && (
            <div style={{ padding: '8px 14px', fontSize: 10, color: '#ff5555', fontWeight: 700, fontFamily: 'var(--font)' }}>
              {error}
            </div>
          )}

          {!loading && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {starters.length > 0 && <div style={S.sectionLabel}>STARTING XI</div>}
              {starters.map(p => {
                const col = getRowColor(p.player_id)
                return (
                  <div key={p.lineup_id} onClick={() => handleSelect(p.player_id)} style={S.playerRow(!!col, col || '#FFD166')}>
                    <span style={{ minWidth: 18, fontSize: 9, opacity: 0.5, textAlign: 'right' }}>{p.jersey_no ?? '—'}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {p.player?.player_name ?? 'Unknown'}
                    </span>
                    {!allStats[p.player_id] && (
                      <span style={{ fontSize: 8, background: '#D90429', color: '#fff', padding: '1px 3px', fontWeight: 700 }}>NO DATA</span>
                    )}
                  </div>
                )
              })}
              {subs.length > 0 && <div style={S.sectionLabel}>SUBSTITUTES</div>}
              {subs.map(p => {
                const col = getRowColor(p.player_id)
                return (
                  <div key={p.lineup_id} onClick={() => handleSelect(p.player_id)} style={S.playerRow(!!col, col || '#FFD166')}>
                    <span style={{ minWidth: 18, fontSize: 9, opacity: 0.5, textAlign: 'right' }}>{p.jersey_no ?? '—'}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {p.player?.player_name ?? 'Unknown'}
                    </span>
                    {!allStats[p.player_id] && (
                      <span style={{ fontSize: 8, background: '#D90429', color: '#fff', padding: '1px 3px', fontWeight: 700 }}>NO DATA</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ padding: '8px 14px', borderTop: '2px solid #222', fontSize: 9, color: '#555', fontFamily: 'var(--font)', letterSpacing: 1 }}>
            {lineups.length} PLAYERS · {Object.keys(allStats).length} WITH DATA
          </div>
        </aside>

        {/* ── Main ─────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>

          {/* Single mode */}
          {mode === 'single' && lineupA && statsA && (
            <>
              <div style={S.topBar}>
                <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--font)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {lineupA.player?.player_name}
                  <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 10, opacity: 0.7 }}>
                    #{lineupA.jersey_no} · {lineupA.position ?? lineupA.player?.position ?? ''}
                  </span>
                </span>
                <button
                  style={S.downloadBtn(downloading)}
                  disabled={downloading}
                  onClick={() => downloadSingle(reportRefA, lineupA)}
                >
                  {downloading ? 'GENERATING…' : '⬇ DOWNLOAD PDF'}
                </button>
              </div>
              <PlayerReport
                ref={reportRefA}
                player={lineupA}
                stats={statsA}
                matchInfo={match}
                lineup={lineups}
                allStats={allStats}
              />
            </>
          )}

          {/* Compare mode */}
          {mode === 'compare' && (lineupA || lineupB) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, minHeight: '100%' }}>
              {[
                { lineup: lineupA, stats: statsA, ref: reportRefA, color: '#0277B6', label: 'PLAYER 1' },
                { lineup: lineupB, stats: statsB, ref: reportRefB, color: '#D90429', label: 'PLAYER 2' },
              ].map(({ lineup, stats, ref, color, label }, i) => (
                <div key={i} style={{ borderRight: i === 0 ? '3px solid #000' : 'none' }}>
                  <div style={{ ...S.topBar, position: 'relative', top: 'auto', background: color, borderBottom: '3px solid #000' }}>
                    <span style={{ fontWeight: 700, fontSize: 12, fontFamily: 'var(--font)', textTransform: 'uppercase', color: '#fff', letterSpacing: 1 }}>
                      {lineup ? lineup.player?.player_name : label}
                      {lineup && <span style={{ fontWeight: 400, fontSize: 10, marginLeft: 8, opacity: 0.8 }}>#{lineup.jersey_no}</span>}
                    </span>
                    {lineup && stats && (
                      <button style={{ ...S.downloadBtn(downloading), background: '#fff', color: '#000' }}
                        onClick={() => downloadSingle(ref, lineup)} disabled={downloading}>
                        ⬇ PDF
                      </button>
                    )}
                  </div>
                  {lineup && stats
                    ? <PlayerReport ref={ref} player={lineup} stats={stats} matchInfo={match} lineup={lineups} allStats={allStats} compareColor={color} compact />
                    : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 12, opacity: 0.4 }}>
                        <div style={{ fontSize: 36 }}>⚽</div>
                        <div style={{ fontFamily: 'var(--font)', fontWeight: 700, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
                          SELECT {label}
                        </div>
                      </div>
                    )
                  }
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {((mode === 'single' && !lineupA) || (mode === 'compare' && !lineupA && !lineupB)) && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 48px)', gap: 16 }}>
              <div style={{ fontSize: 56 }}>⚽</div>
              <div style={{ fontFamily: 'var(--font)', fontWeight: 700, fontSize: 16, letterSpacing: 3, textTransform: 'uppercase' }}>
                {loading ? 'LOADING MATCH DATA…' : mode === 'compare' ? 'SELECT TWO PLAYERS TO COMPARE' : 'SELECT A PLAYER'}
              </div>
              {!loading && match && (
                <div style={{ fontFamily: 'var(--font)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.4 }}>
                  {match.match_name} · {match.match_date}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
