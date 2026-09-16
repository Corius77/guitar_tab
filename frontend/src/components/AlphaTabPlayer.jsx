import { useEffect, useRef, useState } from 'react'
import './AlphaTabPlayer.css'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import RecordingPanel from './RecordingPanel'
import RiffsModal from './RiffsModal'
import { IconPlay, IconPause, IconStop, IconDrum, IconReset, IconLoop, IconClose, IconBookmark, IconWarning, IconMusicNote } from './icons'
import { paintBarHeat, clearBarHeat, paintLoopRange } from './barHeatOverlay'
import { RAMP_GRADIENT_CSS, makeIntensityAt } from '../utils/practiceHeat'
import { useAuth } from '../context/AuthContext'
import { usePlayer } from '../context/PlayerContext'
import { startSession, endSession, getSavedLoops, createSavedLoop, deleteSavedLoop } from '../api/practice'

const BPM_MIN = 20
const BPM_MAX = 300
const ALPHATAB_METRONOME_EVENT_TYPE = 242

// Mapa takt → ile razy zagrany, spakowana w zakresy sąsiednich taktów o tej
// samej liczbie przejść. Backend trzyma to jako LoopEventy (takt od–do × ile),
// więc jedno przegranie utworu to zwykle jeden wpis, a nie sto.
function barCountsToEvents(counts) {
  const entries = [...counts.entries()]
    .filter(([bar, count]) => bar > 0 && count > 0)
    .sort((a, b) => a[0] - b[0])

  const events = []
  let run = null
  for (const [bar, count] of entries) {
    if (run && bar === run.measure_end + 1 && count === run.loop_count) {
      run.measure_end = bar
    } else {
      run = { measure_start: bar, measure_end: bar, loop_count: count }
      events.push(run)
    }
  }
  return events
}

// Klawisze, przy których przytrzymanie ma sens (regulacja wartości / przewijanie).
// Reszta to przełączniki — tam auto-powtarzanie tylko miga stanem.
const REPEATABLE_KEYS = new Set([
  '=', '+', '-', '_', '[', ']', '{', '}',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
])

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

// ── Solo: słyszalna tylko wybrana ścieżka ──────────────────────────────────
// Globalna preferencja (nie per utwór) — 'true' / brak klucza.
const SOLO_STORAGE_KEY = 'guitarTab.soloSelectedTrack'

