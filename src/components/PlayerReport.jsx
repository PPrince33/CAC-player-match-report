/**
 * PlayerReport — Neo-Brutalist player match report
 *
 * Uses forwardRef so the parent can pass a ref for html2canvas PDF export.
 *
 * Props:
 *   player     {object}              — lineup entry (player_id, jersey_no, position, team_id,
 *                                      player.player_name, starting_xi, match_duration, etc.)
 *   stats      {object}              — calcPlayerStats result (passes, passAccuracy, goals,
 *                                      totalXG, tackles, interceptions, passEvents,
 *                                      shotEvents, allEvents, etc.)
 *   matchInfo  {object}              — match row (match_name, match_date, home_team_id,
 *                                      away_team_id, home_team_score, away_team_score, etc.)
 *   lineup     {object[]}            — full lineup array (all players in the match)
 *   allStats   {object}              — stats keyed by player_id
 *   pitchMode  {'standard'|'futsal'} — controls pitch dimensions for canvas components
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
import { forwardRef } from 'react'
import BrutalistCard from './BrutalistCard.jsx'
import HeatMap from './HeatMap.jsx'
import RadarChart from './RadarChart.jsx'
import FutsalDistributionPitch from './FutsalDistributionPitch.jsx'
import ShotMapPitch from './ShotMapPitch.jsx'
import AveragePositionsPitch from './AveragePositionsPitch.jsx'
import ShotPlacementPitch from './ShotPlacementPitch.jsx'
import { buildRadarData } from '../utils/stats.js'

const COLOR_HOME = '#0077B6'
const COLOR_AWAY = '#D90429'

const PlayerReport = forwardRef(function PlayerReport(
  { player, stats, matchInfo, lineup, allStats, pitchMode = 'standard' },
  ref
) {
  if (!player || !stats) return null

  // Determine team color based on whether this player's team is home or away
  const isHome = player.team_id === matchInfo?.home_team_id
  const accentColor = isHome ? COLOR_HOME : COLOR_AWAY

  // Player display fields
  const playerName = player.player?.player_name ?? player.player_name ?? 'Unknown Player'
  const jerseyNumber = player.jersey_no ?? player.jersey_number ?? '—'
  const position = player.position ?? player.player?.position ?? '—'

  // Match display fields
  const matchName = matchInfo?.match_name ?? '—'
  const matchDate = matchInfo?.match_date ?? '—'

  // Radar chart data
  const radarData = buildRadarData(stats, Object.values(allStats ?? {}))

  // Assemble players prop for AveragePositionsPitch
  const avgPositionPlayers = (lineup ?? []).map((p) => ({
    playerId: p.player_id,
    name: p.player?.player_name ?? p.player_name ?? 'Unknown',
    jerseyNo: p.jersey_no ?? p.jersey_number ?? null,
    teamSide: p.team_id === matchInfo?.home_team_id ? 'home' : 'away',
    events: allStats?.[p.player_id]?.allEvents ?? [],
  }))

  // Conditional rendering flags
  const hasPassEvents = stats.passEvents?.length > 0
  const hasShotEvents = stats.shotEvents?.length > 0

  return (
    <div
      ref={ref}
      style={{
        background: 'var(--color-white)',
        fontFamily: 'monospace',
        padding: 24,
        maxWidth: 900,
        margin: '0 auto',
      }}
    >
      {/* ── 1. Header card ─────────────────────────────────────────────── */}
      {/* Requirements: 5.1 */}
      <div style={{ marginBottom: 20 }}>
        <BrutalistCard accentColor={accentColor} padding={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6, marginBottom: 4 }}>
                Player Match Report
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, textTransform: 'uppercase' }}>
                {playerName}
              </div>
              <div style={{ fontSize: 13, marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700 }}>#{jerseyNumber}</span>
                <span style={{ opacity: 0.7 }}>{position}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, textTransform: 'uppercase' }}>{matchName}</div>
              <div style={{ opacity: 0.7, marginTop: 4 }}>{matchDate}</div>
            </div>
          </div>
        </BrutalistCard>
      </div>

      {/* ── 2. Six stat tiles ──────────────────────────────────────────── */}
      {/* Requirements: 5.2 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 8,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'PASSES', value: stats.totalPasses ?? 0 },
          { label: 'PASS%', value: `${stats.passAccuracy ?? 0}%` },
          { label: 'GOALS', value: stats.goals ?? 0 },
          { label: 'XG', value: stats.totalXG ?? 0 },
          { label: 'TACKLES', value: stats.tackles ?? 0 },
          { label: 'INTERCEPTIONS', value: stats.interceptions ?? 0 },
        ].map(({ label, value }) => (
          <BrutalistCard key={label} padding={10}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
              <div
                style={{
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  opacity: 0.65,
                  marginTop: 4,
                  fontWeight: 700,
                }}
              >
                {label}
              </div>
            </div>
          </BrutalistCard>
        ))}
      </div>

      {/* ── 3. Two-column grid: HeatMap + RadarChart ───────────────────── */}
      {/* Requirements: 5.3 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <BrutalistCard title="Touch Heatmap" padding={14}>
          <HeatMap events={stats.allEvents ?? []} teamColor={accentColor} />
        </BrutalistCard>
        <BrutalistCard title="Performance Radar" padding={14}>
          <RadarChart data={radarData} teamColor={accentColor} playerName={playerName} />
        </BrutalistCard>
      </div>

      {/* ── 4. Below-grid pitch cards ──────────────────────────────────── */}
      {/* Requirements: 5.4, 5.5, 5.6 */}

      {/* FutsalDistributionPitch — only when passEvents.length > 0 */}
      {hasPassEvents && (
        <div style={{ marginBottom: 16 }}>
          <BrutalistCard title="Pass Distribution" padding={14}>
            <FutsalDistributionPitch
              events={stats.passEvents}
              pitchMode={pitchMode}
              teamColor={accentColor}
              playerName={playerName}
            />
          </BrutalistCard>
        </div>
      )}

      {/* ShotMapPitch — only when shotEvents.length > 0 */}
      {hasShotEvents && (
        <div style={{ marginBottom: 16 }}>
          <BrutalistCard title="Shot Map" padding={14}>
            <ShotMapPitch shots={stats.shotEvents} pitchMode={pitchMode} />
          </BrutalistCard>
        </div>
      )}

      {/* AveragePositionsPitch — always shown */}
      <div style={{ marginBottom: 16 }}>
        <BrutalistCard title="Average Positions" padding={14}>
          <AveragePositionsPitch players={avgPositionPlayers} pitchMode={pitchMode} />
        </BrutalistCard>
      </div>

      {/* ShotPlacementPitch — only when shotEvents.length > 0 */}
      {hasShotEvents && (
        <div style={{ marginBottom: 16 }}>
          <BrutalistCard title="Shot Placement" padding={14}>
            <ShotPlacementPitch shots={stats.shotEvents} />
          </BrutalistCard>
        </div>
      )}
    </div>
  )
})

export default PlayerReport
