import { Link } from 'react-router-dom'
import './SongCard.css'

const DIFF_LABELS = ['', 'Beginner', 'Easy', 'Intermediate', 'Hard', 'Expert']
const DIFF_COLORS = ['', '#4caf50', '#8bc34a', '#ffc107', '#ff9800', '#f44336']

export default function SongCard({ song }) {
  const ext = song.file_extension?.replace('.', '').toUpperCase() || 'GP'

  return (
    <Link to={`/player/${song.id}`} className="song-card">
      <div className="song-card-ext">{ext}</div>
      <div className="song-card-body">
        <div className="song-title">{song.title}</div>
        <div className="song-artist">{song.artist}</div>
        {song.album && <div className="song-album">{song.album}{song.year ? ` (${song.year})` : ''}</div>}
      </div>
      <div className="song-card-meta">
        {song.genre && <span className="tag">{song.genre.name}</span>}
        {song.difficulty && (
          <span className="tag" style={{ color: DIFF_COLORS[song.difficulty] }}>
            {DIFF_LABELS[song.difficulty]}
          </span>
        )}
        <span className="play-count">▶ {song.play_count.toLocaleString()}</span>
      </div>
    </Link>
  )
}