function loadSoloPref() {
  try {
    return localStorage.getItem(SOLO_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function saveSoloPref(on) {
  try { localStorage.setItem(SOLO_STORAGE_KEY, on ? 'true' : 'false') } catch {}
}

// ── Podkład: wybrana ścieżka wyciszona, gra reszta zespołu ─────────────────
// Odwrotność sola — patrzysz na swoją tabulaturę, słyszysz backing z syntezatora.
// Globalna preferencja (nie per utwór) — 'true' / brak klucza.
const BACKING_STORAGE_KEY = 'guitarTab.backingTrack'

function loadBackingPref() {
  try {
    return localStorage.getItem(BACKING_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function saveBackingPref(on) {
  try { localStorage.setItem(BACKING_STORAGE_KEY, on ? 'true' : 'false') } catch {}
}

// ── Głośność (globalnie) i tempo (per utwór) ───────────────────────────────
const MASTER_VOLUME_STORAGE_KEY = 'guitarTab.masterVolume'
const METRO_VOLUME_STORAGE_KEY = 'guitarTab.metronomeVolume'
const METRO_ON_STORAGE_KEY = 'guitarTab.metronomeOn'
const BPM_STORAGE_KEY = 'guitarTab.bpmBySong'

function loadVolume(key) {
  try {
    const raw = parseFloat(localStorage.getItem(key))
    return isNaN(raw) ? 1 : Math.max(0, Math.min(1, raw))
  } catch {
    return 1
  }
}

function saveVolume(key, v) {
  try { localStorage.setItem(key, String(v)) } catch {}
}

// Włącznik metronomu — globalny, przeżywa zmianę utworu i odświeżenie strony.
function loadMetroOnPref() {
  try {
    return localStorage.getItem(METRO_ON_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function saveMetroOnPref(on) {
  try { localStorage.setItem(METRO_ON_STORAGE_KEY, on ? 'true' : 'false') } catch {}
}

// Zapamiętane tempo ćwiczenia — wracasz do utworu i masz to samo BPM co ostatnio.
// Zwraca liczbę albo null (brak wpisu / śmieci).
function loadSavedBpm(songId) {
  if (songId == null) return null
  try {
    const raw = localStorage.getItem(BPM_STORAGE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)[String(songId)]
    return typeof v === 'number' && v >= BPM_MIN && v <= BPM_MAX ? v : null
  } catch {
    return null
  }
}

function saveBpm(songId, bpm) {
  if (songId == null) return
  try {
    const raw = localStorage.getItem(BPM_STORAGE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[String(songId)] = bpm
    localStorage.setItem(BPM_STORAGE_KEY, JSON.stringify(map))
  } catch {}
}

// ── Odliczanie przed startem pętli ─────────────────────────────────────────
const COUNT_IN_STORAGE_KEY = 'guitarTab.loopCountIn'

function loadCountInPref() {
  try {
    return localStorage.getItem(COUNT_IN_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function saveCountInPref(on) {
  try { localStorage.setItem(COUNT_IN_STORAGE_KEY, on ? 'true' : 'false') } catch {}
}

// ── Kolorowanie ostatnio ćwiczonych taktów na tabulaturze ──────────────────
const BAR_HEAT_STORAGE_KEY = 'guitarTab.barHeat'

function loadBarHeatPref() {
  try {
    // domyślnie WŁĄCZONE — cały sens tej funkcji to widzieć ślady bez klikania
    return localStorage.getItem(BAR_HEAT_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

function saveBarHeatPref(on) {
  try { localStorage.setItem(BAR_HEAT_STORAGE_KEY, on ? 'true' : 'false') } catch {}
}

// Ustawia miks wg trybu: solo → słychać tylko wybraną ścieżkę,
// podkład → słychać wszystko POZA wybraną (grasz ją sam na żywo).
// idx === null (wszystkie ścieżki) → oba tryby bez sensu, czyścimy.
function applyMixToApi(at, score, solo, backing, idx) {
  if (!at || !score?.tracks?.length) return
  const tracks = [...score.tracks]
  try {
    at.changeTrackSolo(tracks, false)
    at.changeTrackMute(tracks, false)
    if (idx == null || !tracks[idx]) return
    if (solo) at.changeTrackSolo([tracks[idx]], true)
    else if (backing) at.changeTrackMute([tracks[idx]], true)
  } catch {}
}

// ── Component ──────────────────────────────────────────────────────────────
export default function AlphaTabPlayer({ fileUrl, songId, stats, onStatsChange }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const originalBpmRef = useRef(null)
  const metronomeOnRef = useRef(loadMetroOnPref())
  const metronomeVolumeRef = useRef(loadVolume(METRO_VOLUME_STORAGE_KEY))
  const audioCtxRef = useRef(null)

  // Bar positions: array of { index: number, start: number (tick) }
  const barPositionsRef = useRef([])

  // Refy do użycia w handlerze klawiszy (bez stale closures)
  const readyRef = useRef(false)
  const bpmRef = useRef(null)
  const masterVolumeRef = useRef(loadVolume(MASTER_VOLUME_STORAGE_KEY))
  const loopOnRef = useRef(false)
  const loopStartRef = useRef(1)
  const loopEndRef = useRef(1)
  const totalBarsRef = useRef(0)
  const soloTrackRef = useRef(false)
  const backingTrackRef = useRef(false)
  const selectedTrackIndexRef = useRef(null)

  // Odliczanie przed startem pętli
  const countInOnRef = useRef(false)
  const countInTimerRef = useRef(null)
  const requestPlayPauseRef = useRef(null)
  const startCountInRef = useRef(null)
  const cancelCountInRef = useRef(null)
  // Refy na funkcje — aktualizowane przy każdym renderze
  const applyBpmRef = useRef(null)
  const toggleSoloRef = useRef(null)
  const toggleBackingRef = useRef(null)
  const toggleCountInRef = useRef(null)
  const getAudioCtxRef = useRef(null)
  const toggleLoopRef = useRef(null)
  const clearLoopRef = useRef(null)
  const applyLoopRangeRef = useRef(null)
  const seekToBarRef = useRef(null)

  // Otwarte okna — przy nich klawisze należą do okna, nie do playera
  const showShortcutsRef = useRef(false)
  const showRiffsRef = useRef(false)
  const showSavedLoopsRef = useRef(false)

  // Gest myszy na tabulaturze: { bar, beat, moved } od mousedown do mouseup
  const dragRef = useRef(null)
  const handleTabClickRef = useRef(null)
  const setLoopRangeRef = useRef(null)
  const repaintLoopRangeRef = useRef(null)

  // Aktualnie grany takt (1-indexed) — używany do pętli "od bieżącego taktu"
  const currentBarRef = useRef(0)

  // Metrum pierwszego taktu — akcent na "raz" przy odliczaniu przed pętlą
  const timeSigNumeratorRef = useRef(4)

  // Ścieżki (tracki) pliku GP
  const scoreRef = useRef(null)

  // ── Sekcje / nawigacja z sidebara ───────────────────────────────────────────
  const { setSections, registerSeek, clearPlayer } = usePlayer()

  // ── Śledzenie sesji ────────────────────────────────────────────────────────
  const { user } = useAuth()
  const sessionIdRef = useRef(null)         // id aktywnej sesji backendu
  const playingRef = useRef(false)          // czy aktualnie gra
  const sessionStartedRef = useRef(false)   // czy sesja została już wystartowana
  const lastTickRef = useRef(-1)            // poprzedni tick — wykrywa skok wstecz

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const [masterVolume, setMasterVolume] = useState(() => loadVolume(MASTER_VOLUME_STORAGE_KEY))
  const [bpm, setBpm] = useState(null)
  const [bpmInput, setBpmInput] = useState('')
  const [metronomeOn, setMetronomeOn] = useState(loadMetroOnPref)
  const [metronomeVolume, setMetronomeVolume] = useState(() => loadVolume(METRO_VOLUME_STORAGE_KEY))

  // Modal skrótów
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Modal analizy riffów
  const [showRiffs, setShowRiffs] = useState(false)

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
  const [soloTrack, setSoloTrack] = useState(loadSoloPref) // słychać tylko wybraną ścieżkę
  // Podkład — wybrana ścieżka wyciszona, gra reszta. Przy sprzecznych zapisach solo wygrywa.
  const [backingTrack, setBackingTrack] = useState(() => loadBackingPref() && !loadSoloPref())

  // Kolorowanie taktów wg tego, jak dawno były ćwiczone
  const [barHeatOn, setBarHeatOn] = useState(loadBarHeatPref)
  // Takty zagrane w TEJ sesji (takt → liczba przejść) — jeszcze nie ma ich
  // w `stats` z backendu, a mają się doliczać do intensywności od razu.
  // Ta sama mapa idzie potem na backend jako podsumowanie sesji.
  const liveBarsRef = useRef(new Map())
  const [liveBarsTick, setLiveBarsTick] = useState(0)

  // Odliczanie przed pętlą
  const [countInOn, setCountInOn] = useState(loadCountInPref)
  const [countingIn, setCountingIn] = useState(false)

  useEffect(() => { metronomeOnRef.current = metronomeOn; saveMetroOnPref(metronomeOn) }, [metronomeOn])
  useEffect(() => { metronomeVolumeRef.current = metronomeVolume; saveVolume(METRO_VOLUME_STORAGE_KEY, metronomeVolume) }, [metronomeVolume])
  useEffect(() => { readyRef.current = ready }, [ready])
  useEffect(() => { bpmRef.current = bpm }, [bpm])
  useEffect(() => { masterVolumeRef.current = masterVolume; saveVolume(MASTER_VOLUME_STORAGE_KEY, masterVolume) }, [masterVolume])
  useEffect(() => { loopOnRef.current = loopOn }, [loopOn])
  useEffect(() => { loopStartRef.current = loopStart }, [loopStart])
  useEffect(() => { loopEndRef.current = loopEnd }, [loopEnd])
  useEffect(() => { totalBarsRef.current = totalBars }, [totalBars])
  useEffect(() => { soloTrackRef.current = soloTrack }, [soloTrack])
  useEffect(() => { backingTrackRef.current = backingTrack }, [backingTrack])
  useEffect(() => { countInOnRef.current = countInOn }, [countInOn])
  useEffect(() => { selectedTrackIndexRef.current = selectedTrackIndex }, [selectedTrackIndex])
  useEffect(() => { showShortcutsRef.current = showShortcuts }, [showShortcuts])
  useEffect(() => { showRiffsRef.current = showRiffs }, [showRiffs])
  useEffect(() => { showSavedLoopsRef.current = showSavedLoops }, [showSavedLoops])

  // ── Kolorowanie taktów na tabulaturze ─────────────────────────────────────
  // Warstwa jest przeliczana z boundsLookup po każdym renderze alphaTab, więc
  // handler musi widzieć świeże `stats` / `barHeatOn` — stąd refy.
  const barHeatOnRef = useRef(barHeatOn)
  const statsRef = useRef(stats)
  useEffect(() => { barHeatOnRef.current = barHeatOn }, [barHeatOn])
  useEffect(() => { statsRef.current = stats }, [stats])

  const repaintBarHeat = () => {
    const at = apiRef.current
    const container = containerRef.current
    if (!at || !container) return
    if (!barHeatOnRef.current) {
      clearBarHeat(container)
      return
    }
    // `boundsLookup` przeniósł się na api w nowszych alphaTabach, ale w 1.8
    // wciąż siedzi na rendererze — bierzemy to, co jest.
    const lookup = at.boundsLookup ?? at.renderer?.boundsLookup
    paintBarHeat(container, lookup, makeIntensityAt(statsRef.current, liveBarsRef.current))
  }
  const repaintBarHeatRef = useRef(repaintBarHeat)
  repaintBarHeatRef.current = repaintBarHeat

  // Przemaluj gdy zmienią się dane albo przełącznik (render alphaTab woła to sam)
  useEffect(() => {
    repaintBarHeat()
  }, [barHeatOn, stats, liveBarsTick])

  const toggleBarHeat = () => {
    setBarHeatOn(prev => {
      const next = !prev
      barHeatOnRef.current = next
      saveBarHeatPref(next)
      return next
    })
  }
  const toggleBarHeatRef = useRef(toggleBarHeat)
  toggleBarHeatRef.current = toggleBarHeat

  // ── Zakończenie sesji (fire-and-forget) ───────────────────────────────────
  const buildSessionPayload = () => {
    const loopEvents = barCountsToEvents(liveBarsRef.current)
    // Wyczyść, żeby po odświeżeniu statystyk te same przejścia nie doliczyły
    // się drugi raz (backend zwróci je już w measure_heat).
    liveBarsRef.current = new Map()
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
    let removeMouseListeners = null

    const initAlphaTab = async () => {
      try {
        setLoading(true)
        setError('')
        setReady(false)
        // Uwaga: wartości wyświetlane w dolnym pasku (bpm, totalBars) NIE są tu
        // zerowane — dzięki temu pasek zostaje widoczny ze starymi danymi aż
        // nowy utwór się załaduje, zamiast znikać i wskakiwać (płynne przejście).
        // scoreLoaded nadpisze je danymi nowego utworu.
        setLoopOn(false)
        setLoopStart(1)
        setLoopEnd(1)
        barPositionsRef.current = []
        originalBpmRef.current = null
        sessionIdRef.current = null
        sessionStartedRef.current = false
        lastTickRef.current = -1
        playingRef.current = false
        currentBarRef.current = 0
        setTracks([])
        setSelectedTrackIndex(null)
        selectedTrackIndexRef.current = null
        scoreRef.current = null
        setShowRiffs(false)
        liveBarsRef.current = new Map()

        const { AlphaTabApi } = await import('@coderline/alphatab')
        if (destroyed) return

        if (apiRef.current) {
          try { apiRef.current.destroy() } catch {}
          apiRef.current = null
        }
        containerRef.current.innerHTML = ''

        // Element, który faktycznie się przewija (sidebar + main). alphaTab
        // domyślnie scrolluje 'html,body', ale u nas overflow jest na .app-main,
        // więc scrollToCursor() bez tego nie ruszałby widoku.
        const scrollEl = containerRef.current.closest('.app-main') || 'html,body'

        const at = new AlphaTabApi(containerRef.current, {
          core: { useWorkers: true },
          player: {
            enablePlayer: true,
            enableCursor: true,
            // Klik/drag obsługujemy sami (patrz "Mysz na tabulaturze") — wbudowana
            // interakcja alphaTab kasuje playbackRange przy każdym kliku, czyli pętlę.
            enableUserInteraction: false,
            soundFont: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/soundfont/sonivox.sf2',
            scrollElement: scrollEl,
            scrollOffsetY: -80, // trochę luzu nad taktem, żeby nie był przy samej krawędzi
          },
          display: { layoutMode: 0, staveProfile: 1 },
        })

        at.metronomeVolume = 0
        at.masterVolume = masterVolumeRef.current
        at.midiEventsPlayedFilter = [ALPHATAB_METRONOME_EVENT_TYPE]

        at.midiEventsPlayed.on((e) => {
          if (destroyed || !metronomeOnRef.current) return
          for (const event of e.events) {
            if (event.type !== ALPHATAB_METRONOME_EVENT_TYPE) continue
            const isAccent = event.metronomeNumerator === 0
            // Metronom przywrócony z zapisu → AudioContext może jeszcze nie istnieć
            playClick(getAudioCtxRef.current(), isAccent, metronomeVolumeRef.current)
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

          // Aktualnie grany takt + zliczanie przejść przez takt.
          // Kolorowanie mierzy, ile razy takt faktycznie przeleciał pod
          // kursorem — zwykłe granie liczy się tak samo jak pętle.
          const tick = e.currentTick
          if (tick != null) {
            const bars = barPositionsRef.current
            let bar = currentBarRef.current
            for (let i = bars.length - 1; i >= 0; i--) {
              if (tick >= bars[i].start) {
                bar = i + 1
                break
              }
            }
            // Skok wstecz to zawinięcie pętli albo przewinięcie — bez tego
            // pętla na jednym takcie nie zliczyłaby się ani razu (numer taktu
            // się nie zmienia). Doliczamy od razu, żeby kolor reagował na
            // bieżąco, nie dopiero po przeładowaniu statystyk z backendu.
            const jumpedBack = tick < lastTickRef.current
            if (playingRef.current && (bar !== currentBarRef.current || jumpedBack)) {
              liveBarsRef.current.set(bar, (liveBarsRef.current.get(bar) ?? 0) + 1)
              setLiveBarsTick(t => t + 1)
            }
            currentBarRef.current = bar
            lastTickRef.current = tick
          }
        })

        // Pętla z odliczaniem: alphaTab nie zapętla sam (isLooping=false), tylko
        // zatrzymuje się na końcu zakresu i cofa na start. Tu klikamy takt
        // i puszczamy kolejne okrążenie.
        at.playerFinished.on(() => {
          if (destroyed) return
          if (loopOnRef.current && countInOnRef.current) startCountInRef.current?.()
        })

        at.renderFinished.on(() => {
          if (destroyed) return
          setLoading(false)
          // Nowy układ systemów → nowe bounds, warstwy muszą się przeliczyć
          repaintBarHeatRef.current()
          repaintLoopRangeRef.current()
        })

        // Syntezator dostaje kanały dopiero gdy player jest gotowy — solo/mute
        // ustawione wcześniej mogłoby przepaść, więc dokładamy je tutaj.
        at.playerReady.on(() => {
          if (destroyed) return
          applyMixToApi(at, scoreRef.current, soloTrackRef.current, backingTrackRef.current, selectedTrackIndexRef.current)
        })

        at.scoreLoaded.on((score) => {
          if (destroyed) return
          const tempo = score?.tempo ?? 120
          originalBpmRef.current = tempo
          // Zapamiętane tempo z poprzedniego razu (o ile było) zamiast oryginału
          const savedBpm = loadSavedBpm(songId)
          const startBpm = savedBpm ?? tempo
          setBpm(startBpm)
          setBpmInput(String(startBpm))
          at.playbackSpeed = startBpm / tempo

          // Wyciągnij pozycje taktów
          const bars = []
          if (score?.masterBars) {
            for (let i = 0; i < score.masterBars.length; i++) {
              const mb = score.masterBars[i]
              bars.push({ index: i, start: mb.start, end: mb.start + mb.calculateDuration() })
            }
          }
          // Numerator z pierwszego taktu — dla akcentu przy odliczaniu
          timeSigNumeratorRef.current = score?.masterBars?.[0]?.timeSignatureNumerator || 4
          barPositionsRef.current = bars

          // Wyciągnij markery sekcji (Intro / Zwrotka / Refren…) dla sidebara
          const sectionList = []
          if (score?.masterBars) {
            for (let i = 0; i < score.masterBars.length; i++) {
              const sec = score.masterBars[i].section
              const label = sec?.text || sec?.marker
              if (label) sectionList.push({ bar: i + 1, label })
            }
          }
          setSections?.(sectionList)
          const count = bars.length
          setTotalBars(count)
          setLoopStart(1)
          setLoopEnd(count)

          // Zapisz ścieżki; przy wielu ścieżkach renderuj zapamiętaną lub pierwszą
          scoreRef.current = score
          let activeTrackIdx = null
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
              activeTrackIdx = idx
              setSelectedTrackIndex(idx)
              at.renderTracks([score.tracks[idx]])
            }
          } else {
            setTracks(score?.tracks ? [...score.tracks] : [])
            setSelectedTrackIndex(null)
          }
          selectedTrackIndexRef.current = activeTrackIdx
          applyMixToApi(at, score, soloTrackRef.current, backingTrackRef.current, activeTrackIdx)

          setReady(true)
        })

        at.error.on((e) => {
          if (!destroyed) {
            setError(`AlphaTab error: ${e.message ?? e}`)
            setLoading(false)
          }
        })

        // ── Mysz na tabulaturze ─────────────────────────────────────────────
        // Słuchamy zdarzeń DOM zamiast at.beatMouseDown.on(), bo tylko one
        // niosą oryginalny MouseEvent (shiftKey, detail = licznik kliknięć).
        //   klik            → seek do klikniętego beatu, pętla zostaje
        //   klik poza pętlą → pętla off + seek
        //   przeciągnięcie  → zakres pętli (na żywo, jeśli pętla gra)
        //   Shift+klik      → dosuń bliższą krawędź zakresu do taktu
        //   dwuklik         → zakres = ten jeden takt
        const onBeatDown = (e) => {
          const beat = e.detail
          if (destroyed || !beat) return
          dragRef.current = { bar: beat.voice.bar.index + 1, beat, moved: false }
        }
        const onBeatMove = (e) => {
          const beat = e.detail
          const d = dragRef.current
          if (destroyed || !beat || !d) return
          const bar = beat.voice.bar.index + 1
          // Ruch w obrębie taktu, w którym kliknięto, to jeszcze nie drag
          if (!d.moved && bar === d.bar) return
          d.moved = true
          setLoopRangeRef.current(Math.min(d.bar, bar), Math.max(d.bar, bar))
        }
        const onBeatUp = (e) => {
          const d = dragRef.current
          if (destroyed || !d) return
          dragRef.current = null
          if (!d.moved) handleTabClickRef.current(d.bar, d.beat, e.originalEvent)
        }
        const el = containerRef.current
        el.addEventListener('alphaTab.beatMouseDown', onBeatDown)
        el.addEventListener('alphaTab.beatMouseMove', onBeatMove)
        el.addEventListener('alphaTab.beatMouseUp', onBeatUp)
        removeMouseListeners = () => {
          el.removeEventListener('alphaTab.beatMouseDown', onBeatDown)
          el.removeEventListener('alphaTab.beatMouseMove', onBeatMove)
          el.removeEventListener('alphaTab.beatMouseUp', onBeatUp)
        }

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
      removeMouseListeners?.()
      endCurrentSession()
      cancelCountInRef.current?.()
      if (apiRef.current) {
        try { apiRef.current.destroy() } catch {}
        apiRef.current = null
      }
    }
  }, [fileUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Nawigacja do sekcji (z sidebara) ─────────────────────────────────────
  // Klik w sekcję: przewiń na początek jej taktu i zagraj od tego miejsca.
  // Czyta wyłącznie refy, więc rejestrujemy raz; czyścimy kontekst przy odmontowaniu.
  useEffect(() => {
    registerSeek?.((bar) => {
      const api = apiRef.current
      if (!api) return
      const startTick = barPositionsRef.current[bar - 1]?.start
      if (startTick == null) return
      api.tickPosition = startTick
      if (!playingRef.current) api.playPause()
      // Przewiń widok do taktu po tym, jak kursor zdąży się przesunąć na nową
      // pozycję (tickPosition aktualizuje kursor asynchronicznie).
      requestAnimationFrame(() => { try { api.scrollToCursor?.() } catch {} })
    })
    return () => { clearPlayer?.() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      // Skróty z modyfikatorem należą do przeglądarki (Ctrl+S, Ctrl+R, Cmd+L…)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const el = document.activeElement
      const tag = el?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable

      const key = e.key

      // Escape = wyjście z tego, co akurat przeszkadza: pole → panel → odliczanie
      if (key === 'Escape') {
        if (typing) { el.blur(); return }
        if (showShortcutsRef.current) { setShowShortcuts(false); return }
        if (showRiffsRef.current) { setShowRiffs(false); return }
        if (showSavedLoopsRef.current) { setShowSavedLoops(false); return }
        cancelCountInRef.current?.()
        return
      }

      // Wpisywanie w pole ma pierwszeństwo przed skrótami
      if (typing) return

      // ? otwiera/zamyka ściągawkę niezależnie od stanu gotowości
      if (key === '?') { setShowShortcuts(prev => !prev); return }

      // Przy otwartym oknie klawisze sterują oknem, nie playerem pod spodem
      if (showShortcutsRef.current || showRiffsRef.current) return

      if (!readyRef.current) return

      // Przytrzymanie klawisza powtarza tylko tam, gdzie to ma sens (tempo,
      // zakres pętli, przewijanie). Przełączniki inaczej migotałyby w kółko.
      if (e.repeat && !REPEATABLE_KEYS.has(key)) return

      switch (key) {
        // ── Odtwarzanie ──────────────────────────────────────────────
        case ' ':
          e.preventDefault()
          requestPlayPauseRef.current?.()
          break

        case 's':
        case 'S':
          cancelCountInRef.current?.()
          apiRef.current?.stop()
          break

        // ── Przewijanie po taktach ───────────────────────────────────
        case 'ArrowLeft':
          e.preventDefault()
          seekToBarRef.current?.(currentBarRef.current - (e.shiftKey ? 4 : 1))
          break

        case 'ArrowRight':
          e.preventDefault()
          seekToBarRef.current?.(currentBarRef.current + (e.shiftKey ? 4 : 1))
          break

        // Początek pętli, a gdy jej nie ma — początek utworu
        case 'Home':
          e.preventDefault()
          seekToBarRef.current?.(loopOnRef.current ? loopStartRef.current : 1)
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

        // ── Odliczanie przed startem (1·2·3·4) ───────────────────────
        case 'c':
        case 'C':
          toggleCountInRef.current()
          break

        // ── Ścieżka — solo ───────────────────────────────────────────
        case 't':
        case 'T':
          toggleSoloRef.current()
          break

        // ── Ścieżka — podkład (wycisz wybraną, gra reszta) ───────────
        case 'b':
        case 'B':
          toggleBackingRef.current()
          break

        // ── Ślady ćwiczeń na tabulaturze ─────────────────────────────
        case 'h':
        case 'H':
          toggleBarHeatRef.current()
          break

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

  // Klik myszą zostawiał fokus na przycisku, więc kolejna Spacja aktywowała
  // ten przycisk zamiast Play/Pause. Po kliknięciu myszą zdejmujemy fokus;
  // klik wywołany z klawiatury ma detail === 0, więc nawigacja Tab-em działa.
  useEffect(() => {
    const onClick = (e) => {
      if (e.detail === 0) return
      const btn = e.target.closest?.('button')
      if (btn && btn.closest('.at-bottom-bar, .at-wrap, .at-saved-loops-panel')) btn.blur()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // ── Skok do taktu ────────────────────────────────────────────────────────
  // Przesuwa kursor i widok, nie zmieniając stanu odtwarzania — gra dalej gra,
  // pauza zostaje pauzą (inaczej niż nawigacja po sekcjach z sidebara).
  const seekToBar = (bar) => {
    const api = apiRef.current
    const bars = barPositionsRef.current
    if (!api || !bars.length) return
    const target = Math.max(1, Math.min(bars.length, bar))
    const tick = bars[target - 1]?.start
    if (tick == null) return
    api.tickPosition = tick
    currentBarRef.current = target
    requestAnimationFrame(() => { try { api.scrollToCursor?.() } catch {} })
  }
  seekToBarRef.current = seekToBar

  // ── BPM ──────────────────────────────────────────────────────────────────
  const applyBpm = (newBpm) => {
    const clamped = Math.max(BPM_MIN, Math.min(BPM_MAX, newBpm))
    setBpm(clamped)
    setBpmInput(String(clamped))
    if (apiRef.current && originalBpmRef.current) {
      apiRef.current.playbackSpeed = clamped / originalBpmRef.current
    }
    saveBpm(songId, clamped)
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
    // Enter zatwierdza i oddaje fokus — inaczej skróty byłyby dalej martwe
    if (e.key === 'Enter') { handleBpmCommit(); e.currentTarget.blur() }
    if (e.key === 'ArrowUp') applyBpm((bpm ?? 120) + 1)
    if (e.key === 'ArrowDown') applyBpm((bpm ?? 120) - 1)
  }
  const stepBpm = (delta) => applyBpm((bpm ?? 120) + delta)
  const resetBpm = () => { if (originalBpmRef.current) applyBpm(originalBpmRef.current) }

  // ── Track selection ───────────────────────────────────────────────────────
  const handleTrackChange = (e) => {
    const at = apiRef.current
    const score = scoreRef.current
    // Fokus na <select> blokuje skróty (i Spacja rozwijałaby listę) — oddaj go
    e.target.blur()
    if (!at || !score) return
    const val = e.target.value
    if (val === 'all') {
      setSelectedTrackIndex(null)
      selectedTrackIndexRef.current = null
      at.renderTracks(score.tracks)
      if (songId != null) saveTrackIndex(songId, null)
    } else {
      const idx = parseInt(val, 10)
      setSelectedTrackIndex(idx)
      selectedTrackIndexRef.current = idx
      at.renderTracks([score.tracks[idx]])
      if (songId != null) saveTrackIndex(songId, idx)
    }
    // Solo / podkład idą za wyborem ścieżki
    applyMixToApi(at, score, soloTrackRef.current, backingTrackRef.current, selectedTrackIndexRef.current)
  }

  // Słychać tylko wybraną ścieżkę (alphaTab solo na kanale MIDI).
  const toggleSolo = () => {
    if (selectedTrackIndexRef.current == null) return
    const next = !soloTrackRef.current
    setSoloTrack(next)
    soloTrackRef.current = next
    saveSoloPref(next)
    if (next && backingTrackRef.current) {
      // Solo i podkład się wykluczają
      setBackingTrack(false)
      backingTrackRef.current = false
      saveBackingPref(false)
    }
    applyMixToApi(apiRef.current, scoreRef.current, soloTrackRef.current, backingTrackRef.current, selectedTrackIndexRef.current)
  }
  toggleSoloRef.current = toggleSolo

  // Podkład: wybrana ścieżka wyciszona, gra reszta zespołu — Ty grasz ją sam.
  // Działa z metronomem jak zwykłe odtwarzanie (kliknięcia z eventów MIDI).
  const toggleBacking = () => {
    if (selectedTrackIndexRef.current == null) return
    const next = !backingTrackRef.current
    setBackingTrack(next)
    backingTrackRef.current = next
    saveBackingPref(next)
    if (next && soloTrackRef.current) {
      setSoloTrack(false)
      soloTrackRef.current = false
      saveSoloPref(false)
    }
    applyMixToApi(apiRef.current, scoreRef.current, soloTrackRef.current, backingTrackRef.current, selectedTrackIndexRef.current)
  }
  toggleBackingRef.current = toggleBacking

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

  // ── Odliczanie przed startem odtwarzania ─────────────────────────────────
  // Zamiast od razu grać, klikamy jeden takt metronomem (akcent na "raz")
  // i dopiero wtedy startujemy odtwarzanie — niezależnie od tego, czy pętla
  // jest włączona.
  const cancelCountIn = () => {
    if (countInTimerRef.current) {
      clearTimeout(countInTimerRef.current)
      countInTimerRef.current = null
    }
    setCountingIn(false)
  }
  cancelCountInRef.current = cancelCountIn

  const requestPlayPause = () => {
    const at = apiRef.current
    if (!at || !readyRef.current) return
    // Klik w trakcie odliczania = anuluj (nie startuj)
    if (countInTimerRef.current) {
      cancelCountIn()
      return
    }
    if (!playingRef.current && countInOnRef.current) {
      startCountIn()
    } else {
      at.playPause()
    }
  }
  requestPlayPauseRef.current = requestPlayPause

  // Jeden takt klików, po nim start odtwarzania. Wspólne dla Play
  // i każdego kolejnego okrążenia pętli (playerFinished).
  const startCountIn = () => {
    const ctx = getAudioCtxRef.current()
    const beatsCount = timeSigNumeratorRef.current || 4
    const period = 60 / (bpmRef.current || 120)
    const t0 = ctx.currentTime + 0.1
    for (let i = 0; i < beatsCount; i++) {
      playClick(ctx, i === 0, metronomeVolumeRef.current, t0 + i * period)
    }
    setCountingIn(true)
    startSessionIfNeededRef.current()
    countInTimerRef.current = setTimeout(() => {
      countInTimerRef.current = null
      setCountingIn(false)
      apiRef.current?.play()
    }, Math.max(0, (t0 - ctx.currentTime + beatsCount * period) * 1000))
  }
  startCountInRef.current = startCountIn

  const toggleCountIn = () => {
    const next = !countInOnRef.current
    setCountInOn(next)
    countInOnRef.current = next
    saveCountInPref(next)
    // Z odliczaniem pętlę obsługujemy sami (patrz playerFinished)
    if (apiRef.current && loopOnRef.current) apiRef.current.isLooping = !next
  }
  toggleCountInRef.current = toggleCountIn

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
    const at = apiRef.current
    if (!at) return
    const bars = barPositionsRef.current
    if (!bars.length) return
    const startTick = bars[start - 1]?.start ?? 0
    const endTick = bars[end - 1]?.end ?? bars[bars.length - 1].end
    // Ustawienie playbackRange przeskakuje na jego początek — przy zmianie
    // zakresu w trakcie grania (drag, [ ] { }) zostajemy tam, gdzie byliśmy,
    // o ile to wciąż w środku pętli.
    const prevTick = at.tickPosition
    at.playbackRange = { startTick, endTick }
    if (prevTick >= startTick && prevTick < endTick) at.tickPosition = prevTick
    // Z odliczaniem alphaTab ma się zatrzymać na końcu zakresu — zapętlamy sami
    at.isLooping = !countInOnRef.current
  }
  applyLoopRangeRef.current = applyLoopRange

  // Zakres zmieniony gdy pętla gra (drag, Shift+klik, [ ] { }, pola) → od razu
  // do alphaTab. toggleLoop wcześniej ustawił to samo, powtórka jest neutralna.
  useEffect(() => {
    if (loopOn && ready) applyLoopRange(loopStart, loopEnd)
  }, [loopOn, loopStart, loopEnd, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const setLoopRange = (start, end) => {
    setLoopStart(start)
    setLoopEnd(end)
    loopStartRef.current = start
    loopEndRef.current = end
  }
  setLoopRangeRef.current = setLoopRange

  // Klik na tabulaturze (bez przeciągnięcia) — patrz komentarz przy listenerach
  const handleTabClick = (bar, beat, ev) => {
    const at = apiRef.current
    if (!at) return
    const start = loopStartRef.current
    const end = loopEndRef.current

    if (ev?.shiftKey) {
      if (bar < start) setLoopRange(bar, end)
      else if (bar > end) setLoopRange(start, bar)
      else if (bar - start < end - bar) setLoopRange(bar, end)
      else setLoopRange(start, bar)
      return
    }
    if (ev?.detail >= 2) {
      setLoopRange(bar, bar)
      return
    }

    // Klik poza grającą pętlą = "chcę gdzie indziej" → pętla off, zakres zostaje
    if (loopOnRef.current && (bar < start || bar > end)) {
      at.isLooping = false
      at.playbackRange = null
      setLoopOn(false)
      loopOnRef.current = false
    }
    const tick = at.tickCache?.getBeatStart(beat) ?? barPositionsRef.current[bar - 1]?.start
    if (tick == null) return
    at.tickPosition = tick
    currentBarRef.current = bar
  }
  handleTabClickRef.current = handleTabClick

  // Zakres pętli narysowany na tabulaturze (własna warstwa, patrz barHeatOverlay)
  const repaintLoopRange = () => {
    const at = apiRef.current
    const container = containerRef.current
    if (!at || !container) return
    const lookup = at.boundsLookup ?? at.renderer?.boundsLookup
    const start = loopStartRef.current
    const end = loopEndRef.current
    // Domyślny zakres (cały utwór) bez włączonej pętli to nie zaznaczenie — nie rysuj
    const wholeSong = start === 1 && end === totalBarsRef.current
    if (wholeSong && !loopOnRef.current) paintLoopRange(container, lookup, null, null, false)
    else paintLoopRange(container, lookup, start, end, loopOnRef.current)
  }
  repaintLoopRangeRef.current = repaintLoopRange
  useEffect(() => {
    if (ready) repaintLoopRange()
  }, [loopStart, loopEnd, loopOn, ready]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Analiza riffów ───────────────────────────────────────────────────────
  // Klik w zakres taktów w modalu → pętla na ten riff + przewinięcie widoku.
  const handleRiffRangeSelect = (start, end) => {
    setLoopStart(start)
    setLoopEnd(end)
    loopStartRef.current = start
    loopEndRef.current = end
    applyLoopRange(start, end)
    setLoopOn(true)
    loopOnRef.current = true
    setShowRiffs(false)

    const api = apiRef.current
    const tick = barPositionsRef.current[start - 1]?.start
    if (api && tick != null) {
      api.tickPosition = tick
      requestAnimationFrame(() => { try { api.scrollToCursor?.() } catch {} })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  const progress = endTime > 0 ? (currentTime / endTime) * 100 : 0
  const isOriginalBpm = bpm === originalBpmRef.current
  const loopValid = loopStart <= loopEnd

  return (
    <>
    {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}

    {showRiffs && scoreRef.current && (
      <RiffsModal
        score={scoreRef.current}
        initialTrackIndex={selectedTrackIndex ?? 0}
        onClose={() => setShowRiffs(false)}
        onSelectRange={handleRiffRangeSelect}
      />
    )}

    {/* Saved loops panel — pojawia się nad panelem pętli */}
    {ready && totalBars > 0 && user && showSavedLoops && (
      <div className="at-saved-loops-panel">
        <div className="at-saved-loops-header">
          <span>Zapisane pętle</span>
          <button className="at-saved-loops-close" onClick={() => setShowSavedLoops(false)}><IconClose /></button>
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
                ><IconClose /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )}

    {/* Dolny pasek — tempo, pętla i ścieżka w jednym.
        Bramkowany na totalBars (nie na ready), żeby przy zmianie utworu został
        widoczny ze starymi danymi i tylko przygasł, zamiast znikać. */}
    {totalBars > 0 && (
      <div className={`at-bottom-bar ${ready ? '' : 'at-bottom-bar--loading'}`}>

        {/* Transport — play, stop, głośność, metronom */}
        <div className="at-transport at-bb-group">
          <button
            className={`at-btn ${playing ? 'at-btn-pause' : 'at-btn-play'} ${countingIn ? 'at-btn--countin' : ''}`}
            onClick={requestPlayPause}
            disabled={!ready}
            title={countingIn ? 'Odliczanie… (klik = anuluj)' : playing ? 'Pause' : 'Play'}
          >{playing ? <IconPause /> : <IconPlay />}</button>

          <button
            className="at-btn"
            onClick={() => { cancelCountIn(); apiRef.current?.stop() }}
            disabled={!ready}
            title="Stop"
          ><IconStop /></button>

          <label className="at-control-label">
            <span>Vol</span>
            <input type="range" min="0" max="1" step="0.05" value={masterVolume} onChange={handleVolume} />
          </label>

          <div className="at-metronome-group">
            <button
              className={`at-btn at-btn-metro ${metronomeOn ? 'at-btn-metro--on' : ''}`}
              onClick={toggleMetronome}
              disabled={!ready}
              title={metronomeOn ? 'Metronom ON — klika w trakcie odtwarzania (M)' : 'Metronom OFF (M)'}
            ><IconDrum /></button>
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

          {/* Solo / podkład — tylko gdy plik ma więcej niż jedną ścieżkę */}
          {tracks.length > 1 && (
            <div className="at-track-mix">
              <button
                className={`at-track-solo ${soloTrack && selectedTrackIndex != null ? 'at-track-solo--on' : ''}`}
                onClick={toggleSolo}
                disabled={selectedTrackIndex == null}
                title={selectedTrackIndex == null
                  ? 'Wybierz pojedynczą ścieżkę, żeby ją wyciszyć solo (T)'
                  : soloTrack
                    ? 'Wyłącz solo — słychać wszystkie ścieżki (T)'
                    : 'Solo — słychać tylko wybraną ścieżkę (T)'}
              >SOLO</button>

              <button
                className={`at-track-solo ${backingTrack && selectedTrackIndex != null ? 'at-track-solo--on' : ''}`}
                onClick={toggleBacking}
                disabled={selectedTrackIndex == null}
                title={selectedTrackIndex == null
                  ? 'Wybierz pojedynczą ścieżkę, żeby zrobić z reszty podkład (B)'
                  : backingTrack
                    ? 'Wyłącz podkład — słychać wszystkie ścieżki (B)'
                    : 'Podkład — wycisz wybraną ścieżkę, gra reszta zespołu; działa też z metronomem (B)'}
              >PODKŁAD</button>
            </div>
          )}
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
          {ready && !isOriginalBpm && (
            <button className="at-bpm-reset" onClick={resetBpm} title={`Reset do ${originalBpmRef.current} BPM`}><IconReset /></button>
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
                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
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
                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
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
              <IconLoop />
            </button>

            <button
              className={`at-loop-toggle at-loop-countin ${countInOn ? 'at-loop-toggle--on' : ''}`}
              onClick={toggleCountIn}
              title={countInOn
                ? 'Odliczanie włączone — jeden takt metronomu przed każdym startem (C)'
                : 'Włącz krótkie odliczanie (jeden takt metronomu) przed startem odtwarzania (C)'}
            >1·2·3·4</button>

            <button
              className="at-loop-clear"
              onClick={clearLoop}
              title="Wyczyść pętlę"
            ><IconClose /></button>

            {user && (
              <button
                className={`at-loop-bookmarks ${showSavedLoops ? 'at-loop-bookmarks--open' : ''}`}
                onClick={() => setShowSavedLoops(prev => !prev)}
                title="Zapisane pętle"
              ><IconBookmark />{savedLoops.length > 0 && <span className="at-loop-bookmarks-count">{savedLoops.length}</span>}</button>
            )}
          </div>
        )}

      </div>
    )}

    <div className="at-wrap">
      <div className="at-controls">
        {/* Wybór ścieżki (solo/podkład są w dolnym pasku przy transporcie) */}
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

        {/* Ślady ćwiczeń — kolor taktów na tabulaturze */}
        {ready && user && (
          <div className="at-heat">
            <button
              className={`at-heat-toggle ${barHeatOn ? 'at-heat-toggle--on' : ''}`}
              onClick={toggleBarHeat}
              title={barHeatOn
                ? 'Ukryj ślady ćwiczeń na tabulaturze (H)'
                : 'Pokoloruj takty wg tego, ile razem razy je przerabiałeś (H)'}
            >ŚLADY</button>

            {barHeatOn && (
              <span className="at-heat-legend" title="Czerwone — ćwiczone rzadko, zielone — najwięcej powtórzeń">
                <span className="at-heat-legend-label">rzadko</span>
                <span
                  className="at-heat-legend-gradient"
                  style={{ background: RAMP_GRADIENT_CSS }}
                />
                <span className="at-heat-legend-label">często</span>
              </span>
            )}
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

        {/* Analiza riffów */}
        <button
          className="at-btn at-btn-riffs"
          onClick={() => setShowRiffs(true)}
          disabled={!ready}
          title="Analiza riffów — powtórzenia i warianty"
        ><IconMusicNote /> Riffy</button>

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
        {error && <div className="at-overlay at-error"><span><IconWarning /> {error}</span></div>}
        <div ref={containerRef} className={`at-surface ${loading ? 'is-loading' : ''}`} />
      </div>
    </div>
    </>
  )
}
