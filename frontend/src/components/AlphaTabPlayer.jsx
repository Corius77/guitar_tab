import { useEffect, useRef, useState } from 'react'
import './AlphaTabPlayer.css'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import RecordingPanel from './RecordingPanel'
import { useAuth } from '../context/AuthContext'
import { startSession, endSession, getSavedLoops, createSavedLoop, deleteSavedLoop } from '../api/practice'

const BPM_MIN = 20
const BPM_MAX = 300
const ALPHATAB_METRONOME_EVENT_TYPE = 242

// ── Web Audio metronome ────────────────────────────────────────────────────
// `when` (opcjonalne) — czas audioCtx, na który zaplanować klik (sec).
function playClick(audioCtx, isAccent, volume, when) {
  if (!audioCtx) return
  if (audioCtx.state === 'suspended') audioCtx.resume()

  const startAt = when ?? audioCtx.currentTime
  const duration = isAccent ? 0.06 : 0.045
  const freq = isAccent ? 1050 : 580
  const gainPeak = volume * (isAccent ? 1.0 : 0.55)

  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  osc.type = isAccent ? 'triangle' : 'sine'
  osc.frequency.setValueAtTime(freq, startAt)
  osc.frequency.exponentialRampToValueAtTime(freq * 0.4, startAt + duration)

  gain.gain.setValueAtTime(gainPeak, startAt)
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration)

  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start(startAt)
  osc.stop(startAt + duration + 0.005)
}

// ── Pamięć ostatnio wybranej ścieżki dla utworu ─────────────────────────────
// Zapis: number = indeks ścieżki, null = 'all'. Brak klucza → użyj domyślnej.
const TRACK_STORAGE_KEY = 'guitarTab.selectedTrackBySong'

// Zwraca { value: number | null } gdy istnieje wpis, albo null gdy brak.
function loadSavedTrackIndex(songId) {
  try {
    const raw = localStorage.getItem(TRACK_STORAGE_KEY)
    if (!raw) return null
    const map = JSON.parse(raw)
    const key = String(songId)
    if (!(key in map)) return null
    const v = map[key]
    if (v === null) return { value: null }
    if (typeof v === 'number' && v >= 0) return { value: v }
    return null
  } catch {
    return null
  }
}

