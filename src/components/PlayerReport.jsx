import { forwardRef, useState, useMemo } from 'react'
import HeatMap from './HeatMap.jsx'
import RadarChart from './RadarChart.jsx'
import FutsalDistributionPitch from './FutsalDistributionPitch.jsx'
import ShotMapPitch from './ShotMapPitch.jsx'
import HighlightTab from './HighlightTab.jsx'
import { buildRadarData } from '../utils/stats.js'

const TABS = ['OVERVIEW', 'PASSING & VISION', 'DEFENSIVE', 'HEATMAPS', 'HIGHLIGHTS']

const B  = '2px solid #000'
const BT = '3px solid #000'

function Module({ title, children, style = {} }) {
  return (
    <div style={{ border: BT, marginBottom: 0, ...style }}>
      {title && (
        <div style={{
          background: '#000', color: '#FFD166',
          padding: '4px 10px', fontSize: 9, fontWeight: 700,
          letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'var(--font)',
        }}>
          {title}
        </div>
      )}
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  )
}

function KPI({ label, value, sub }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '12px 8px',
        textAlign: 'center',
        background: hovered ? '#000' : '#fff',
        color: hovered ? '#FFD166' : '#000',
        cursor: 'default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font)' }}>{value}</div>
      <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 5, fontWeight: 700, fontFamily: 'var(--font)', opacity: hovered ? 0.85 : 0.65 }}>{label}</div>
      {sub != null && (
        <div style={{ fontSize: 8, marginTop: 3, opacity: 0.5, fontFamily: 'var(--font)' }}>{sub}</div>
      )}
    </div>
  )
}

function StatRow({ label, value, sub, accent }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 10px', borderBottom: B, fontFamily: 'var(--font)',
    }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, opacity: 0.75 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {sub != null && <span style={{ fontSize: 9, opacity: 0.4, fontFamily: 'var(--font)' }}>{sub}</span>}
        <span style={{ fontSize: 13, fontWeight: 700, color: accent ? '#0277B6' : '#000', minWidth: 36, textAlign: 'right' }}>{value}</span>
      </div>
    </div>
  )
}

