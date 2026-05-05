import { useState, useRef, useCallback } from 'react'
import { useMatchData } from './hooks/useMatchData.js'
import { hasCredentials } from './lib/supabase.js'
import PlayerReport from './components/PlayerReport.jsx'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const TEAM_A_COLOR = '#0277B6'
const TEAM_B_COLOR = '#D90429'

function teamColor(lineup, match) {
  if (!match || !lineup) return TEAM_A_COLOR
  return lineup.team_id === match.home_team_id ? TEAM_A_COLOR : TEAM_B_COLOR
}

export default function App() {
  const { match, lineups, allStats, loading, error } = useMatchData()
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const reportRef = useRef(null)

  const selectedLineup = lineups.find(l => l.player_id === selectedPlayerId) ?? null
  const selectedStats = selectedPlayerId ? allStats[selectedPlayerId] : null
  const selectedColor = teamColor(selectedLineup, match)

  // Group players by team for the sidebar
  const homeLineups = lineups.filter(l => l.team_id === match?.home_team_id)
  const awayLineups = lineups.filter(l => l.team_id === match?.away_team_id)

  const downloadCurrentPDF = useCallback(async () => {
    if (!reportRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true })
      const pdf = new jsPDF('p', 'mm', 'a4')
      const w = pdf.internal.pageSize.getWidth()
      const h = (canvas.height / canvas.width) * w
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h)
      const name = selectedLineup?.player?.player_name?.replace(/\s+/g, '_') ?? 'player'
      pdf.save(`${name}_report.pdf`)
    } finally {
      setDownloading(false)
    }
  }, [selectedLineup])

  const downloadAllPDF = useCallback(async () => {
    if (lineups.length === 0) return
    setDownloading(true)
    const pdf = new jsPDF('p', 'mm', 'a4')
    let first = true
    for (const lu of lineups) {
      if (!allStats[lu.player_id]) continue
      setSelectedPlayerId(lu.player_id)
      // Let React re-render
      await new Promise(r => setTimeout(r, 400))
      if (!reportRef.current) continue
      const canvas = await html2canvas(reportRef.current, { scale: 1.5, useCORS: true })
      if (!first) pdf.addPage()
      const w = pdf.internal.pageSize.getWidth()
      const h = (canvas.height / canvas.width) * w
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h)
      first = false
    }
    pdf.save('all_player_reports.pdf')
    setDownloading(false)
  }, [lineups, allStats])

  if (!hasCredentials) {
    return (
      <div style={{ padding: 40, fontFamily: 'var(--font)', maxWidth: 600, margin: '60px auto', background: 'white', border: '3px solid var(--black)', borderRadius: 8 }}>
        <h2 style={{ marginBottom: 12 }}>⚙ Setup Required</h2>
        <p style={{ marginBottom: 12 }}>Copy <code>.env.example</code> → <code>.env</code> and add your Supabase credentials:</p>
        <pre style={{ background: '#f4f4f4', padding: 12, borderRadius: 4, fontSize: 13 }}>
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
        </pre>
        <p style={{ marginTop: 12, opacity: 0.6, fontSize: 12 }}>Then restart the dev server.</p>
      </div>
    )
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--font)', fontSize: 18 }}>
      Loading match data…
    </div>
  )

  if (error) return (
    <div style={{ padding: 40, fontFamily: 'var(--font)', color: 'var(--team-b)' }}>
      Error: {error}
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* ── Sidebar ── */}
      <div style={{
        width: 220,
        minWidth: 220,
        background: 'var(--black)',
        color: 'var(--white)',
        padding: '16px 0',
        overflowY: 'auto',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}>
        {/* Match title */}
        <div style={{ padding: '0 14px 14px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.5, marginBottom: 4 }}>Match</div>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)', lineHeight: 1.3 }}>
            {match?.match_name}
          </div>
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4 }}>{match?.match_date}</div>
          {match?.home_team_score != null && (
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>
              <span style={{ color: TEAM_A_COLOR }}>{match.home_team_score}</span>
              <span style={{ opacity: 0.4 }}> – </span>
              <span style={{ color: TEAM_B_COLOR }}>{match.away_team_score}</span>
            </div>
          )}
        </div>

        {/* Download all */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={downloadAllPDF} disabled={downloading}
            style={{
              width: '100%', background: 'var(--accent)', color: 'var(--black)',
              border: 'none', borderRadius: 5, padding: '8px 0', fontSize: 11,
              fontFamily: 'var(--font)', fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
            }}>
            {downloading ? 'Generating…' : '⬇ Download All PDFs'}
          </button>
        </div>

        {/* Home team */}
        <TeamGroup
          label={match?.home_team?.team_name ?? 'Home'}
          color={TEAM_A_COLOR}
          players={homeLineups}
          selectedId={selectedPlayerId}
          onSelect={setSelectedPlayerId}
        />

        {/* Away team */}
        <TeamGroup
          label={match?.away_team?.team_name ?? 'Away'}
          color={TEAM_B_COLOR}
          players={awayLineups}
          selectedId={selectedPlayerId}
          onSelect={setSelectedPlayerId}
        />
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {selectedLineup && selectedStats ? (
          <div style={{ position: 'relative' }}>
            {/* Sticky download button */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              background: 'var(--bg)', borderBottom: '2px solid var(--black)',
              padding: '8px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontFamily: 'var(--font)', fontWeight: 700, fontSize: 14 }}>
                {selectedLineup.player?.player_name}
              </span>
              <button onClick={downloadCurrentPDF} disabled={downloading}
                style={{
                  background: selectedColor, color: 'white', border: 'none',
                  borderRadius: 5, padding: '7px 18px', fontSize: 12,
                  fontFamily: 'var(--font)', fontWeight: 700, cursor: 'pointer',
                }}>
                {downloading ? 'Generating…' : '⬇ Download PDF'}
              </button>
            </div>

            <PlayerReport
              ref={reportRef}
              lineup={selectedLineup}
              stats={selectedStats}
              teamColor={selectedColor}
              matchName={match?.match_name}
              matchDate={match?.match_date}
              allStats={allStats}
            />
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', minHeight: '80vh', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ fontSize: 48 }}>⚽</div>
            <div style={{ fontFamily: 'var(--font)', fontSize: 16, fontWeight: 700 }}>
              Select a player to view their report
            </div>
            <div style={{ fontFamily: 'var(--font)', fontSize: 12, opacity: 0.5 }}>
              {lineups.length} players loaded from {match?.match_name}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TeamGroup({ label, color, players, selectedId, onSelect }) {
  const starters = players.filter(p => p.starting_xi)
  const subs = players.filter(p => !p.starting_xi)

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{
        padding: '0 14px 8px',
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
        color, borderBottom: `2px solid ${color}`,
      }}>
        {label}
      </div>

      {starters.length > 0 && (
        <div style={{ padding: '6px 14px 2px', fontSize: 9, opacity: 0.4, letterSpacing: 1 }}>STARTING XI</div>
      )}
      {starters.map(p => <PlayerRow key={p.lineup_id} p={p} color={color} selected={selectedId === p.player_id} onSelect={onSelect} />)}

      {subs.length > 0 && (
        <div style={{ padding: '6px 14px 2px', fontSize: 9, opacity: 0.4, letterSpacing: 1 }}>SUBSTITUTES</div>
      )}
      {subs.map(p => <PlayerRow key={p.lineup_id} p={p} color={color} selected={selectedId === p.player_id} onSelect={onSelect} opacity={0.7} />)}
    </div>
  )
}

function PlayerRow({ p, color, selected, onSelect, opacity = 1 }) {
  return (
    <div
      onClick={() => onSelect(p.player_id)}
      style={{
        padding: '7px 14px',
        cursor: 'pointer',
        background: selected ? color : 'transparent',
        color: selected ? 'white' : `rgba(255,255,255,${opacity})`,
        fontSize: 12,
        fontFamily: 'var(--font)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'background 0.15s',
      }}
    >
      <span style={{ opacity: 0.5, minWidth: 18, fontSize: 10 }}>{p.jersey_no ?? '—'}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
        {p.player?.player_name ?? 'Unknown'}
      </span>
      {p.subbed_off && <span style={{ fontSize: 9, opacity: 0.5 }}>⬇</span>}
    </div>
  )
}
