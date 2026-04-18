import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboard } from '../api/practice'
import './ProgressPage.css'

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(seconds) {
  if (!seconds) return '0 min'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m} min`
  return `${seconds}s`
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
}

// Generuje 84-dniową siatkę (12 tygodni × 7) od dziś wstecz
function buildCalendarGrid(dailySeconds) {
  const now = new Date()
  // UTC-midnight dzisiejszej daty UTC — żeby klucze zgadzały się z backendem
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const cells = []
  for (let i = 83; i >= 0; i--) {
    const d = new Date(todayUtc)
    d.setUTCDate(d.getUTCDate() - i)
    const key = d.toISOString().slice(0, 10)
    cells.push({ date: key, seconds: dailySeconds[key] || 0 })
  }
  // Podziel na tygodnie (7 dni każdy)
  const weeks = []
  for (let w = 0; w < 12; w++) {
    weeks.push(cells.slice(w * 7, w * 7 + 7))
  }
  return weeks
}

const DAY_LABELS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']
const MONTH_NAMES = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru']

function calCellColor(seconds, maxSeconds) {
  if (!seconds) return null
  const t = Math.min(seconds / maxSeconds, 1)
  // ciemny niebieski → nasycony akcent
  const r = Math.round(40  + t * 193)
  const g = Math.round(40  + t * 29)
  const b = Math.round(90  + t * 6)
  return `rgb(${r},${g},${b})`
}

// ── ActivityCalendar ────────────────────────────────────────────────────────
function ActivityCalendar({ dailySeconds }) {
  const weeks = buildCalendarGrid(dailySeconds)
  const maxSeconds = Math.max(...Object.values(dailySeconds), 1)
  const today = new Date().toISOString().slice(0, 10)

  // Nagłówki miesięcy
  const monthLabels = []
  weeks.forEach((week, wi) => {
    const firstDay = new Date(week[0].date)
    if (wi === 0 || firstDay.getUTCDate() <= 7) {
      monthLabels.push({ weekIndex: wi, label: MONTH_NAMES[firstDay.getUTCMonth()] })
    }
  })

  return (
    <div className="pg-calendar">
      <div className="pg-calendar-months">
        {monthLabels.map(({ weekIndex, label }) => (
          <span
            key={weekIndex}
            className="pg-calendar-month"
            style={{ gridColumnStart: weekIndex + 1 }}
          >{label}</span>
        ))}
      </div>
      <div className="pg-calendar-body">
        <div className="pg-calendar-days">
          {DAY_LABELS.map(d => <span key={d}>{d}</span>)}
        </div>
        <div className="pg-calendar-grid">
          {weeks.map((week, wi) => (
            <div key={wi} className="pg-calendar-week">
              {week.map(({ date, seconds }) => {
                const color = calCellColor(seconds, maxSeconds)
                const isToday = date === today
                return (
                  <div
                    key={date}
                    className={`pg-calendar-cell ${seconds > 0 ? 'pg-calendar-cell--active' : ''} ${isToday ? 'pg-calendar-cell--today' : ''}`}
                    style={color ? { backgroundColor: color } : undefined}
                    title={seconds > 0 ? `${date}: ${formatTime(seconds)}` : date}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function ProgressPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDashboard()
      .then(({ data: d }) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="pg-loading">
      <div className="spinner" />
    </div>
  )

  if (!data) return (
    <div className="pg-empty-full">
      <p>Nie udało się załadować danych.</p>
    </div>
  )

  const noData = data.total_sessions === 0

  return (
    <div className="pg-page">
      <div className="pg-breadcrumb">
        <Link to="/">← Wszystkie taby</Link>
      </div>

      <div className="pg-hero">
        <h1 className="pg-heading">Moja progresja</h1>
        {data.streak_days > 0 && (
          <div className="pg-streak">
            <span className="pg-streak-fire">🔥</span>
            <span className="pg-streak-count">{data.streak_days}</span>
            <span className="pg-streak-label">{data.streak_days === 1 ? 'dzień z rzędu' : 'dni z rzędu'}</span>
          </div>
        )}
      </div>

      {noData ? (
        <div className="pg-empty">
          <div className="pg-empty-icon">🎸</div>
          <p>Jeszcze brak sesji ćwiczeń.</p>
          <p className="pg-empty-sub">Zacznij grać — dane pojawią się automatycznie.</p>
          <Link to="/" className="btn btn-primary">Przeglądaj taby</Link>
        </div>
      ) : (
        <>
          {/* ── Główne statystyki ─────────────────────────────── */}
          <div className="pg-stats-grid">
            <div className="pg-stat-card">
              <span className="pg-stat-icon">🎵</span>
              <span className="pg-stat-val">{data.total_sessions}</span>
              <span className="pg-stat-lbl">Sesji łącznie</span>
            </div>
            <div className="pg-stat-card">
              <span className="pg-stat-icon">⏱</span>
              <span className="pg-stat-val">{formatTime(data.total_seconds)}</span>
              <span className="pg-stat-lbl">Czas ćwiczeń</span>
            </div>
            <div className="pg-stat-card">
              <span className="pg-stat-icon">🎸</span>
              <span className="pg-stat-val">{data.songs?.length ?? 0}</span>
              <span className="pg-stat-lbl">Ćwiczonych piosenek</span>
            </div>
          </div>

          {/* ── Heatmapa aktywności ───────────────────────────── */}
          <section className="pg-section">
            <h2 className="pg-section-title">Aktywność (ostatnie 12 tygodni)</h2>
            <ActivityCalendar dailySeconds={data.daily_seconds ?? {}} />
          </section>

          {/* ── Lista piosenek ────────────────────────────────── */}
          {data.songs?.length > 0 && (
            <section className="pg-section">
              <h2 className="pg-section-title">Ćwiczone piosenki</h2>
              <div className="pg-songs">
                {data.songs.map(song => (
                  <Link
                    key={song.song_id}
                    to={`/player/${song.song_id}`}
                    className="pg-song-row"
                  >
                    <div className="pg-song-info">
                      <span className="pg-song-title">{song.song__title}</span>
                      <span className="pg-song-artist">{song.song__artist}</span>
                    </div>
                    <div className="pg-song-meta">
                      {song.best_bpm != null && (
                        <span className="pg-song-bpm">{Math.round(song.best_bpm)}% BPM</span>
                      )}
                      <span className="pg-song-sessions">{song.session_count} {song.session_count === 1 ? 'sesja' : 'sesji'}</span>
                      <span className="pg-song-time">{formatTime(song.total_song_seconds)}</span>
                      <span className="pg-song-date">{formatDate(song.last_practiced)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
