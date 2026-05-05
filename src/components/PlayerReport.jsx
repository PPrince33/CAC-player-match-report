import { forwardRef } from 'react'
import StatsGrid from './StatsGrid.jsx'
import HeatMap from './HeatMap.jsx'
import PassMap from './PassMap.jsx'
import ShotMap from './ShotMap.jsx'
import PlayerRadar from './RadarChart.jsx'
import { buildRadarData } from '../utils/stats.js'

const PlayerReport = forwardRef(function PlayerReport(
  { lineup, stats, teamColor, matchName, matchDate, allStats }, ref
) {
  if (!lineup || !stats) return null

  const player = lineup.player
  const team = lineup.team
  const radarData = buildRadarData(stats, Object.values(allStats))

  return (
    <div
      ref={ref}
      style={{
        background: 'var(--bg)',
        fontFamily: 'var(--font)',
        padding: 24,
        maxWidth: 900,
        margin: '0 auto',
      }}
    >
      {/* ── Header ── */}
      <div style={{
        background: teamColor,
        color: 'white',
        padding: '16px 20px',
        borderRadius: 8,
        marginBottom: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.8 }}>
            Player Match Report
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
            {player?.player_name ?? 'Unknown Player'}
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
            {team?.team_name} · #{lineup.jersey_no} · {lineup.position ?? player?.position ?? '—'}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.85 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{matchName}</div>
          <div>{matchDate}</div>
          <div style={{ marginTop: 6 }}>
            {lineup.starting_xi ? '▶ Starting XI' : '⇄ Substitute'}
            {lineup.match_duration != null && ` · ${lineup.match_duration}'`}
          </div>
        </div>
      </div>

      {/* ── Quick numbers row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 8,
        marginBottom: 24,
      }}>
        {[
          { label: 'Passes', value: stats.totalPasses },
          { label: 'Pass%', value: `${stats.passAccuracy}%` },
          { label: 'Goals', value: stats.goals },
          { label: 'xG', value: stats.totalXG },
          { label: 'Tackles', value: stats.tackles },
          { label: 'Intercepts', value: stats.interceptions },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: 'var(--white)',
            border: `2px solid ${teamColor}`,
            borderRadius: 6,
            padding: '10px 0',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.65, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Visualisations row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{ background: 'var(--white)', border: '2px solid var(--black)', borderRadius: 8, padding: 14 }}>
          <HeatMap events={stats.allEvents} teamColor={teamColor} />
        </div>
        <div style={{ background: 'var(--white)', border: '2px solid var(--black)', borderRadius: 8, padding: 14 }}>
          <PlayerRadar data={radarData} teamColor={teamColor} playerName={player?.player_name} />
        </div>
      </div>

      {/* ── Pass map ── */}
      {stats.passEvents.length > 0 && (
        <div style={{ background: 'var(--white)', border: '2px solid var(--black)', borderRadius: 8, padding: 14, marginBottom: 20 }}>
          <PassMap passes={stats.passEvents} />
        </div>
      )}

      {/* ── Shot map ── */}
      {stats.shotEvents.length > 0 && (
        <div style={{ background: 'var(--white)', border: '2px solid var(--black)', borderRadius: 8, padding: 14, marginBottom: 20 }}>
          <ShotMap shots={stats.shotEvents} />
        </div>
      )}

      {/* ── Full stats ── */}
      <div style={{ background: 'var(--white)', border: '2px solid var(--black)', borderRadius: 8, padding: 16 }}>
        <StatsGrid s={stats} teamColor={teamColor} />
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: 10, opacity: 0.45, marginTop: 14 }}>
        CAC Player Match Report · Match ID {lineup.match_id}
      </div>
    </div>
  )
})

export default PlayerReport