function saveTrackIndex(songId, idx) {
  try {
    const raw = localStorage.getItem(TRACK_STORAGE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[String(songId)] = idx
    localStorage.setItem(TRACK_STORAGE_KEY, JSON.stringify(map))
  } catch {}
}

// ── Component ──────────────────────────────────────────────────────────────
export default function AlphaTabPlayer({ fileUrl, songId, onStatsChange }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const originalBpmRef = useRef(null)
  const metronomeOnRef = useRef(false)
  const metronomeVolumeRef = useRef(1)
  const audioCtxRef = useRef(null)

  // Bar positions: array of { index: number, start: number (tick) }
  const barPositionsRef = useRef([])

  // Refy do użycia w handlerze klawiszy (bez stale closures)
  const readyRef = useRef(false)
  const bpmRef = useRef(null)
  const masterVolumeRef = useRef(1)
  const loopOnRef = useRef(false)
  const loopStartRef = useRef(1)
  const loopEndRef = useRef(1)
  const totalBarsRef = useRef(0)
  // Refy na funkcje — aktualizowane przy każdym renderze
  const applyBpmRef = useRef(null)
  const getAudioCtxRef = useRef(null)
  const toggleLoopRef = useRef(null)
  const clearLoopRef = useRef(null)
  const applyLoopRangeRef = useRef(null)

  // Drag-to-select na tabulaturze
  const dragStartBarRef = useRef(null)

  // Aktualnie grany takt (1-indexed) — używany do pętli "od bieżącego taktu"
  const currentBarRef = useRef(0)

  // Standalone metronome — działa gdy utwór NIE jest odtwarzany (gdy gra,
  // klikanie sterowane jest eventami MIDI z alphaTab, by zachować synchronizację).
  const standaloneTimerRef = useRef(null)
  const standaloneNextBeatTimeRef = useRef(0)
  const standaloneBeatCounterRef = useRef(0)
  const timeSigNumeratorRef = useRef(4)

  // Ścieżki (tracki) pliku GP
  const scoreRef = useRef(null)

  // ── Śledzenie sesji ────────────────────────────────────────────────────────
  const { user } = useAuth()
  const sessionIdRef = useRef(null)         // id aktywnej sesji backendu
  const playingRef = useRef(false)          // czy aktualnie gra
  const sessionStartedRef = useRef(false)   // czy sesja została już wystartowana
  const loopCountsRef = useRef({})          // klucz "start-end" → liczba pętli
  const lastPositionRef = useRef(0)         // poprzedni currentTime (ms)

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const [masterVolume, setMasterVolume] = useState(1)
  const [bpm, setBpm] = useState(null)
  const [bpmInput, setBpmInput] = useState('')
  const [metronomeOn, setMetronomeOn] = useState(false)
  const [metronomeVolume, setMetronomeVolume] = useState(1)

  // Modal skrótów
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Loop — zakres taktów (1-indexed)
  const [totalBars, setTotalBars] = useState(0)
  const [loopStart, setLoopStart] = useState(1)
  const [loopEnd, setLoopEnd] = useState(1)
  const [loopOn, setLoopOn] = useState(false)

  // Zapisane pętle
  const [savedLoops, setSavedLoops] = useState([])
  const [showSavedLoops, setShowSavedLoops] = useState(false)
  const [saveLoopName, setSaveLoopName] = useState('')
  const [savingLoop, setSavingLoop] = useState(false)
  const [saveLoopError, setSaveLoopError] = useState('')

  // Ścieżki pliku GP
  const [tracks, setTracks] = useState([])
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(null) // null = wszystkie

  useEffect(() => { metronomeOnRef.current = metronomeOn }, [metronomeOn])
  useEffect(() => { metronomeVolumeRef.current = metronomeVolume }, [metronomeVolume])
  useEffect(() => { readyRef.current = ready }, [ready])
  useEffect(() => { bpmRef.current = bpm }, [bpm])
  useEffect(() => { masterVolumeRef.current = masterVolume }, [masterVolume])
  useEffect(() => { loopOnRef.current = loopOn }, [loopOn])
  useEffect(() => { loopStartRef.current = loopStart }, [loopStart])
  useEffect(() => { loopEndRef.current = loopEnd }, [loopEnd])
  useEffect(() => { totalBarsRef.current = totalBars }, [totalBars])

  // ── Zakończenie sesji (fire-and-forget) ───────────────────────────────────
  const buildSessionPayload = () => {
    const loopEvents = Object.entries(loopCountsRef.current)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => {
        const [s, e] = key.split('-').map(Number)
        return { measure_start: s, measure_end: e, loop_count: count }
      })
    loopCountsRef.current = {}
    return {
      ended_at: new Date().toISOString(),
      bpm_percent: originalBpmRef.current && bpmRef.current
        ? Math.round((bpmRef.current / originalBpmRef.current) * 100)
        : null,
      total_bars: totalBarsRef.current || null,
      loop_events: loopEvents,
    }
  }

  const endCurrentSession = () => {
    if (!sessionIdRef.current) return
    const id = sessionIdRef.current
    sessionIdRef.current = null
    sessionStartedRef.current = false

    endSession(id, buildSessionPayload())
      .then(() => { onStatsChange?.() })
      .catch(() => {})
  }

  // Wystartuj sesję ćwiczeń (idempotentne) — wywoływane gdy użytkownik
  // zaczyna odtwarzanie LUB włącza metronom. Liczy wall-clock od tego momentu.
  const startSessionIfNeeded = () => {
    if (sessionStartedRef.current) return
    if (!user || !songId) return
    sessionStartedRef.current = true
    startSession(songId)
      .then(({ data }) => { sessionIdRef.current = data.id })
      .catch(() => { sessionStartedRef.current = false })
  }
  const startSessionIfNeededRef = useRef(startSessionIfNeeded)
  startSessionIfNeededRef.current = startSessionIfNeeded

  // beforeunload: axios nie dotrze do serwera — używamy fetch z keepalive
  useEffect(() => {
    const handler = () => {
      if (!sessionIdRef.current) return
      const id = sessionIdRef.current
      sessionIdRef.current = null
      sessionStartedRef.current = false

      const token = localStorage.getItem('access')
      fetch(`/api/practice/sessions/${id}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(buildSessionPayload()),
        keepalive: true,
      }).catch(() => {})
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy AudioContext – tworzone przy pierwszym kliknięciu metronomu
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return audioCtxRef.current
  }
  getAudioCtxRef.current = getAudioCtx

  useEffect(() => {
    if (!fileUrl || !containerRef.current) return
    let destroyed = false

    const initAlphaTab = async () => {
      try {
        setLoading(true)
        setError('')
        setReady(false)
        setBpm(null)
        setBpmInput('')
        setMetronomeOn(false)
        metronomeOnRef.current = false
        setLoopOn(false)
        setLoopStart(1)
        setLoopEnd(1)
        setTotalBars(0)
        barPositionsRef.current = []
        originalBpmRef.current = null
        sessionIdRef.current = null
        sessionStartedRef.current = false
        loopCountsRef.current = {}
        lastPositionRef.current = 0
        playingRef.current = false
        currentBarRef.current = 0
        setTracks([])
        setSelectedTrackIndex(null)
        scoreRef.current = null

        const { AlphaTabApi } = await import('@coderline/alphatab')
        if (destroyed) return

        if (apiRef.current) {
          try { apiRef.current.destroy() } catch {}
          apiRef.current = null
        }
        containerRef.current.innerHTML = ''

        const at = new AlphaTabApi(containerRef.current, {
          core: { useWorkers: true },
          player: {
            enablePlayer: true,
            enableCursor: true,
            enableUserInteraction: true,
            soundFont: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/soundfont/sonivox.sf2',
          },
          display: { layoutMode: 0, staveProfile: 1 },
        })

        at.metronomeVolume = 0
        at.midiEventsPlayedFilter = [ALPHATAB_METRONOME_EVENT_TYPE]

        at.midiEventsPlayed.on((e) => {
          if (destroyed || !metronomeOnRef.current) return
          for (const event of e.events) {
            if (event.type !== ALPHATAB_METRONOME_EVENT_TYPE) continue
            const isAccent = event.metronomeNumerator === 0
            playClick(audioCtxRef.current, isAccent, metronomeVolumeRef.current)
          }
        })

        apiRef.current = at

        at.playerStateChanged.on((e) => {
          if (destroyed) return
          const isPlaying = e.state === 1
          setPlaying(isPlaying)
          playingRef.current = isPlaying

          // Auto-start sesji przy pierwszym Play
          if (isPlaying) startSessionIfNeededRef.current()
        })

        at.playerPositionChanged.on((e) => {
          if (destroyed) return
          setCurrentTime(e.currentTime)
          setEndTime(e.endTime)

          // Aktualizuj aktualnie grany takt na podstawie ticka
          const tick = e.currentTick
          if (tick != null) {
            const bars = barPositionsRef.current
            for (let i = bars.length - 1; i >= 0; i--) {
              if (tick >= bars[i].start) {
                currentBarRef.current = i + 1
                break
              }
            }
          }

          // Wykryj przewinięcie pętli (currentTime skacze wstecz)
          const curr = e.currentTime
          const prev = lastPositionRef.current
          if (loopOnRef.current && playingRef.current && curr < prev - 300) {
            const key = `${loopStartRef.current}-${loopEndRef.current}`
            loopCountsRef.current[key] = (loopCountsRef.current[key] || 0) + 1
          }
          lastPositionRef.current = curr
        })

        at.renderFinished.on(() => { if (!destroyed) setLoading(false) })

        at.scoreLoaded.on((score) => {
          if (destroyed) return
          const tempo = score?.tempo ?? 120
          originalBpmRef.current = tempo
          setBpm(tempo)
          setBpmInput(String(tempo))

          // Wyciągnij pozycje taktów
          const bars = []
          if (score?.masterBars) {
            for (let i = 0; i < score.masterBars.length; i++) {
              bars.push({ index: i, start: score.masterBars[i].start })
            }
          }
          // Numerator z pierwszego taktu — dla akcentu w trybie standalone metronomu
          timeSigNumeratorRef.current = score?.masterBars?.[0]?.timeSignatureNumerator || 4
          barPositionsRef.current = bars
          const count = bars.length
          setTotalBars(count)
          setLoopStart(1)
          setLoopEnd(count)

          // Zapisz ścieżki; przy wielu ścieżkach renderuj zapamiętaną lub pierwszą
          scoreRef.current = score
          if (score?.tracks?.length > 1) {
            setTracks([...score.tracks])
            const saved = songId != null ? loadSavedTrackIndex(songId) : null
            if (saved && saved.value === null) {
              setSelectedTrackIndex(null)
              at.renderTracks(score.tracks)
            } else {
              const idx = saved && saved.value >= 0 && saved.value < score.tracks.length
                ? saved.value
                : 0
              setSelectedTrackIndex(idx)
              at.renderTracks([score.tracks[idx]])
            }
          } else {
            setTracks(score?.tracks ? [...score.tracks] : [])
            setSelectedTrackIndex(null)
          }

          setReady(true)
        })

        at.error.on((e) => {
          if (!destroyed) {
            setError(`AlphaTab error: ${e.message ?? e}`)
            setLoading(false)
          }
        })

        // ── Wybór zakresu pętli kliknięciem/dragiem na tabulaturze ──────────
        at.beatMouseDown.on((beat) => {
          if (destroyed || !beat) return
          const bar = beat.voice.bar.index + 1
          dragStartBarRef.current = bar
          setLoopStart(bar)
          setLoopEnd(bar)
          loopStartRef.current = bar
          loopEndRef.current = bar
        })

        at.beatMouseMove.on((beat) => {
          if (destroyed || !beat || dragStartBarRef.current === null) return
          const bar = beat.voice.bar.index + 1
          const start = Math.min(dragStartBarRef.current, bar)
          const end   = Math.max(dragStartBarRef.current, bar)
          setLoopStart(start)
          setLoopEnd(end)
          loopStartRef.current = start
          loopEndRef.current   = end
        })

        at.beatMouseUp.on(() => {
          if (destroyed || dragStartBarRef.current === null) return
          dragStartBarRef.current = null
        })

        at.load(fileUrl)
      } catch (e) {
        if (!destroyed) {
          setError(`Failed to initialize player: ${e.message}`)
          setLoading(false)
        }
      }
    }

    initAlphaTab()

    return () => {
      destroyed = true
      endCurrentSession()
      if (apiRef.current) {
        try { apiRef.current.destroy() } catch {}
        apiRef.current = null
      }
    }
  }, [fileUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      // Nie reaguj gdy fokus jest na polu tekstowym / liczby / select
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const key = e.key

      // Escape zamyka modal niezależnie od stanu gotowości
      if (key === 'Escape') { setShowShortcuts(false); return }
      // ? otwiera/zamyka modal niezależnie od stanu gotowości
      if (key === '?') { setShowShortcuts(prev => !prev); return }

      if (!readyRef.current) return

      switch (key) {
        // ── Odtwarzanie ──────────────────────────────────────────────
        case ' ':
          e.preventDefault()
          apiRef.current?.playPause()
          break

        case 's':
        case 'S':
          apiRef.current?.stop()
          break

        // ── BPM ──────────────────────────────────────────────────────
        case '=':
        case '+':
          e.preventDefault()
          applyBpmRef.current((bpmRef.current ?? 120) + (e.shiftKey ? 1 : 5))
          break

        case '-':
        case '_':
          e.preventDefault()
          applyBpmRef.current((bpmRef.current ?? 120) - (e.shiftKey ? 1 : 5))
          break

        case 'r':
        case 'R':
          if (originalBpmRef.current) applyBpmRef.current(originalBpmRef.current)
          break

        // ── Głośność ─────────────────────────────────────────────────
        case 'ArrowUp':
          if (!e.shiftKey) {
            e.preventDefault()
            const newVol = Math.min(1, masterVolumeRef.current + 0.05)
            setMasterVolume(newVol)
            if (apiRef.current) apiRef.current.masterVolume = newVol
          }
          break

        case 'ArrowDown':
          if (!e.shiftKey) {
            e.preventDefault()
            const newVol = Math.max(0, masterVolumeRef.current - 0.05)
            setMasterVolume(newVol)
            if (apiRef.current) apiRef.current.masterVolume = newVol
          }
          break

        // ── Metronom ─────────────────────────────────────────────────
        case 'm':
        case 'M': {
          const next = !metronomeOnRef.current
          if (next) {
            getAudioCtxRef.current()
            startSessionIfNeededRef.current()
          }
          setMetronomeOn(next)
          metronomeOnRef.current = next
          break
        }

        // ── Pętla — toggle / clear ────────────────────────────────────
        case 'l':
        case 'L':
          toggleLoopRef.current()
          break

        case 'x':
        case 'X':
          clearLoopRef.current()
          break

        // ── Pętla — sterowanie zakresem ───────────────────────────────
        // [ / ] → loopStart ±1
        case '[':
          if (totalBarsRef.current > 0)
            setLoopStart(prev => Math.max(1, prev - 1))
          break

        case ']':
          if (totalBarsRef.current > 0)
            setLoopStart(prev => Math.min(loopEndRef.current, prev + 1))
          break

        // Shift+[ = { / Shift+] = } → loopEnd ±1
        case '{':
          if (totalBarsRef.current > 0)
            setLoopEnd(prev => Math.max(loopStartRef.current, prev - 1))
          break

        case '}':
          if (totalBarsRef.current > 0)
            setLoopEnd(prev => Math.min(totalBarsRef.current, prev + 1))
          break

        default:
          break
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── BPM ──────────────────────────────────────────────────────────────────
  const applyBpm = (newBpm) => {
    const clamped = Math.max(BPM_MIN, Math.min(BPM_MAX, newBpm))
    setBpm(clamped)
    setBpmInput(String(clamped))
    if (apiRef.current && originalBpmRef.current) {
      apiRef.current.playbackSpeed = clamped / originalBpmRef.current
    }
    return clamped
  }
  applyBpmRef.current = applyBpm

  const handleBpmSlider = (e) => applyBpm(parseInt(e.target.value, 10))
  const handleBpmInput = (e) => setBpmInput(e.target.value)
  const handleBpmCommit = () => {
    const parsed = parseInt(bpmInput, 10)
    if (!isNaN(parsed)) applyBpm(parsed)
    else setBpmInput(String(bpm))
  }
  const handleBpmKey = (e) => {
    if (e.key === 'Enter') handleBpmCommit()
    if (e.key === 'ArrowUp') applyBpm((bpm ?? 120) + 1)
    if (e.key === 'ArrowDown') applyBpm((bpm ?? 120) - 1)
  }
  const stepBpm = (delta) => applyBpm((bpm ?? 120) + delta)
  const resetBpm = () => { if (originalBpmRef.current) applyBpm(originalBpmRef.current) }

  // ── Track selection ───────────────────────────────────────────────────────
  const handleTrackChange = (e) => {
    const at = apiRef.current
    const score = scoreRef.current
    if (!at || !score) return
    const val = e.target.value
    if (val === 'all') {
      setSelectedTrackIndex(null)
      at.renderTracks(score.tracks)
      if (songId != null) saveTrackIndex(songId, null)
    } else {
      const idx = parseInt(val, 10)
      setSelectedTrackIndex(idx)
      at.renderTracks([score.tracks[idx]])
      if (songId != null) saveTrackIndex(songId, idx)
    }
  }

  // ── Volume ────────────────────────────────────────────────────────────────
  const handleVolume = (e) => {
    const v = parseFloat(e.target.value)
    setMasterVolume(v)
    if (apiRef.current) apiRef.current.masterVolume = v
  }

  // ── Metronome ─────────────────────────────────────────────────────────────
  const toggleMetronome = () => {
    const next = !metronomeOn
    // Inicjalizuj AudioContext przy pierwszym włączeniu (wymaga gestu użytkownika)
    if (next) {
      getAudioCtx()
      // Włączenie metronomu też liczy się jako ćwiczenie — wystartuj sesję
      startSessionIfNeededRef.current()
    }
    setMetronomeOn(next)
    metronomeOnRef.current = next
  }

  const handleMetronomeVolume = (e) => {
    const v = parseFloat(e.target.value)
    setMetronomeVolume(v)
    metronomeVolumeRef.current = v
  }

  // Standalone metronome — Web Audio look-ahead scheduler.
  // Działa tylko gdy utwór NIE jest odtwarzany. Gdy gra, ciszę zapewnia
  // ten sam useEffect, a klikanie obsługują eventy MIDI z alphaTab (sync).
  const stopStandaloneMetronome = () => {
    if (standaloneTimerRef.current) {
      clearInterval(standaloneTimerRef.current)
      standaloneTimerRef.current = null
    }
  }

  const startStandaloneMetronome = (bpmValue) => {
    stopStandaloneMetronome()
    const ctx = getAudioCtx()
    if (!ctx || !bpmValue || bpmValue <= 0) return
    const secPerBeat = 60 / bpmValue
    const numerator = timeSigNumeratorRef.current || 4
    standaloneBeatCounterRef.current = 0
    standaloneNextBeatTimeRef.current = ctx.currentTime + 0.08  // mała zwłoka startowa

    const scheduler = () => {
      const lookAhead = ctx.currentTime + 0.15
      while (standaloneNextBeatTimeRef.current < lookAhead) {
        const beat = standaloneBeatCounterRef.current
        const isAccent = beat % numerator === 0
        playClick(ctx, isAccent, metronomeVolumeRef.current, standaloneNextBeatTimeRef.current)
        standaloneNextBeatTimeRef.current += secPerBeat
        standaloneBeatCounterRef.current++
      }
    }
    scheduler()
    standaloneTimerRef.current = setInterval(scheduler, 25)
  }

  // Steruj standalone metronomem na podstawie [metronomeOn, playing, bpm].
  // Gdy utwór gra → standalone jest WYŁĄCZONY (klikanie z midiEventsPlayed = pełna synchronizacja).
  // Gdy utwór NIE gra i metronom włączony → standalone leci.
  useEffect(() => {
    if (metronomeOn && !playing && bpm) {
      startStandaloneMetronome(bpm)
    } else {
      stopStandaloneMetronome()
    }
    return stopStandaloneMetronome
  }, [metronomeOn, playing, bpm]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loop ──────────────────────────────────────────────────────────────────
  const clampBar = (val, min, max) => Math.max(min, Math.min(max, val))

  const handleLoopStartChange = (e) => {
    const v = parseInt(e.target.value, 10)
    if (isNaN(v)) return
    const clamped = clampBar(v, 1, totalBars)
    setLoopStart(clamped)
    if (clamped > loopEnd) setLoopEnd(clamped)
  }

  const handleLoopEndChange = (e) => {
    const v = parseInt(e.target.value, 10)
    if (isNaN(v)) return
    const clamped = clampBar(v, 1, totalBars)
    setLoopEnd(clamped)
    if (clamped < loopStart) setLoopStart(clamped)
  }

  const applyLoopRange = (start, end) => {
    if (!apiRef.current) return
    const bars = barPositionsRef.current
    if (!bars.length) return
    const startIdx = start - 1
    const endIdx = end - 1
    const startTick = bars[startIdx]?.start ?? 0
    // endTick = początek następnego taktu, lub bardzo duża liczba dla ostatniego
    const endTick = endIdx + 1 < bars.length ? bars[endIdx + 1].start : 99999999
    apiRef.current.playbackRange = { startTick, endTick }
    apiRef.current.isLooping = true
  }
  applyLoopRangeRef.current = applyLoopRange

  const toggleLoop = () => {
    if (!apiRef.current) return
    if (!loopOnRef.current) {
      let start = loopStartRef.current
      let end = loopEndRef.current
      // Jeśli gra i aktualnie grany takt jest poza wybranym zakresem,
      // zapętl bieżący takt zamiast wcześniej klikniętego.
      const curr = currentBarRef.current
      if (playingRef.current && curr > 0 && (curr < start || curr > end)) {
        start = curr
        end = curr
        setLoopStart(curr)
        setLoopEnd(curr)
        loopStartRef.current = curr
        loopEndRef.current = curr
      }
      applyLoopRange(start, end)
      setLoopOn(true)
    } else {
      apiRef.current.isLooping = false
      apiRef.current.playbackRange = null
      setLoopOn(false)
    }
  }
  toggleLoopRef.current = toggleLoop

  const clearLoop = () => {
    setLoopOn(false)
    setLoopStart(1)
    setLoopEnd(totalBarsRef.current)
    if (apiRef.current) {
      apiRef.current.isLooping = false
      apiRef.current.playbackRange = null
    }
  }
  clearLoopRef.current = clearLoop

  // ── Zapisane pętle ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !songId) return
    getSavedLoops(songId)
      .then(({ data }) => setSavedLoops(data))
      .catch(() => {})
  }, [user, songId])

  const handleSaveLoop = async () => {
    const name = saveLoopName.trim()
    if (!name || savingLoop) return
    setSavingLoop(true)
    setSaveLoopError('')
    try {
      const { data } = await createSavedLoop(songId, {
        name,
        measure_start: loopStartRef.current,
        measure_end: loopEndRef.current,
      })
      setSavedLoops(prev => [...prev, data].sort((a, b) =>
        a.measure_start !== b.measure_start
          ? a.measure_start - b.measure_start
          : a.name.localeCompare(b.name)
      ))
      setSaveLoopName('')
    } catch (err) {
      const msg = err?.response?.data?.detail
        || Object.values(err?.response?.data || {}).flat().join(' ')
        || 'Błąd zapisu'
      setSaveLoopError(msg)
    }
    setSavingLoop(false)
  }

  const handleDeleteSavedLoop = async (id) => {
    try {
      await deleteSavedLoop(id)
      setSavedLoops(prev => prev.filter(l => l.id !== id))
    } catch {}
  }

  const handleLoadSavedLoop = (loop) => {
    setLoopStart(loop.measure_start)
    setLoopEnd(loop.measure_end)
    loopStartRef.current = loop.measure_start
    loopEndRef.current = loop.measure_end
    applyLoopRangeRef.current?.(loop.measure_start, loop.measure_end)
    setLoopOn(true)
    loopOnRef.current = true
  }

  // ─────────────────────────────────────────────────────────────────────────
  const progress = endTime > 0 ? (currentTime / endTime) * 100 : 0
  const isOriginalBpm = bpm === originalBpmRef.current
  const loopValid = loopStart <= loopEnd

  return (
    <>
    {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}

    {/* Saved loops panel — pojawia się nad panelem pętli */}
    {ready && totalBars > 0 && user && showSavedLoops && (
      <div className="at-saved-loops-panel">
        <div className="at-saved-loops-header">
          <span>Zapisane pętle</span>
          <button className="at-saved-loops-close" onClick={() => setShowSavedLoops(false)}>✕</button>
        </div>

        <div className="at-save-loop-form">
          <input
            className="at-save-loop-name-input"
            type="text"
            placeholder={`Nazwa dla taktów ${loopStart}–${loopEnd}…`}
            value={saveLoopName}
            onChange={e => { setSaveLoopName(e.target.value); setSaveLoopError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSaveLoop()}
            maxLength={60}
          />
          <button
            className="at-save-loop-btn"
            onClick={handleSaveLoop}
            disabled={!saveLoopName.trim() || savingLoop}
            title={`Zapisz takt ${loopStart}–${loopEnd}`}
          >{savingLoop ? '…' : 'Zapisz'}</button>
        </div>
        {saveLoopError && <p className="at-save-loop-error">{saveLoopError}</p>}

        {savedLoops.length === 0 ? (
          <p className="at-no-saved-loops">Brak zapisanych pętli</p>
        ) : (
          <ul className="at-saved-loops-list">
            {savedLoops.map(loop => (
              <li key={loop.id} className="at-saved-loop-item">
                <button
                  className="at-saved-loop-load"
                  onClick={() => handleLoadSavedLoop(loop)}
                  title={`Wczytaj takty ${loop.measure_start}–${loop.measure_end}`}
                >
                  <span className="at-saved-loop-name">{loop.name}</span>
                  <span className="at-saved-loop-range">{loop.measure_start}–{loop.measure_end}</span>
                </button>
                <button
                  className="at-saved-loop-delete"
                  onClick={() => handleDeleteSavedLoop(loop.id)}
                  title="Usuń pętlę"
                >✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )}

    {/* Dolny pasek — tempo, pętla i ścieżka w jednym */}
    {ready && (
      <div className="at-bottom-bar">

        {/* Transport — play, stop, głośność, metronom */}
        <div className="at-transport at-bb-group">
          <button
            className={`at-btn ${playing ? 'at-btn-pause' : 'at-btn-play'}`}
            onClick={() => apiRef.current?.playPause()}
            disabled={!ready}
            title={playing ? 'Pause' : 'Play'}
          >{playing ? '⏸' : '▶'}</button>

          <button
            className="at-btn"
            onClick={() => apiRef.current?.stop()}
            disabled={!ready}
            title="Stop"
          >⏹</button>

          <label className="at-control-label">
            <span>Vol</span>
            <input type="range" min="0" max="1" step="0.05" value={masterVolume} onChange={handleVolume} />
          </label>

          <div className="at-metronome-group">
            <button
              className={`at-btn at-btn-metro ${metronomeOn ? 'at-btn-metro--on' : ''}`}
              onClick={toggleMetronome}
              disabled={!ready}
              title={metronomeOn ? 'Metronome ON' : 'Metronome OFF'}
            >🥁</button>
            {metronomeOn && (
              <label className="at-control-label at-metro-vol-label">
                <span className="at-metro-vol-value">{Math.round(metronomeVolume * 100)}%</span>
                <input
                  className="at-metro-vol"
                  type="range" min="0" max="1" step="0.05"
                  value={metronomeVolume} onChange={handleMetronomeVolume}
                />
              </label>
            )}
          </div>
        </div>

        {/* BPM */}
        <div className="at-bpm-panel at-bb-group">
          <span className="at-bpm-panel-label">BPM</span>
          <button className="at-bpm-step" onClick={() => stepBpm(-5)} disabled={(bpm ?? 0) <= BPM_MIN} title="-5 BPM (-)">−</button>
          <div className="at-bpm-field">
            <input
              className="at-bpm-input" type="number" min={BPM_MIN} max={BPM_MAX}
              value={bpmInput} onChange={handleBpmInput} onBlur={handleBpmCommit}
              onKeyDown={handleBpmKey} title="Tempo (BPM)"
            />
          </div>
          <button className="at-bpm-step" onClick={() => stepBpm(+5)} disabled={(bpm ?? 0) >= BPM_MAX} title="+5 BPM (+)">+</button>
          {!isOriginalBpm && (
            <button className="at-bpm-reset" onClick={resetBpm} title={`Reset do ${originalBpmRef.current} BPM`}>↺</button>
          )}
          <input
            className="at-bpm-panel-slider" type="range" min={BPM_MIN} max={BPM_MAX} step="1"
            value={bpm ?? originalBpmRef.current ?? 120} onChange={handleBpmSlider}
            title="Suwak tempa"
          />
        </div>

        {/* Pętla */}
        {totalBars > 0 && (
          <div className="at-loop-row at-bb-group">
            <span className="at-loop-label">Pętla:</span>

            <div className="at-loop-range-inputs">
              <span className="at-loop-range-hint">takt</span>
              <input
                className="at-loop-bar-input"
                type="number"
                min={1}
                max={totalBars}
                value={loopStart}
                onChange={handleLoopStartChange}
                disabled={loopOn}
                title="Pierwszy takt pętli"
              />
              <span className="at-loop-dash">–</span>
              <input
                className="at-loop-bar-input"
                type="number"
                min={1}
                max={totalBars}
                value={loopEnd}
                onChange={handleLoopEndChange}
                disabled={loopOn}
                title="Ostatni takt pętli"
              />
              <span className="at-loop-range-hint">/ {totalBars}</span>
            </div>

            <button
              className={`at-loop-toggle ${loopOn ? 'at-loop-toggle--on' : ''}`}
              onClick={toggleLoop}
              disabled={!loopValid}
              title={loopOn ? 'Wyłącz pętlę' : `Zapętl takty ${loopStart}–${loopEnd}`}
            >
              🔁
            </button>

            <button
              className="at-loop-clear"
              onClick={clearLoop}
              title="Wyczyść pętlę"
            >✕</button>

            {user && (
              <button
                className={`at-loop-bookmarks ${showSavedLoops ? 'at-loop-bookmarks--open' : ''}`}
                onClick={() => setShowSavedLoops(prev => !prev)}
                title="Zapisane pętle"
              >🔖{savedLoops.length > 0 && <span className="at-loop-bookmarks-count">{savedLoops.length}</span>}</button>
            )}
          </div>
        )}

      </div>
    )}

    <div className="at-wrap">
      <div className="at-controls">
        {/* Ścieżka — przeniesione tu z dolnego paska (rzadziej używane) */}
        {ready && tracks.length > 1 && (
          <div className="at-track-select">
            <label className="at-track-select-label" htmlFor="at-track-select-input">Ścieżka:</label>
            <select
              id="at-track-select-input"
              className="at-track-select-dropdown"
              value={selectedTrackIndex ?? 'all'}
              onChange={handleTrackChange}
            >
              <option value="all">Wszystkie ({tracks.length})</option>
              {tracks.map((track, i) => (
                <option key={i} value={i}>
                  {track.name || `Ścieżka ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Progress */}
        <div className="at-progress-bar">
          <div className="at-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* Nagrywanie */}
        <RecordingPanel
          songId={songId}
          user={user}
          bpmPercent={originalBpmRef.current && bpm
            ? Math.round((bpm / originalBpmRef.current) * 100)
            : null}
          onStartPlayback={() => { if (!playingRef.current) apiRef.current?.playPause() }}
          onStopPlayback={() => { if (playingRef.current) apiRef.current?.pause() }}
          disabled={!ready}
        />

        {/* Skróty klawiszowe */}
        <button
          className="at-btn at-btn-shortcuts"
          onClick={() => setShowShortcuts(true)}
          title="Skróty klawiszowe (?)"
        >?</button>
      </div>

      {/* Score */}
      <div className="at-score-wrapper">
        {loading && !error && (
          <div className="at-overlay">
            <div className="at-spinner" />
            <span>Loading tablature…</span>
          </div>
        )}
        {error && <div className="at-overlay at-error"><span>⚠ {error}</span></div>}
        <div ref={containerRef} className="at-surface" />
      </div>
    </div>
    </>
  )
}
