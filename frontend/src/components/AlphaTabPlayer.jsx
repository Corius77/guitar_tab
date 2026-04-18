import { useEffect, useRef, useState } from 'react'
import './AlphaTabPlayer.css'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import { useAuth } from '../context/AuthContext'
import { startSession, endSession, getSavedLoops, createSavedLoop, deleteSavedLoop } from '../api/practice'

const BPM_MIN = 20
const BPM_MAX = 300
const ALPHATAB_METRONOME_EVENT_TYPE = 242

// ── Web Audio metronome ────────────────────────────────────────────────────
function playClick(audioCtx, isAccent, volume) {
  if (!audioCtx) return
  if (audioCtx.state === 'suspended') audioCtx.resume()

  const now = audioCtx.currentTime
  const duration = isAccent ? 0.06 : 0.045
  const freq = isAccent ? 1050 : 580
  const gainPeak = volume * (isAccent ? 1.0 : 0.55)

  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  osc.type = isAccent ? 'triangle' : 'sine'
  osc.frequency.setValueAtTime(freq, now)
  osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + duration)

  gain.gain.setValueAtTime(gainPeak, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start(now)
  osc.stop(now + duration + 0.005)
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
          if (isPlaying && !sessionStartedRef.current && user && songId) {
            sessionStartedRef.current = true
            startSession(songId)
              .then(({ data }) => { sessionIdRef.current = data.id })
              .catch(() => { sessionStartedRef.current = false })
          }
        })

        at.playerPositionChanged.on((e) => {
          if (destroyed) return
          setCurrentTime(e.currentTime)
          setEndTime(e.endTime)

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
          barPositionsRef.current = bars
          const count = bars.length
          setTotalBars(count)
          setLoopStart(1)
          setLoopEnd(count)

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
          // Aktywuj pętlę od razu po wyborze zakresu
          applyLoopRangeRef.current?.(loopStartRef.current, loopEndRef.current)
          setLoopOn(true)
          loopOnRef.current = true
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
          if (next) getAudioCtxRef.current()
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
    if (next) getAudioCtx()
    setMetronomeOn(next)
    metronomeOnRef.current = next
  }

  const handleMetronomeVolume = (e) => {
    const v = parseFloat(e.target.value)
    setMetronomeVolume(v)
    metronomeVolumeRef.current = v
  }

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
      applyLoopRange(loopStartRef.current, loopEndRef.current)
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

    {/* Loop — floating fixed panel */}
    {ready && totalBars > 0 && (
      <div className="at-loop-row">
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

    <div className="at-wrap">
      <div className="at-controls">
        {/* Playback */}
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

        {/* Progress */}
        <div className="at-progress-bar">
          <div className="at-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* Volume */}
        <label className="at-control-label">
          <span>Vol</span>
          <input type="range" min="0" max="1" step="0.05" value={masterVolume} onChange={handleVolume} />
        </label>

        {/* Metronome */}
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

        {/* BPM */}
        <div className="at-bpm-group">
          <button className="at-bpm-step" onClick={() => stepBpm(-5)} disabled={!ready || (bpm ?? 0) <= BPM_MIN} title="-5 BPM">−</button>
          <div className="at-bpm-field">
            <input
              className="at-bpm-input" type="number" min={BPM_MIN} max={BPM_MAX}
              value={bpmInput} onChange={handleBpmInput} onBlur={handleBpmCommit}
              onKeyDown={handleBpmKey} disabled={!ready} title="Tempo (BPM)"
            />
            <span className="at-bpm-unit">BPM</span>
          </div>
          <button className="at-bpm-step" onClick={() => stepBpm(+5)} disabled={!ready || (bpm ?? 0) >= BPM_MAX} title="+5 BPM">+</button>
          {!isOriginalBpm && ready && (
            <button className="at-bpm-reset" onClick={resetBpm} title={`Reset to ${originalBpmRef.current} BPM`}>↺</button>
          )}
        </div>

        {/* Skróty klawiszowe */}
        <button
          className="at-btn at-btn-shortcuts"
          onClick={() => setShowShortcuts(true)}
          title="Skróty klawiszowe (?)"
        >?</button>
      </div>

      {/* BPM slider */}
      {ready && (
        <div className="at-bpm-slider-row">
          <span className="at-bpm-slider-label">{BPM_MIN}</span>
          <input
            className="at-bpm-slider" type="range" min={BPM_MIN} max={BPM_MAX} step="1"
            value={bpm ?? originalBpmRef.current ?? 120} onChange={handleBpmSlider}
          />
          <span className="at-bpm-slider-label">{BPM_MAX}</span>
        </div>
      )}

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
