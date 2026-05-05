import { useState, useRef, useCallback } from 'react'
import { useMatchData } from './hooks/useMatchData.js'
import { hasCredentials } from './lib/supabase.js'
import PlayerReport from './components/PlayerReport.jsx'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const TEAM_COLOR = '#0277B6'

export default function App() {
  const { match, lineups, allStats, loading, error } = useMatchData()
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const reportRef = useRef(null)

  const selectedLineup = lineups.find(l => l.player_id === selectedPlayerId) ?? null
  const selectedStats  = selectedPlayerId ? allStats[selectedPlayerId] : null

  const starters = lineups.filter(l => l.starting_xi)
  const subs     = lineups.filter(l => !l.starting_xi)

  // ── Download single PDF ──────────────────────────────────
  const downloadPDF = useCallback(async () => {
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

  // ── Download all PDFs (one page per player) ─────────────
  const downloadAll = useCallback(async () => {
    const withData = lineups.filter(l => allStats[l.player_id])
    if (!withData.length) return
    setDownloading(true)
    const pdf = new jsPDF('p', 'mm', 'a4')
    let first = true
    for (const lu of withData) {
      setSelectedPlayerId(lu.player_id)
      await new Promise(r => setTimeout(r, 500))
      if (!reportRef.current) continue
      const canvas = await html2canvas(reportRef.current, { scale: 1.5, useCORS: true })
      if (!first) pdf.addPage()
      const w = pdf.internal.pageSize.getWidth()
      const h = (canvas.height / canvas.width) * w
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h)
      first = false
    }
    pdf.save('MKS_player_reports.pdf')
    setDownloading(false)
  }, [lineups, allStats])

  // ── No credentials ───────────────────────────────────────
  if (!hasCredentials) {
    return (
      <div style={{ padding: 40, fontFamily: 'var(--font)', maxWidth: 600, margin: '60px auto', background: 'white', border: '3px solid var(--black)', borderRadius: 8 }}>
        <h2 style={{ marginBottom: 12 }}>⚙ Setup Required</h2>
        <p style={{ marginBottom: 12 }}>Copy <code>.env.example</code> → <code>.env</code> and fill in credentials, then restart the dev server.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--font)' }}>

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside style={{
        width: 230, minWidth: 230, background: 'var(--black)', color: 'white',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        {/* Team + match header */}
        <div style={{ padding: '20px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: TEAM_COLOR, marginBottom: 6 }}>
            Player Match Report
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
            {loading ? 'Loading…' : (match?.home_team?.team_name ?? match?.away_team?.team_name ?? 'MKS')}
          </div>
          <div style={{ fontSize: 10, opacity: 0.45, marginTop: 4 }}>
            {match?.match_name}
          </div>
          <div style={{ fontSize: 10, opacity: 0.35, marginTop: 2 }}>
            {match?.match_date}
          </div>
          {match?.home_team_score != null && (
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8, letterSpacing: 2 }}>
              {match.home_team_score} – {match.away_team_score}
            </div>
          )}
        </div>

        {/* Download All */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={downloadAll}
            disabled={downloading || loading || Object.keys(allStats).length === 0}
            style={{
              width: '100%', background: 'var(--accent)', color: 'var(--black)',
              border: 'none', borderRadius: 6, padding: '9px 0',
              fontSize: 11, fontWeight: 700, fontFamily: 'var(--font)',
              cursor: downloading ? 'wait' : 'pointer', letterSpacing: 0.5,
            }}
          >
            {downloading ? 'Generating PDFs…' : '⬇ Download All Reports'}
          </button>
        </div>

        {/* Error / no-data notice */}
        {error && (
          <div style={{ padding: '10px 16px', fontSize: 10, color: '#D90429' }}>
            {error}
          </div>
        )}
        {!loading && !error && Object.keys(allStats).length === 0 && lineups.length > 0 && (
          <div style={{ padding: '10px 16px', fontSize: 10, color: '#FFD166', opacity: 0.8, lineHeight: 1.5 }}>
            No event data recorded for this match yet.
          </div>
        )}

        {/* Player list */}
        {!loading && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {starters.length > 0 && (
              <div style={{ padding: '10px 16px 4px', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.35 }}>
                Starting XI
              </div>
            )}
            {starters.map(p => (
              <PlayerRow
                key={p.lineup_id} p={p}
                selected={selectedPlayerId === p.player_id}
                hasStats={!!allStats[p.player_id]}
                onSelect={setSelectedPlayerId}
              />
            ))}

            {subs.length > 0 && (
              <div style={{ padding: '10px 16px 4px', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.35 }}>
                Substitutes
              </div>
            )}
            {subs.map(p => (
              <PlayerRow
                key={p.lineup_id} p={p}
                selected={selectedPlayerId === p.player_id}
                hasStats={!!allStats[p.player_id]}
                onSelect={setSelectedPlayerId}
                dim
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 9, opacity: 0.25, letterSpacing: 0.5 }}>
          {lineups.length} players · {Object.keys(allStats).length} with data
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {selectedLineup && selectedStats ? (
          <>
            {/* Sticky top bar */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              background: 'var(--bg)', borderBottom: '2px solid var(--black)',
              padding: '9px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {selectedLineup.player?.player_name}
                <span style={{ fontWeight: 400, opacity: 0.5, fontSize: 11, marginLeft: 10 }}>
                  #{selectedLineup.jersey_no} · {selectedLineup.position ?? selectedLineup.player?.position ?? ''}
                </span>
              </span>
              <button
                onClick={downloadPDF}
                disabled={downloading}
                style={{
                  background: TEAM_COLOR, color: 'white', border: 'none',
                  borderRadius: 6, padding: '8px 20px', fontSize: 12,
                  fontFamily: 'var(--font)', fontWeight: 700, cursor: 'pointer',
                }}
              >
                {downloading ? 'Generating…' : '⬇ Download PDF'}
              </button>
            </div>

            <PlayerReport
              ref={reportRef}
              lineup={selectedLineup}
              stats={selectedStats}
              teamColor={TEAM_COLOR}
              matchName={match?.match_name}
              matchDate={match?.match_date}
              allStats={allStats}
            />
          </>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', minHeight: '80vh', gap: 14,
          }}>
            <div style={{ fontSize: 52 }}>⚽</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {loading ? 'Loading match data…' : 'Select a player'}
            </div>
            {!loading && (
              <div style={{ fontSize: 12, opacity: 0.45 }}>
                {match?.match_name}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function PlayerRow({ p, selected, hasStats, onSelect, dim }) {
  return (
    <div
      onClick={() => onSelect(p.player_id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', cursor: 'pointer',
        background: selected ? TEAM_COLOR : 'transparent',
        color: selected ? 'white' : `rgba(255,255,255,${dim ? 0.55 : 0.85})`,
        fontSize: 12, transition: 'background 0.12s',
      }}
    >
      <span style={{ minWidth: 20, fontSize: 10, opacity: 0.45, textAlign: 'right' }}>
        {p.jersey_no ?? '—'}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.player?.player_name ?? 'Unknown'}
      </span>
      <span style={{ fontSize: 9, opacity: hasStats ? 0 : 0.3 }}>
        {hasStats ? '' : 'no data'}
      </span>
    </div>
  )
}
