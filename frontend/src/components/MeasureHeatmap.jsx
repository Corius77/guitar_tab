import { useRef, useEffect, useState, useCallback } from 'react'
import './MeasureHeatmap.css'

const GAP = 2
const RADIUS = 2

/** Mapuje intensywność 0–1 na kolor (zimny → ciepły → gorący). */
function heatColor(intensity) {
  if (intensity <= 0) return null
  let r, g, b
  if (intensity < 0.5) {
    const t = intensity * 2
    r = Math.round(30  + t * 200)
    g = Math.round(80  + t * 80)
    b = Math.round(200 - t * 160)
  } else {
    const t = (intensity - 0.5) * 2
    r = Math.round(230 + t * 23)
    g = Math.round(160 - t * 95)
    b = Math.round(40  - t * 40)
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

function drawHeatmap(canvas, totalBars, measureHeat, maxHeat, emptyColor) {
  const dpr = window.devicePixelRatio || 1
  const W = canvas.offsetWidth
  const H = canvas.offsetHeight
  if (!W || !H) return

  canvas.width  = W * dpr
  canvas.height = H * dpr

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  for (let i = 0; i < totalBars; i++) {
    const m = i + 1
    const heat = Number(measureHeat[m] ?? measureHeat[String(m)] ?? 0)
    const color = heatColor(heat / maxHeat) ?? emptyColor

    const { x, w } = barRect(i, totalBars, W)
    if (w <= 0) continue

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(x, 0, w, H, RADIUS)
    ctx.fill()
  }
}

export default function MeasureHeatmap({ totalBars, measureHeat, totalSessions, totalSeconds, bestBpmPercent, coveragePercent }) {
  if (!totalBars || totalBars === 0) return null

  const maxHeat = Math.max(...Object.values(measureHeat).map(Number), 1)

  const canvasRef = useRef(null)
  const [tooltip, setTooltip] = useState(null) // { x, text }

  // Kolor pustego paska — odczytujemy z CSS
  const emptyColorRef = useRef('#2a2a4a')

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawHeatmap(canvas, totalBars, measureHeat, maxHeat, emptyColorRef.current)
  }, [totalBars, measureHeat, maxHeat])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Odczytaj kolor tła z CSS custom property
    const style = getComputedStyle(canvas.closest('.mh-wrap') ?? canvas)
    emptyColorRef.current = style.getPropertyValue('--surface-3').trim() || '#2a2a4a'

    redraw()

    const ro = new ResizeObserver(redraw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [redraw])

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const W = rect.width

    // Znajdź pasek pod kursorem
    const bar = Math.floor(mouseX * totalBars / (W + GAP))
    const m = Math.max(1, Math.min(totalBars, bar + 1))
    const heat = Number(measureHeat[m] ?? measureHeat[String(m)] ?? 0)
    const text = heat > 0
      ? `Takt ${m}: ${heat} ${heat === 1 ? 'pętla' : 'pętle'}`
      : `Takt ${m}`
    setTooltip({ x: e.clientX, y: e.clientY, text })
  }

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
            {coveragePercent != null ? `${Math.round(coveragePercent)}%` : '—'}
          </span>
          <span className="mh-stat-label">pokrycia</span>
        </div>
      </div>

      {/* Heatmapa taktów */}
      <div className="mh-header">
        <span className="mh-title">Intensywność ćwiczeń</span>
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
        <span className="mh-legend-label">Rzadko</span>
        <div className="mh-legend-gradient" />
        <span className="mh-legend-label">Często</span>
      </div>
    </div>
  )
}
