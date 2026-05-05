import { useState, useEffect } from 'react'
import { supabase, hasCredentials } from '../lib/supabase.js'
import { calcPlayerStats } from '../utils/stats.js'

export const MATCH_ID = '76818172-d262-4503-936d-603700d82576'
export const TEAM_ID  = '457b3eca-e4da-4b91-b884-8598abe46820'

export function useMatchData() {
  const [match, setMatch]     = useState(null)
  const [lineups, setLineups] = useState([])
  const [allStats, setAllStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!hasCredentials) { setLoading(false); return }

    async function load() {
      try {
        // 1. Match info
        const { data: matchData, error: mErr } = await supabase
          .from('matches')
          .select('*, home_team:teams!home_team_id(team_id,team_name), away_team:teams!away_team_id(team_id,team_name)')
          .eq('match_id', MATCH_ID)
          .single()
        if (mErr) throw mErr

        // 2. Lineups — only the target team
        const { data: lineupData, error: lErr } = await supabase
          .from('lineups')
          .select('*, player:players(player_id,player_name,position), team:teams(team_id,team_name)')
          .eq('match_id', MATCH_ID)
          .eq('team_id', TEAM_ID)
          .order('starting_xi', { ascending: false })
        if (lErr) throw lErr

        // 3. Events — try match_events first, fall back to processed_match_events
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

        // 5. Only keep events for MKS players
        const teamPlayerIds = new Set(playerIds)
        const teamEvents = eventData.filter(ev => teamPlayerIds.has(ev.player_id))

        // 6. Group & compute stats per player
        const byPlayer = {}
        for (const ev of teamEvents) {
          if (!byPlayer[ev.player_id]) byPlayer[ev.player_id] = []
          byPlayer[ev.player_id].push(ev)
        }
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
