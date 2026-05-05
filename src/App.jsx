import { useState, useRef, useCallback } from 'react'
import { useMatchData } from './hooks/useMatchData.js'
import { hasCredentials } from './lib/supabase.js'
import PlayerReport from './components/PlayerReport.jsx'
import BrutalistButton from './components/BrutalistButton.jsx'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const TEAM_COLOR = '#0077B6'

export default function App() {
  const { match, lineups, allStats, loading, error } = useMatchData()
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const reportRef = useRef(null)

  // PitchMode state with localStorage persistence
  const [pitchMode, setPitchMode] = useState(() => {
    try {
      return localStorage.getItem('pitchMode') || 'standard'
    } catch {
      return 'standard'
    }
  })

  // PDF error state with auto-clear
  const [pdfError, setPdfError] = useState(null)

  const selectedLineup = lineups.find(l => l.player_id === selectedPlayerId) ?? null
  const selectedStats  = selectedPlayerId ? allStats[selectedPlayerId] : null

  const starters = lineups.filter(l => l.starting_xi)
  const subs     = lineups.filter(l => !l.starting_xi)

  // ── PitchMode toggle ─────────────────────────────────────
  const togglePitchMode = useCallback(() => {
    const newMode = pitchMode === 'standard' ? 'futsal' : 'standard'
    setPitchMode(newMode)
    try {
      localStorage.setItem('pitchMode', newMode)
    } catch {}
  }, [pitchMode])

  // ── Download single PDF ──────────────────────────────────
  const downloadPDF = useCallback(async () => {
    if (!reportRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
      })
      const pdf = new jsPDF('p', 'mm', 'a4')
      const w = pdf.internal.pageSize.getWidth()
      const h = (canvas.height / canvas.width) * w
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h)
      const name = selectedLineup?.player?.player_name?.replace(/\s+/g, '_') ?? 'player'
      pdf.save(`${name}_report.pdf`)
    } catch {
      setPdfError('PDF generation failed')
      setTimeout(() => setPdfError(null), 4000)
    } finally {
      setDownloading(false)
    }
  }, [selectedLineup])

  // ── No credentials ───────────────────────────────────────
  if (!hasCredentials) {
    return (
      <div style={{ padding: 40, fontFamily: 'monospace', maxWidth: 600, margin: '60px auto', background: 'var(--color-white)', border: 'var(--border-brutal-thick)' }}>
        <h2 style={{ marginBottom: 12 }}>⚙ SETUP REQUIRED</h2>
        <p style={{ marginBottom: 12 }}>Copy <code>.env.example</code> → <code>.env</code> and fill in credentials, then restart the dev server.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'monospace' }}>

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside style={{
        width: 240,
        minWidth: 240,
        background: 'var(--color-black)',
        color: 'var(--color-white)',
        borderRight: 'var(--border-brutal-thick)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }}>
        {/* Team + match header */}
        <div style={{
          padding: '20px 16px 14px',
          borderBottom: '2px solid rgba(255,255,255,0.15)',
        }}>
          <div style={{
            fontSize: 9,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: TEAM_COLOR,
            marginBottom: 6,
            fontWeight: 700,
            fontFamily: 'monospace',
          }}>
            Player Match Report
          </div>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.3,
            textTransform: 'uppercase',
            fontFamily: 'monospace',
          }}>
            {loading ? 'LOADING…' : (match?.home_team?.team_name ?? match?.away_team?.team_name ?? 'MKS')}
          </div>
          <div style={{
            fontSize: 10,
            opacity: 0.55,
            marginTop: 4,
            textTransform: 'uppercase',
            fontFamily: 'monospace',
            fontWeight: 700,
          }}>
            {match?.match_name}
          </div>
          <div style={{
            fontSize: 10,
            opacity: 0.4,
            marginTop: 2,
            fontFamily: 'monospace',
            fontWeight: 700,
          }}>
            {match?.match_date}
          </div>
          {match?.home_team_score != null && (
            <div style={{
              fontSize: 22,
              fontWeight: 700,
              marginTop: 8,
              letterSpacing: 3,
              fontFamily: 'monospace',
            }}>
              {match.home_team_score} – {match.away_team_score}
            </div>
          )}
        </div>

        {/* Error / no-data notice */}
        {error && (
          <div style={{ padding: '10px 16px', fontSize: 10, color: '#D90429', fontWeight: 700, fontFamily: 'monospace' }}>
            {error}
          </div>
        )}
        {!loading && !error && Object.keys(allStats).length === 0 && lineups.length > 0 && (
          <div style={{ padding: '10px 16px', fontSize: 10, color: 'var(--color-accent)', opacity: 0.8, lineHeight: 1.5, fontFamily: 'monospace', fontWeight: 700 }}>
            NO EVENT DATA RECORDED FOR THIS MATCH YET.
          </div>
        )}

        {/* Player list */}
        {!loading && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {starters.length > 0 && (
              <div style={{
                padding: '10px 16px 4px',
                fontSize: 9,
                letterSpacing: 2,
                textTransform: 'uppercase',
                opacity: 0.45,
                fontWeight: 700,
                fontFamily: 'monospace',
              }}>
                Starting XI
              </div>
            )}
            {starters.map(p => (
              <PlayerRow
                key={p.lineup_id}
                p={p}
                selected={selectedPlayerId === p.player_id}
                hasStats={!!allStats[p.player_id]}
                onSelect={setSelectedPlayerId}
              />
            ))}

            {subs.length > 0 && (
              <div style={{
                padding: '10px 16px 4px',
                fontSize: 9,
                letterSpacing: 2,
                textTransform: 'uppercase',
                opacity: 0.45,
                fontWeight: 700,
                fontFamily: 'monospace',
              }}>
                Substitutes
              </div>
            )}
            {subs.map(p => (
              <PlayerRow
                key={p.lineup_id}
                p={p}
                selected={selectedPlayerId === p.player_id}
                hasStats={!!allStats[p.player_id]}
                onSelect={setSelectedPlayerId}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '2px solid rgba(255,255,255,0.1)',
          fontSize: 9,
          opacity: 0.3,
          letterSpacing: 0.5,
          fontFamily: 'monospace',
          fontWeight: 700,
        }}>
          {lineups.length} PLAYERS · {Object.keys(allStats).length} WITH DATA
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {selectedLineup && selectedStats ? (
          <>
            {/* Sticky top bar */}
            <div style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: 'var(--color-accent)',
              borderBottom: 'var(--border-brutal-thick)',
              padding: '10px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', textTransform: 'uppercase' }}>
                {selectedLineup.player?.player_name}
                <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 11, marginLeft: 10 }}>
                  #{selectedLineup.jersey_no} · {selectedLineup.position ?? selectedLineup.player?.position ?? ''}
                </span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {pdfError && (
                  <span style={{
                    color: '#D90429',
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                  }}>
                    {pdfError}
                  </span>
                )}
                <BrutalistButton
                  onClick={downloadPDF}
                  disabled={downloading}
                  variant="primary"
                >
                  {downloading ? 'GENERATING…' : '⬇ DOWNLOAD PDF'}
                </BrutalistButton>
                <BrutalistButton
                  onClick={togglePitchMode}
                  variant="primary"
                >
                  {pitchMode === 'standard' ? 'STANDARD' : 'FUTSAL'}
                </BrutalistButton>
              </div>
            </div>

            <PlayerReport
              ref={reportRef}
              player={selectedLineup}
              stats={selectedStats}
              matchInfo={match}
              lineup={lineups}
              allStats={allStats}
              pitchMode={pitchMode}
            />
          </>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '80vh',
            gap: 14,
          }}>
            <div style={{ fontSize: 52 }}>⚽</div>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              textTransform: 'uppercase',
              fontFamily: 'monospace',
              letterSpacing: 2,
            }}>
              {loading ? 'LOADING MATCH DATA…' : 'SELECT A PLAYER'}
            </div>
            {!loading && (
              <div style={{ fontSize: 12, opacity: 0.45, fontFamily: 'monospace', textTransform: 'uppercase' }}>
                {match?.match_name}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function PlayerRow({ p, selected, hasStats, onSelect }) {
  return (
    <div
      onClick={() => onSelect(p.player_id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        cursor: 'pointer',
        background: selected ? 'var(--color-home)' : 'transparent',
        color: selected ? 'var(--color-white)' : 'rgba(255,255,255,0.8)',
        fontSize: 12,
        fontFamily: 'monospace',
        fontWeight: 700,
        textTransform: 'uppercase',
      }}
    >
      <span style={{ minWidth: 20, fontSize: 10, opacity: 0.5, textAlign: 'right', fontWeight: 700 }}>
        {p.jersey_no ?? '—'}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.player?.player_name ?? 'Unknown'}
      </span>
      {!hasStats && (
        <span style={{
          fontSize: 8,
          fontWeight: 700,
          background: '#D90429',
          color: '#FFFFFF',
          padding: '2px 4px',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          flexShrink: 0,
        }}>
          NO DATA
        </span>
      )}
    </div>
  )
}
