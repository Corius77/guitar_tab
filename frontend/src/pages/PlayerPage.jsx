import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getSong, deleteSong, playSong } from '../api/songs'
import { getSongStats } from '../api/practice'
import AlphaTabPlayer from '../components/AlphaTabPlayer'
import HeatmapModal from '../components/HeatmapModal'
import { useAuth } from '../context/AuthContext'
import './PlayerPage.css'
import '../components/HeatmapModal.css'

const DIFF_LABELS = ['', 'Beginner', 'Easy', 'Intermediate', 'Hard', 'Expert']

export default function PlayerPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [song, setSong] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [stats, setStats] = useState(null)
  const [heatmapOpen, setHeatmapOpen] = useState(false)

  const fetchStats = useCallback(() => {
    if (!user) return
    getSongStats(id).then(({ data }) => setStats(data)).catch(() => {})
  }, [id, user])

  useEffect(() => {
    setLoading(true)
    getSong(id)
      .then(({ data }) => {
        setSong(data)
        playSong(id).catch(() => {})
      })
      .catch(() => setError('Tab not found.'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { fetchStats() }, [fetchStats])

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${song.title}"?`)) return
    setDeleting(true)
    try {
      await deleteSong(id)
      navigate('/')
    } catch {
      alert('Failed to delete.')
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="player-loading">
      <div className="spinner" />
    </div>
  )

  if (error) return (
    <div className="player-error">
      <p>{error}</p>
      <Link to="/" className="btn btn-ghost">← Back</Link>
    </div>
  )

  const isOwner = user && (user.username === song.uploaded_by || user.is_staff)

  return (
    <div className="player-page">
      <div className="player-breadcrumb">
        <Link to="/">← All Tabs</Link>
      </div>

      <div className="player-meta">
        <div className="player-title-area">
          <h1>{song.title}</h1>
          <span className="player-artist">{song.artist}</span>
          {song.album && (
            <span className="player-album">
              {song.album}{song.year ? ` · ${song.year}` : ''}
            </span>
          )}
        </div>
        <div className="player-tags">
          {song.genre && <span className="tag">{song.genre.name}</span>}
          {song.difficulty && <span className="tag">{DIFF_LABELS[song.difficulty]}</span>}
          <span className="tag">▶ {song.play_count.toLocaleString()} plays</span>
          {song.uploaded_by && (
            <span className="tag tag-uploader">by {song.uploaded_by}</span>
          )}
        </div>
        {isOwner && (
          <button
            className="btn btn-danger btn-sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>

      {song.description && (
        <p className="player-description">{song.description}</p>
      )}

      <AlphaTabPlayer
        fileUrl={song.tab_file_url}
        songId={song.id}
        onStatsChange={fetchStats}
      />

      {user && stats && stats.total_sessions > 0 && (
        <button className="hm-fab" onClick={() => setHeatmapOpen(true)} title="Statystyki ćwiczeń">
          <span className="hm-fab-icon">📊</span>
          Statystyki
          <span className="hm-fab-dot" />
        </button>
      )}

      {heatmapOpen && stats && (
        <HeatmapModal stats={stats} onClose={() => setHeatmapOpen(false)} />
      )}
    </div>
  )
}
