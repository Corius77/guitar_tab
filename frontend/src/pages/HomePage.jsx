import { Link } from 'react-router-dom'
import { useLibrary } from '../context/LibraryContext'
import { useAuth } from '../context/AuthContext'
import { IconGuitar, IconPlus } from '../components/icons'
import './HomePage.css'

export default function HomePage() {
  const { songs, setShowUpload } = useLibrary()
  const { user } = useAuth()
  const recent = songs.slice(0, 6)

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <span className="welcome-icon"><IconGuitar /></span>
        <h1>Witaj{user ? `, ${user.username}` : ''}</h1>
        <p className="welcome-sub">
          Wybierz tabulaturę z panelu po lewej albo dodaj nową.
        </p>

        {user && (
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
            <IconPlus /> Nowa tabulatura
          </button>
        )}

        {recent.length > 0 && (
          <div className="welcome-recent">
            <div className="welcome-recent-label">Ostatnio dodane</div>
            <div className="welcome-recent-list">
              {recent.map(s => (
                <Link key={s.id} to={`/player/${s.id}`} className="welcome-recent-item">
                  <span className="wr-title">{s.title}</span>
                  <span className="wr-artist">{s.artist}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