function PercentBar({ label, made, total, color = '#0277B6' }) {
  const pct = total > 0 ? Math.round((made / total) * 100) : 0
  return (
    <div style={{ padding: '6px 10px', borderBottom: B, fontFamily: 'var(--font)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, opacity: 0.75 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700 }}>{made}/{total} <span style={{ fontSize: 9, opacity: 0.6 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 6, background: '#eee', border: '1px solid #ccc' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

const PlayerReport = forwardRef(function PlayerReport(
  { player, stats, matchInfo, lineup, allStats, compareColor, compact },
  ref
) {
  const [tab, setTab] = useState('OVERVIEW')

  if (!player || !stats) return null

  const playerName   = player.player?.player_name ?? 'Unknown Player'
  const jerseyNumber = player.jersey_no ?? '—'
  const position     = player.position ?? player.player?.position ?? '—'
  const matchName    = matchInfo?.match_name ?? '—'
  const matchDate    = matchInfo?.match_date ?? '—'
  const accentColor  = compareColor ?? '#0277B6'

  const radarData    = buildRadarData(stats, Object.values(allStats ?? {}))
  const hasPassEvents = stats.passEvents?.length > 0
  const hasShotEvents = stats.shotEvents?.length > 0

  // All team events sorted by time — used for receiver inference in pass map
  const allTeamEvents = useMemo(() => {
    return Object.entries(allStats ?? {})
      .flatMap(([pid, s]) => (s.allEvents ?? []).map(e => ({ ...e, _pid: pid })))
      .sort((a, b) => (a.match_time_seconds ?? 0) - (b.match_time_seconds ?? 0))
  }, [allStats])

  return (
    <div ref={ref} style={{ background: '#fff', fontFamily: 'var(--font)', maxWidth: compact ? '100%' : 920, margin: '0 auto', padding: compact ? 12 : 20 }}>

      {/* ── Identity Module ─────────────────────────────────── */}
      <div style={{ border: BT, marginBottom: 12, display: 'flex' }}>
        <div style={{
          background: accentColor, color: '#fff', minWidth: 70, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '12px 8px', borderRight: BT,
        }}>
          <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1 }}>{jerseyNumber}</div>
          <div style={{ fontSize: 8, letterSpacing: 1, marginTop: 4, opacity: 0.85, textTransform: 'uppercase' }}>NO.</div>
        </div>
        <div style={{ flex: 1, padding: '10px 14px' }}>
          <div style={{ fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.5, marginBottom: 3, fontWeight: 700 }}>PLAYER MATCH REPORT</div>
          <div style={{ fontSize: compact ? 18 : 24, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, lineHeight: 1.1 }}>{playerName}</div>
          <div style={{ fontSize: 10, marginTop: 5, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{position}</span>
            <span style={{ opacity: 0.5, borderLeft: B, paddingLeft: 14 }}>{matchName}</span>
            <span style={{ opacity: 0.4, borderLeft: B, paddingLeft: 14 }}>{matchDate}</span>
          </div>
        </div>
        {matchInfo?.home_team_score != null && (
          <div style={{ borderLeft: BT, padding: '10px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 80 }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3 }}>{matchInfo.home_team_score}–{matchInfo.away_team_score}</div>
            <div style={{ fontSize: 8, letterSpacing: 1, opacity: 0.4, textTransform: 'uppercase' }}>SCORE</div>
          </div>
        )}
      </div>

      {/* ── KPI Hero Stats ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 12, border: BT }}>
        {[
          { label: 'PASSES',    value: stats.totalPasses ?? 0,   sub: `${stats.passAccuracy ?? 0}% ACC` },
          { label: 'GOALS',     value: stats.goals ?? 0,          sub: `xG ${stats.totalXG ?? 0}` },
          { label: 'ASSISTS',   value: stats.assists ?? 0,        sub: `${stats.keyPasses ?? 0} KEY PASS` },
          { label: 'TACKLES',   value: stats.tackles ?? 0,       sub: `${stats.succTackles ?? 0} WON` },
          { label: 'INTERCEPT', value: stats.interceptions ?? 0, sub: null },
          { label: 'DRIBBLES',  value: stats.dribbles ?? 0,      sub: `${stats.dribbleRate ?? 0}% SUCC` },
        ].map(({ label, value, sub }, i) => (
          <div key={label} style={{ borderRight: i < 5 ? B : 'none', display: 'flex' }}>
            <KPI label={label} value={value} sub={sub} />
          </div>
        ))}
      </div>

      {/* ── Tab Nav ───────────────────────────────────────────── */}
      {!compact && (
        <div style={{ display: 'flex', borderBottom: BT, overflowX: 'auto' }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(t)} style={{
              fontFamily: 'var(--font)', fontWeight: 700, fontSize: 10, letterSpacing: 1.5,
              textTransform: 'uppercase', padding: '8px 14px', whiteSpace: 'nowrap',
              background: tab === t ? '#FFD166' : '#fff', color: '#000',
              border: 'none', borderRight: i < TABS.length - 1 ? B : 'none',
              borderBottom: tab === t ? '3px solid #FFD166' : '3px solid transparent',
              cursor: 'pointer',
            }}>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* ── Tab Content ───────────────────────────────────────── */}
      <div style={{ border: BT, borderTop: 'none' }}>

        {/* OVERVIEW */}
        {(tab === 'OVERVIEW' || compact) && (
          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 0 }}>
            <div style={{ borderRight: compact ? 'none' : B }}>
              <Module title="PERFORMANCE RADAR">
                <RadarChart data={radarData} teamColor={accentColor} playerName={playerName} />
              </Module>
            </div>
            <div>
              <Module title="SHOOTING">
                <StatRow label="Total Shots"      value={stats.totalShots ?? 0} />
                <StatRow label="Shots on Target"  value={stats.shotsOnTarget ?? 0} accent />
                <StatRow label="Goals"            value={stats.goals ?? 0} accent />
                <StatRow label="xG"               value={stats.totalXG ?? 0}   sub="expected goals" accent />
                <StatRow label="xGOT"             value={stats.totalXGOT ?? 0} sub="xg on target" />
                {(stats.totalShots ?? 0) > 0 && (
                  <StatRow label="Conversion Rate" value={`${Math.round(((stats.goals ?? 0) / stats.totalShots) * 100)}%`} />
                )}
              </Module>
              <Module title="DRIBBLING & CARRIES">
                <PercentBar label="Dribbles" made={stats.succDribbles ?? 0} total={stats.dribbles ?? 0} color={accentColor} />
                <StatRow label="Carries into Final 3rd" value={stats.carriesIntoFT ?? 0} accent />
                <StatRow label="Carries into Box"       value={stats.carriesIntoBox ?? 0} accent />
                <StatRow label="Ball Controls"          value={stats.ballControl ?? 0} />
              </Module>
            </div>
          </div>
        )}

        {/* PASSING & VISION */}
        {tab === 'PASSING & VISION' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            <div style={{ borderRight: B }}>
              <Module title="PASSING">
                <StatRow label="Total Passes" value={stats.totalPasses ?? 0} accent />
                <PercentBar label="Pass Accuracy"      made={stats.completePasses ?? 0}        total={stats.totalPasses ?? 0}  color={accentColor} />
                <PercentBar label="Progressive Passes" made={stats.successProgPasses ?? 0}     total={stats.progPasses ?? 0}   color="#09D69F" />
                <PercentBar label="Long Balls"         made={stats.successLongBalls ?? 0}      total={stats.longBalls ?? 0}    color="#888" />
                <PercentBar label="Crosses"            made={stats.successCrosses ?? 0}        total={stats.crosses ?? 0}      color={accentColor} />
                <PercentBar label="Passes into Box"    made={stats.successPassesIntoBox ?? 0}  total={stats.passesIntoBox ?? 0} color="#FFD166" />
              </Module>
              <Module title="CREATIVE">
                <StatRow label="Key Passes"          value={stats.keyPasses ?? 0} accent />
                <StatRow label="Assists"             value={stats.assists ?? 0}   accent />
                <StatRow label="Passes in Own Half"  value={stats.ownHalfPasses ?? 0} />
                <StatRow label="Passes in Opp. Half" value={stats.oppHalfPasses ?? 0} />
                <StatRow label="Incomplete Passes"   value={stats.incompletePasses ?? 0} />
              </Module>
            </div>
            <div>
              {hasPassEvents
                ? <Module title="PASS MAP" style={{ height: '100%' }}>
                    <FutsalDistributionPitch events={stats.passEvents} teamColor={accentColor} playerName={playerName} players={lineup} allTeamEvents={allTeamEvents} />
                  </Module>
                : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, opacity: 0.3, fontFamily: 'var(--font)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>NO PASS DATA</div>
              }
            </div>
          </div>
        )}

        {/* DEFENSIVE */}
        {tab === 'DEFENSIVE' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            <div style={{ borderRight: B }}>
              <Module title="TACKLING">
                <StatRow label="Total Tackles"            value={stats.tackles ?? 0} />
                <StatRow label="Successful"               value={stats.succTackles ?? 0} accent />
                <StatRow label="With Possession"          value={stats.tackleRegain ?? 0} accent />
                <PercentBar label="Success Rate" made={stats.succTackles ?? 0} total={stats.tackles ?? 0} color={accentColor} />
              </Module>
              <Module title="INTERCEPTIONS">
                <StatRow label="Total Interceptions"      value={stats.interceptions ?? 0} accent />
                <StatRow label="With Possession Regained" value={stats.intRegain ?? 0} accent />
              </Module>
              <Module title="DUELS & PRESSURE">
                <StatRow label="Aerial Duels Won"  value={stats.aerialDuels ?? 0} accent />
                <StatRow label="Pressures Applied" value={stats.pressures ?? 0} />
                <StatRow label="Blocks"            value={stats.blocks ?? 0} />
                <StatRow label="Clearances"        value={stats.clearances ?? 0} />
              </Module>
            </div>
            <div>
              <Module title="DEFENSIVE SUMMARY">
                <StatRow label="Total Defensive Actions" value={(stats.tackles ?? 0) + (stats.interceptions ?? 0) + (stats.blocks ?? 0) + (stats.clearances ?? 0)} accent />
                <StatRow label="Saves" value={stats.saves ?? 0} />
              </Module>
            </div>
          </div>
        )}

        {/* HEATMAPS */}
        {tab === 'HEATMAPS' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            <div style={{ borderRight: B }}>
              <Module title="TOUCH HEATMAP">
                <HeatMap events={stats.allEvents ?? []} teamColor={accentColor} />
              </Module>
            </div>
            <div>
              {hasShotEvents
                ? <Module title="SHOT MAP">
                    <ShotMapPitch shots={stats.shotEvents} />
                  </Module>
                : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, opacity: 0.3, fontFamily: 'var(--font)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>NO SHOTS</div>
              }
            </div>
          </div>
        )}

        {/* HIGHLIGHTS */}
        {tab === 'HIGHLIGHTS' && (
          <HighlightTab events={stats.allEvents ?? []} playerName={playerName} videoUrl={matchInfo?.video_url ?? null} />
        )}

        {/* COMPACT: heatmap inline */}
        {compact && (
          <Module title="TOUCH HEATMAP">
            <HeatMap events={stats.allEvents ?? []} teamColor={accentColor} />
          </Module>
        )}
      </div>
    </div>
  )
})

export default PlayerReport
