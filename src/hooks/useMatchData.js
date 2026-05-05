import { useState, useEffect } from 'react'
import { supabase, hasCredentials } from '../lib/supabase.js'
import { calcPlayerStats } from '../utils/stats.js'

export function useAllMatches() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hasCredentials) { setLoading(false); return }
    supabase
      .from('matches')
      .select('match_id, match_name, match_date, home_team_score, away_team_score, home_team:teams!home_team_id(team_name), away_team:teams!away_team_id(team_name)')
      .order('match_date', { ascending: false })
      .then(({ data }) => { setMatches(data || []); setLoading(false) })
  }, [])

  return { matches, loading }
}

export function useMatchData(matchId) {
  const [match, setMatch] = useState(null)
  const [lineups, setLineups] = useState([])
  const [allStats, setAllStats] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [eventSource, setEventSource] = useState(null)

  useEffect(() => {
    if (!hasCredentials || !matchId) return
    setLoading(true)
    setError(null)
    setAllStats({})
    setLineups([])
    setMatch(null)

    async function load() {
      try {
        // 1. Match info
        const { data: matchData, error: mErr } = await supabase
          .from('matches')
          .select('*, home_team:teams!home_team_id(team_id, team_name), away_team:teams!away_team_id(team_id, team_name)')
          .eq('match_id', matchId)
          .single()
        if (mErr) throw mErr

        // 2. Lineups
        const { data: lineupData, error: lErr } = await supabase
          .from('lineups')
          .select('*, player:players(player_id, player_name, position), team:teams(team_id, team_name)')
          .eq('match_id', matchId)
          .order('starting_xi', { ascending: false })
        if (lErr) throw lErr

        // 3. Try match_events first, fall back to processed_match_events
        let eventData = null
        let usedTable = ''

        const { data: raw, error: rawErr } = await supabase
          .from('match_events')
          .select('*')
          .eq('match_id', matchId)
          .order('match_time_seconds')

        if (!rawErr && raw && raw.length > 0) {
          eventData = raw
          usedTable = 'match_events'
        } else {
          const { data: proc, error: procErr } = await supabase
            .from('processed_match_events')
            .select('*')
            .eq('match_id', matchId)
            .order('match_time_seconds')
          if (procErr) throw procErr
          eventData = proc || []
          usedTable = 'processed_match_events'
        }

        // 4. Build player lookup from lineups
        const allPlayerIds = [...new Set((lineupData || []).map(l => l.player_id).filter(Boolean))]
        const playerMap = {}
        if (allPlayerIds.length > 0) {
          const { data: playersData } = await supabase
            .from('players')
            .select('player_id, player_name, position, team_id, team:teams(team_id, team_name)')
            .in('player_id', allPlayerIds)
          for (const p of (playersData || [])) playerMap[p.player_id] = p
        }

        // 5. Group events by player_id and compute stats
        const byPlayer = {}
        for (const ev of (eventData || [])) {
          const pid = ev.player_id
          if (!pid) continue
          if (!byPlayer[pid]) byPlayer[pid] = []
          byPlayer[pid].push(ev)
        }

        const stats = {}
        for (const [pid, evs] of Object.entries(byPlayer)) {
          stats[pid] = calcPlayerStats(evs)
        }

        setMatch(matchData)
        setLineups(lineupData || [])
        setAllStats(stats)
        setEventSource(usedTable)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [matchId])

  return { match, lineups, allStats, loading, error, eventSource }
}
