import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { usePlayer } from '../context/PlayerContext'
import { useAuth } from '../context/AuthContext'
import { IconGuitar, IconChartLine, IconSearch, IconPlus, IconMusicNote } from './icons'
import './Sidebar.css'

const ORDERING_OPTIONS = [
  { value: '-recent_at', label: 'Ostatnio grane' },
  { value: '-created_at', label: 'Ostatnio dodane' },
  { value: 'title', label: 'Tytuł A–Z' },
  { value: 'artist', label: 'Wykonawca A–Z' },
  { value: '-play_count', label: 'Najczęściej grane' },
]

export default function Sidebar({ collapsed, onToggle }) {
  const { songs, loading, next, loadMore, search, setSearch, ordering, setOrdering, setShowUpload } = useLibrary()
  const { sections, seekToBar } = usePlayer()
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const activeMatch = location.pathname.match(/^\/player\/(\d+)/)
  const activeId = activeMatch ? activeMatch[1] : null

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  // ── Tryb zwinięty — wąski pasek z ikonami ──────────────────────────────────
  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button className="sb-collapse-btn" onClick={onToggle} title="Rozwiń">»</button>
        <button className="sb-new-icon" onClick={() => setShowUpload(true)} title="Nowa tabulatura"><IconPlus /></button>
        <nav className="sb-list-collapsed">
          {songs.map(s => (
            <Link
              key={s.id}
              to={`/player/${s.id}`}
              className={`sb-icon-item ${String(s.id) === activeId ? 'active' : ''}`}
              title={`${s.title} — ${s.artist}`}
            >
              {s.title?.[0]?.toUpperCase() || <IconMusicNote />}
            </Link>
          ))}
        </nav>
        <div className="sb-bottom-collapsed">
          <Link
            to="/progress"
            className={`sb-icon-item ${location.pathname === '/progress' ? 'active' : ''}`}
            title="Progresja"
          ><IconChartLine /></Link>
        </div>
      </aside>
    )
  }

  // ── Tryb pełny ─────────────────────────────────────────────────────────────
  return (
    <aside className="sidebar">
      <div className="sb-top">
        <Link to="/" className="sb-brand">
          <span className="brand-icon"><IconGuitar /></span>
          <span className="brand-name">GuitarTab</span>
        </Link>
        <button className="sb-collapse-btn" onClick={onToggle} title="Zwiń">«</button>
      </div>

      <button className="btn btn-primary sb-new" onClick={() => setShowUpload(true)}>
        <IconPlus /> Nowa tabulatura
      </button>

      <div className="sb-search">
        <span className="search-icon"><IconSearch /></span>
        <input
          type="search"
          placeholder="Szukaj tytułu, wykonawcy…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <select className="sb-ordering" value={ordering} onChange={e => setOrdering(e.target.value)}>
        {ORDERING_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <nav className="sb-list">
        {songs.map(s => {
          const isActive = String(s.id) === activeId
          return (
            <div key={s.id} className="sb-item-wrap">
              <Link to={`/player/${s.id}`} className={`sb-item ${isActive ? 'active' : ''}`}>
                <span className="sb-item-title">{s.title}</span>
                <span className="sb-item-artist">{s.artist}</span>
              </Link>

              {isActive && sections?.length > 0 && (
                <div className="sb-sections">
                  {sections.map((sec, i) => (
                    <button
                      key={`${sec.bar}-${i}`}
                      className="sb-section"
                      onClick={() => seekToBar?.(sec.bar)}
                      title={`Takt ${sec.bar}`}
                    >
                      <span className="sb-section-bar">{sec.bar}</span>
                      <span className="sb-section-label">{sec.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {loading && <div className="sb-loading"><div className="spinner" /></div>}
        {!loading && songs.length === 0 && <div className="sb-empty">Brak tabulatur</div>}
        {next && !loading && (
          <button className="sb-loadmore" onClick={loadMore}>Załaduj więcej</button>
        )}
      </nav>

      <div className="sb-bottom">
        <Link
          to="/progress"
          className={`sb-bottom-link ${location.pathname === '/progress' ? 'active' : ''}`}
        ><IconChartLine /> Progresja</Link>

        {user ? (
          <div className="sb-user">
            <span className="sb-username">{user.username}</span>
            <button className="sb-logout" onClick={handleLogout}>Wyloguj</button>
          </div>
        ) : (
          <Link to="/login" className="sb-bottom-link">Zaloguj się</Link>
        )}
      </div>
    </aside>
  )
}
