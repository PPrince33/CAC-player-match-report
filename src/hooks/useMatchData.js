import { useState, useEffect } from 'react'
import { supabase, hasCredentials } from '../lib/supabase.js'
import { calcPlayerStats } from '../utils/stats.js'

const MATCH_ID = '76818172-d262-4503-936d-603700d82576'

export function useMatchData() {
  const [match, setMatch] = useState(null)
  const [lineups, setLineups] = useState([])
  const [allStats, setAllStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!hasCredentials) { setLoading(false); return }
    async function load() {
      try {
        // 1. Match info + teams
        const { data: matchData, error: mErr } = await supabase
          .from('matches')
          .select(`
            *,
            home_team:teams!home_team_id(team_id, team_name),
            away_team:teams!away_team_id(team_id, team_name)
          `)
          .eq('match_id', MATCH_ID)
          .single()
        if (mErr) throw mErr

        // 2. Lineups with player names + team
        const { data: lineupData, error: lErr } = await supabase
          .from('lineups')
          .select(`
            *,
            player:players(player_id, player_name, position),
            team:teams(team_id, team_name)
          `)
          .eq('match_id', MATCH_ID)
          .order('starting_xi', { ascending: false })
        if (lErr) throw lErr

        // 3. All processed events
        const { data: eventData, error: eErr } = await supabase
          .from('processed_match_events')
          .select(`
            *,
            player:players!player_id(player_id, player_name, team_id,
              team:teams(team_id, team_name)
            ),
            reaction_player:players!reaction_player_id(player_id, player_name)
          `)
          .eq('match_id', MATCH_ID)
          .order('match_time_seconds')
        if (eErr) throw eErr

        // 4. Group events by player_id
        const byPlayer = {}
        for (const ev of eventData) {
          const pid = ev.player_id
          if (!byPlayer[pid]) byPlayer[pid] = []
          byPlayer[pid].push(ev)
        }

        // 5. Pre-calculate stats for every player
        const stats = {}
        for (const [pid, evs] of Object.entries(byPlayer)) {
          stats[pid] = calcPlayerStats(evs)
        }

        setMatch(matchData)
        setLineups(lineupData || [])
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
