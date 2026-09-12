import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  RAMP_GRADIENT_CSS,
  DEFAULT_RECENT_DAYS,
  rampColorCss,
  daysSince,
  formatDaysAgo,
  freshnessFromDays,
  heatScale,
  pickMeasure,
} from '../utils/practiceHeat'
import './MeasureHeatmap.css'

const GAP = 2
const RADIUS = 2

// Stała pusta mapa — żeby brak propsa nie tworzył nowej referencji co render.
const EMPTY = {}

/** Mapuje intensywność 0–1 na kolor sepiowej skali (przygaszona oliwka → bursztyn → gorąca rdza). */
function heatColor(intensity) {
  if (intensity <= 0) return null
  let r, g, b
  if (intensity < 0.5) {
    const t = intensity * 2
    r = Math.round(95  + t * 115)
    g = Math.round(90  + t * 60)
    b = Math.round(55  + t * 5)
  } else {
    const t = (intensity - 0.5) * 2
    r = Math.round(210 - t * 10)
    g = Math.round(150 - t * 100)
    b = Math.round(60  - t * 40)
  }
  return `rgb(${r},${g},${b})`
}

function formatSeconds(s) {
  if (!s) return '0 min'
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m === 0) return `${sec}s`
  return sec > 0 ? `${m} min ${sec}s` : `${m} min`
}

/** Oblicza lewą krawędź i szerokość paska i (0-based) bez kumulowania błędu. */
function barRect(i, total, canvasW) {
  const x = Math.round(i * (canvasW + GAP) / total)
  const xNext = Math.round((i + 1) * (canvasW + GAP) / total)
  return { x, w: xNext - x - GAP }
}

function drawHeatmap(canvas, totalBars, colorAt, emptyColor) {
  const dpr = window.devicePixelRatio || 1
  const W = canvas.offsetWidth
  const H = canvas.offsetHeight
  if (!W || !H) return

  canvas.width  = W * dpr
  canvas.height = H * dpr

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  for (let i = 0; i < totalBars; i++) {
    const color = colorAt(i + 1) ?? emptyColor

    const { x, w } = barRect(i, totalBars, W)
    if (w <= 0) continue

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(x, 0, w, H, RADIUS)
    ctx.fill()
  }
}

export default function MeasureHeatmap({
  totalBars,
  measureHeat = EMPTY,
  measureHeatRecent = EMPTY,
  measureLastPracticed = EMPTY,
  recentDays = DEFAULT_RECENT_DAYS,
  totalSessions,
  totalSeconds,
  bestBpmPercent,
  coveragePercent,
  coverageRecentPercent,
}) {
  const canvasRef = useRef(null)
  const emptyColorRef = useRef('#2a231c')  // kolor pustego paska, czytany z CSS
  const [tooltip, setTooltip] = useState(null)  // { x, y, text }
  const [mode, setMode] = useState('heat')      // 'heat' = intensywność, 'recent' = świeżość

  // Szczyt skali ten sam co przy kolorowaniu taktów na tabulaturze — inaczej
  // te same dane wyglądałyby inaczej w dwóch miejscach.
  const maxHeat = useMemo(
    () => heatScale(Math.max(...Object.values(measureHeat).map(Number), 1)),
    [measureHeat],
  )

  // Kolor paska zależnie od trybu: sepia wg liczby przejść albo skala wieku.
  // Skala wieku jest ta sama, co przy kolorowaniu taktów na tabulaturze.
  const colorAt = useCallback((m) => {
    if (mode === 'recent') {
      const f = freshnessFromDays(daysSince(pickMeasure(measureLastPracticed, m)), recentDays)
      return f <= 0 ? null : rampColorCss(f)
    }
    return heatColor(Number(pickMeasure(measureHeat, m) ?? 0) / maxHeat)
  }, [mode, measureHeat, measureLastPracticed, maxHeat, recentDays])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawHeatmap(canvas, totalBars, colorAt, emptyColorRef.current)
  }, [totalBars, colorAt])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Odczytaj kolor tła z CSS custom property
    const style = getComputedStyle(canvas.closest('.mh-wrap') ?? canvas)
    emptyColorRef.current = style.getPropertyValue('--surface-3').trim() || '#2a231c'

    redraw()

    const ro = new ResizeObserver(redraw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [redraw])

  if (!totalBars || totalBars === 0) return null

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left

    // Znajdź pasek pod kursorem
    const bar = Math.floor(mouseX * totalBars / (rect.width + GAP))
    const m = Math.max(1, Math.min(totalBars, bar + 1))

    let text
    if (mode === 'recent') {
      const days = daysSince(pickMeasure(measureLastPracticed, m))
      const rec = Number(pickMeasure(measureHeatRecent, m) ?? 0)
      if (days == null) {
        text = `Takt ${m} · niećwiczony`
      } else if (rec > 0) {
        text = `Takt ${m} · ${formatDaysAgo(days)} · zagrany ${rec}× / ${recentDays} dni`
      } else {
        text = `Takt ${m} · ${formatDaysAgo(days)}`
      }
    } else {
      const heat = Number(pickMeasure(measureHeat, m) ?? 0)
      text = heat > 0
        ? `Takt ${m}: zagrany ${heat}×`
        : `Takt ${m}`
    }
    setTooltip({ x: e.clientX, y: e.clientY, text })
  }

  const isRecent = mode === 'recent'
  const coverageValue = isRecent ? coverageRecentPercent : coveragePercent

  return (
    <div className="mh-wrap">
      {/* Statystyki */}
      <div className="mh-stats">
        <div className="mh-stat">
          <span className="mh-stat-value">{totalSessions ?? 0}</span>
          <span className="mh-stat-label">sesji</span>
        </div>
        <div className="mh-stat-sep" />
        <div className="mh-stat">
          <span className="mh-stat-value">{formatSeconds(totalSeconds)}</span>
          <span className="mh-stat-label">łącznie</span>
        </div>
        <div className="mh-stat-sep" />
        <div className="mh-stat">
          <span className="mh-stat-value">
            {bestBpmPercent != null ? `${Math.round(bestBpmPercent)}%` : '—'}
          </span>
          <span className="mh-stat-label">max BPM</span>
        </div>
        <div className="mh-stat-sep" />
        <div className="mh-stat">
          <span className="mh-stat-value">
            {coverageValue != null ? `${Math.round(coverageValue)}%` : '—'}
          </span>
          <span className="mh-stat-label">
            {isRecent ? `pokrycia / ${recentDays} dni` : 'pokrycia'}
          </span>
        </div>
      </div>

      {/* Heatmapa taktów */}
      <div className="mh-header">
        <div className="mh-modes">
          <button
            className={`mh-mode${!isRecent ? ' is-active' : ''}`}
            onClick={() => setMode('heat')}
          >
            Intensywność
          </button>
          <button
            className={`mh-mode${isRecent ? ' is-active' : ''}`}
            onClick={() => setMode('recent')}
          >
            Ostatnio
          </button>
        </div>
        <span className="mh-subtitle">{totalBars} taktów</span>
      </div>

      <div className="mh-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="mh-canvas"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        />
        {tooltip && (
          <div
            className="mh-tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className="mh-legend">
        <span className="mh-legend-label">{isRecent ? 'Dawno' : 'Rzadko'}</span>
        <div
          className="mh-legend-gradient"
          style={isRecent ? { background: RAMP_GRADIENT_CSS, opacity: 1 } : undefined}
        />
        <span className="mh-legend-label">{isRecent ? 'Dziś' : 'Często'}</span>
      </div>
    </div>
  )
}
