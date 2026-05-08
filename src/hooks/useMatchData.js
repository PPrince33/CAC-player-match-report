import { useState, useEffect } from 'react'
import { supabase, hasCredentials } from '../lib/supabase.js'
import { calcPlayerStats } from '../utils/stats.js'

export const MATCH_IDS = [
  '76818172-d262-4503-936d-603700d82576',
  'd2b2a013-9b2f-4d3f-8603-a3d1943ee243',
]
export const TEAM_ID = '457b3eca-e4da-4b91-b884-8598abe46820'

function flipEvent(ev) {
  return {
    ...ev,
    start_x: ev.start_x != null ? 120 - ev.start_x : ev.start_x,
    start_y: ev.start_y != null ? 80  - ev.start_y : ev.start_y,
    end_x:   ev.end_x   != null ? 120 - ev.end_x   : null,
    end_y:   ev.end_y   != null ? 80  - ev.end_y   : null,
  }
}

function medianX(evs) {
  const xs = evs.map(e => e.start_x).filter(x => x != null)
  if (xs.length === 0) return 60   // neutral — don't flip
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * Normalise all events for one team in one match so they all attack L→R.
 *
 * Teams swap ends at half-time, so we treat each half independently.
 * Boundary: 45 min (2700 s). If the recording system resets the clock for
 * the second half every event will be < 2700 s and H2 will be empty —
 * in that case we fall back to treating the whole match as one period.
 *
 * For each period: if the median start_x of all team events > 60 the team
 * was attacking R→L → flip those events to L→R.
 */
function normaliseMatchToL2R(events) {
  if (events.length === 0) return events

  const HALF = 2700   // 45 minutes in seconds
  const H1 = events.filter(e => (e.match_time_seconds ?? 0) <= HALF)
  const H2 = events.filter(e => (e.match_time_seconds ?? 0) >  HALF)

  // If there is no second-half data, treat the whole match as one period
  if (H2.length === 0) {
    return medianX(H1) > 60 ? events.map(flipEvent) : events
  }

  const flipH1 = medianX(H1) > 60
  const flipH2 = medianX(H2) > 60

  return [
    ...(flipH1 ? H1.map(flipEvent) : H1),
    ...(flipH2 ? H2.map(flipEvent) : H2),
  ]
}

export function useMatchData() {
  const [matches, setMatches]               = useState([])
  const [allLineups, setAllLineups]         = useState([])
  const [lineupsByMatch, setLineupsByMatch] = useState({})
  const [aggregatedStats, setAggregatedStats] = useState({})
  const [statsByMatch, setStatsByMatch]     = useState({})
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)

  useEffect(() => {
    if (!hasCredentials) { setLoading(false); return }

    async function load() {
      try {
        // 1. Fetch all match info in parallel
        const matchResults = await Promise.all(
          MATCH_IDS.map(mid =>
            supabase.from('matches').select('*').eq('match_id', mid).single()
          )
        )

        // 2. Resolve team names
        const allTeamIds = [...new Set(
          matchResults.flatMap(r => [r.data?.home_team_id, r.data?.away_team_id].filter(Boolean))
        )]
        const { data: teamsData } = await supabase
          .from('teams').select('team_id,team_name').in('team_id', allTeamIds)
        const teamsMap = {}
        for (const t of (teamsData || [])) teamsMap[t.team_id] = t

        const matchesData = matchResults
          .map(r => r.data)
          .filter(Boolean)
          .map(m => ({
            ...m,
            home_team: teamsMap[m.home_team_id] || null,
            away_team: teamsMap[m.away_team_id] || null,
          }))

        // 3. Fetch lineups for all matches in one query
        const { data: lineupData, error: lErr } = await supabase
          .from('lineups')
          .select('*')
          .eq('team_id', TEAM_ID)
          .in('match_id', MATCH_IDS)
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

        // ── Build canonical player identity: same name+jersey = same player ──
        // A player can have different player_id values across matches if re-registered.
        // We use "normalised_name__jersey" as the stable key and pick the first
        // player_id encountered as the canonical one.
        const playerKey = (l) => {
          const name = (l.player?.player_name ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
          return `${name}__${l.jersey_no ?? ''}`
        }
        const keyToCanonicalId = {}   // key → canonical player_id
        const idToCanonicalId  = {}   // any player_id → canonical player_id
        for (const l of enrichedLineups) {
          const k = playerKey(l)
          if (!keyToCanonicalId[k]) keyToCanonicalId[k] = l.player_id
          idToCanonicalId[l.player_id] = keyToCanonicalId[k]
        }

        // Re-map each lineup entry's player_id to canonical
        const canonicalLineups = enrichedLineups.map(l => ({
          ...l,
          player_id: idToCanonicalId[l.player_id] ?? l.player_id,
        }))

        // Group lineups by match_id (using canonical IDs)
        const lByMatch = {}
        for (const l of canonicalLineups) {
          if (!lByMatch[l.match_id]) lByMatch[l.match_id] = []
          lByMatch[l.match_id].push(l)
        }

        // Union lineup — dedupe by canonical player_id, prefer starting_xi=true
        const seenPlayers = new Map()
        for (const l of canonicalLineups) {
          if (!seenPlayers.has(l.player_id) || l.starting_xi) {
            seenPlayers.set(l.player_id, l)
          }
        }
        const unionLineups = [...seenPlayers.values()]
          .sort((a, b) => (b.starting_xi ? 1 : 0) - (a.starting_xi ? 1 : 0))

        // 5. Fetch events for all matches
        const teamPlayerIdSet = new Set(playerIds)  // original IDs for filtering

        const { data: rawEvents } = await supabase
          .from('match_events')
          .select('*')
          .in('match_id', MATCH_IDS)
          .order('match_time_seconds')

        let eventData = rawEvents
        if (!eventData || eventData.length === 0) {
          const { data: proc, error: procErr } = await supabase
            .from('processed_match_events')
            .select('*')
            .in('match_id', MATCH_IDS)
            .order('match_time_seconds')
          if (procErr) throw procErr
          eventData = proc || []
        }

        // 6. Collect raw team events per match (before normalisation)
        const rawByMatch = {}   // match_id → events[]
        for (const ev of eventData) {
          if (!teamPlayerIdSet.has(ev.player_id)) continue
          if (!rawByMatch[ev.match_id]) rawByMatch[ev.match_id] = []
          rawByMatch[ev.match_id].push(ev)
        }

        // Normalise each match's events to L→R using per-half median detection,
        // then re-group by canonical player_id.
        const eventsByMatchByPlayer = {}
        for (const [mid, matchEvs] of Object.entries(rawByMatch)) {
          const normalised = normaliseMatchToL2R(matchEvs)
          for (const ev of normalised) {
            const canonPid = idToCanonicalId[ev.player_id] ?? ev.player_id
            const normEv   = { ...ev, player_id: canonPid }
            if (!eventsByMatchByPlayer[mid]) eventsByMatchByPlayer[mid] = {}
            if (!eventsByMatchByPlayer[mid][canonPid]) eventsByMatchByPlayer[mid][canonPid] = []
            eventsByMatchByPlayer[mid][canonPid].push(normEv)
          }
        }

        // 7. Stats per match
        const sByMatch = {}
        for (const [mid, byPlayer] of Object.entries(eventsByMatchByPlayer)) {
          sByMatch[mid] = {}
          for (const [pid, evs] of Object.entries(byPlayer)) {
            sByMatch[mid][pid] = calcPlayerStats(evs)
          }
        }

        // 8. Aggregated stats — combine events across all matches per player
        const allEventsByPlayer = {}
        const matchesPlayedByPlayer = {}   // canonicalId → number of matches with events
        for (const [mid, byPlayer] of Object.entries(eventsByMatchByPlayer)) {
          for (const [pid, evs] of Object.entries(byPlayer)) {
            if (!allEventsByPlayer[pid]) allEventsByPlayer[pid] = []
            allEventsByPlayer[pid].push(...evs)
            matchesPlayedByPlayer[pid] = (matchesPlayedByPlayer[pid] ?? 0) + 1
          }
        }
        const aggStats = {}
        for (const [pid, evs] of Object.entries(allEventsByPlayer)) {
          aggStats[pid] = { ...calcPlayerStats(evs), matchesPlayed: matchesPlayedByPlayer[pid] ?? 1 }
        }

        setMatches(matchesData)
        setAllLineups(unionLineups)
        setLineupsByMatch(lByMatch)
        setStatsByMatch(sByMatch)
        setAggregatedStats(aggStats)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { matches, allLineups, lineupsByMatch, aggregatedStats, statsByMatch, loading, error }
}
