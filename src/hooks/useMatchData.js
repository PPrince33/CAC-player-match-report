import { useState, useEffect } from 'react'
import { supabase, hasCredentials } from '../lib/supabase.js'
import { calcPlayerStats } from '../utils/stats.js'

export const MATCH_ID = '76818172-d262-4503-936d-603700d82576'
export const TEAM_ID  = '457b3eca-e4da-4b91-b884-8598abe46820'

function flipEvent(ev) {
  return {
    ...ev,
    start_x: ev.start_x != null ? 120 - ev.start_x : ev.start_x,
    start_y: ev.start_y != null ? 80  - ev.start_y : ev.start_y,
    end_x:   ev.end_x   != null ? 120 - ev.end_x   : null,
    end_y:   ev.end_y   != null ? 80  - ev.end_y   : null,
  }
}

/** If the event's team_direction is R2L, mirror coordinates so everything is L2R. */
function normaliseToL2R(ev) {
  return ev.team_direction === 'R2L' ? flipEvent(ev) : ev
}

export function useMatchData() {
  const [match, setMatch]       = useState(null)
  const [lineups, setLineups]   = useState([])
  const [allStats, setAllStats] = useState({})
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!hasCredentials) { setLoading(false); return }

    async function load() {
      try {
        // 1. Match info — flat fetch to avoid FK embedding path errors
        const { data: matchData, error: mErr } = await supabase
          .from('matches')
          .select('*')
          .eq('match_id', MATCH_ID)
          .single()
        if (mErr) throw mErr

        // 2. Resolve team names separately
        const teamIds = [matchData.home_team_id, matchData.away_team_id].filter(Boolean)
        const { data: teamsData } = await supabase
          .from('teams')
          .select('team_id,team_name')
          .in('team_id', teamIds)
        const teamsMap = {}
        for (const t of (teamsData || [])) teamsMap[t.team_id] = t
        matchData.home_team = teamsMap[matchData.home_team_id] || null
        matchData.away_team = teamsMap[matchData.away_team_id] || null

        // 3. Lineups — flat fetch then attach player name from separate query
        const { data: lineupData, error: lErr } = await supabase
          .from('lineups')
          .select('*')
          .eq('match_id', MATCH_ID)
          .eq('team_id', TEAM_ID)
          .order('starting_xi', { ascending: false })
        if (lErr) throw lErr

        // 4. Build player lookup
        const playerIds = [...new Set((lineupData || []).map(l => l.player_id).filter(Boolean))]
        const playerMap = {}
        if (playerIds.length > 0) {
          const { data: ps } = await supabase
            .from('players')
            .select('player_id,player_name,position,team_id')
            .in('player_id', playerIds)
          for (const p of (ps || [])) playerMap[p.player_id] = p
        }
        const enrichedLineups = (lineupData || []).map(l => ({
          ...l,
          player: playerMap[l.player_id] || null,
        }))

        // 5. Events — try match_events first, fall back to processed_match_events
        let eventData = []
        const { data: raw } = await supabase
          .from('match_events')
          .select('*')
          .eq('match_id', MATCH_ID)
          .order('match_time_seconds')

        if (raw && raw.length > 0) {
          eventData = raw
        } else {
          const { data: proc, error: procErr } = await supabase
            .from('processed_match_events')
            .select('*')
            .eq('match_id', MATCH_ID)
            .order('match_time_seconds')
          if (procErr) throw procErr
          eventData = proc || []
        }

        // 6. Filter to MKS players only, group by player
        const teamPlayerIds = new Set(playerIds)
        const byPlayer = {}
        for (const ev of eventData) {
          if (!teamPlayerIds.has(ev.player_id)) continue
          if (!byPlayer[ev.player_id]) byPlayer[ev.player_id] = []
          byPlayer[ev.player_id].push(ev)
        }

        // 7. Normalise each player's events to L2R, then compute stats
        const stats = {}
        for (const [pid, evs] of Object.entries(byPlayer)) {
          const normalised = evs.map(normaliseToL2R)
          stats[pid] = calcPlayerStats(normalised)
        }

        setMatch(matchData)
        setLineups(enrichedLineups)
        setAllStats(stats)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { match, lineups, allStats, loading, error }
}
