import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getSong, deleteSong, playSong, addSongVideo, deleteSongVideo, updateSongVideo } from '../api/songs'
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
  const [showYoutube, setShowYoutube] = useState(false)
  const [ytPlayer, setYtPlayer] = useState(null)
  const [activeVideoIndex, setActiveVideoIndex] = useState(0)
  const [lastYtTimes, setLastYtTimes] = useState({}) // { videoId: time }

  const getYouTubeId = (url) => {
    if (!url) return null
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
    const match = url.match(regExp)
    return (match && match[2].length === 11) ? match[2] : match && match[2].length > 11 ? match[2].substring(0, 11) : null
  }

  const handleAddYoutube = async () => {
    const url = window.prompt('Paste YouTube video URL:')
    if (!url) return
    const title = window.prompt('Optional title for this video:')
    try {
      const { data } = await addSongVideo({ song: id, url, title })
      setSong(prev => ({ ...prev, videos: [...prev.videos, data] }))
      // If it's the first video, it will be active automatically
    } catch {
      alert('Failed to add YouTube video.')
    }
  }

  const handleDeleteVideo = async (videoId, e) => {
    e.stopPropagation()
    if (!window.confirm('Remove this video?')) return
    try {
      await deleteSongVideo(videoId)
      const newVideos = song.videos.filter(v => v.id !== videoId)
      setSong(prev => ({ ...prev, videos: newVideos }))
      if (activeVideoIndex >= newVideos.length) {
        setActiveVideoIndex(Math.max(0, newVideos.length - 1))
      }
    } catch {
      alert('Failed to delete video.')
    }
  }

  const handleRenameVideo = async (video, e) => {
    e.stopPropagation()
    const newTitle = window.prompt('Enter new title for this video:', video.title || '')
    if (newTitle === null) return
    try {
      const { data } = await updateSongVideo(video.id, { title: newTitle })
      setSong(prev => ({
        ...prev,
        videos: prev.videos.map(v => v.id === video.id ? data : v)
      }))
    } catch {
      alert('Failed to rename video.')
    }
  }

  // YouTube API initialization
  useEffect(() => {
    if (!song?.videos?.length || !showYoutube) return
    const currentVideo = song.videos[activeVideoIndex]
    const videoId = getYouTubeId(currentVideo?.url)
    if (!videoId) return

    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = "https://www.youtube.com/iframe_api"
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)
    }

    const createPlayer = () => {
      new window.YT.Player('youtube-player-element', {
        videoId: videoId,
        playerVars: {
          'autoplay': 1,
          'start': Math.floor(lastYtTimes[videoId] || 0),
        },
        events: {
          'onReady': (event) => setYtPlayer(event.target),
        }
      })
    }

    if (window.YT && window.YT.Player) {
      createPlayer()
    } else {
      window.onYouTubeIframeAPIReady = createPlayer
    }

    return () => {
      setYtPlayer(null)
    }
  }, [showYoutube, activeVideoIndex, song?.videos])

  const handleCloseYoutube = () => {
    if (ytPlayer && ytPlayer.getCurrentTime) {
      const currentVideo = song.videos[activeVideoIndex]
      const vId = getYouTubeId(currentVideo.url)
      setLastYtTimes(prev => ({ ...prev, [vId]: ytPlayer.getCurrentTime() }))
    }
    setShowYoutube(false)
    setYtPlayer(null)
  }

  const handleSwitchVideo = (index) => {
    if (ytPlayer && ytPlayer.getCurrentTime) {
      const currentVideo = song.videos[activeVideoIndex]
      const vId = getYouTubeId(currentVideo.url)
      setLastYtTimes(prev => ({ ...prev, [vId]: ytPlayer.getCurrentTime() }))
    }
    setActiveVideoIndex(index)
    setYtPlayer(null) 
  }

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

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      
      if (e.key.toLowerCase() === 'v') {
        if (song?.videos?.length > 0) {
          if (showYoutube) {
            handleCloseYoutube()
          } else {
            setShowYoutube(true)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showYoutube, song?.videos, handleCloseYoutube])

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
          {song.videos?.length > 0 ? (
            <button 
              className={`tag tag-yt ${showYoutube ? 'active' : ''}`}
              onClick={() => showYoutube ? handleCloseYoutube() : setShowYoutube(true)}
            >
              📺 YouTube ({song.videos.length})
            </button>
          ) : isOwner && (
            <button className="tag tag-yt-add" onClick={handleAddYoutube}>
              ➕ Add YouTube Video
            </button>
          )}
          {isOwner && song.videos?.length > 0 && (
            <button className="tag tag-edit" onClick={handleAddYoutube} title="Add Another Video">
              ➕
            </button>
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

      {showYoutube && song.videos?.length > 0 && (
        <div className="player-yt-modal-backdrop" onClick={handleCloseYoutube}>
          <div className="player-youtube-modal" onClick={e => e.stopPropagation()}>
            <div className="player-youtube-header">
              <div className="player-youtube-tabs">
                {song.videos.map((v, i) => (
                  <div key={v.id} className={`yt-tab-wrapper ${activeVideoIndex === i ? 'active' : ''}`}>
                    <button 
                      className="yt-tab-btn"
                      onClick={() => handleSwitchVideo(i)}
                    >
                      {v.title || `Wideo ${i + 1}`}
                    </button>
                    {isOwner && (
                      <div className="yt-tab-actions">
                        <button className="yt-tab-action yt-tab-rename" onClick={(e) => handleRenameVideo(v, e)} title="Zmień nazwę">✏️</button>
                        <button className="yt-tab-action yt-tab-delete" onClick={(e) => handleDeleteVideo(v.id, e)} title="Usuń wideo">✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button className="player-youtube-close" onClick={handleCloseYoutube}>✕</button>
            </div>
            <div className="player-youtube-body">
              <div id="youtube-player-element"></div>
            </div>
          </div>
        </div>
      )}

      <AlphaTabPlayer
        fileUrl={song.tab_file_url}
        songId={song.id}
        onStatsChange={fetchStats}
      />

      <div className="player-fabs">
        {song.videos?.length > 0 && (
          <button 
            className={`yt-fab ${showYoutube ? 'active' : ''}`} 
            onClick={() => showYoutube ? handleCloseYoutube() : setShowYoutube(true)} 
            title="Odtwarzacz YouTube"
          >
            <span className="yt-fab-icon">📺</span>
            <span className="yt-fab-text">Wideo ({song.videos.length})</span>
          </button>
        )}

        {user && stats && stats.total_sessions > 0 && (
          <button className="hm-fab" onClick={() => setHeatmapOpen(true)} title="Statystyki ćwiczeń">
            <span className="hm-fab-icon">📊</span>
            <span className="yt-fab-text">Statystyki</span>
            <span className="hm-fab-dot" />
          </button>
        )}
      </div>

      {heatmapOpen && stats && (
        <HeatmapModal stats={stats} onClose={() => setHeatmapOpen(false)} />
      )}
    </div>
  )
}
