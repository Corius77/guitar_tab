import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getSong, deleteSong, playSong, addSongVideo, deleteSongVideo, updateSongVideo } from '../api/songs'
import { getSongStats } from '../api/practice'
import AlphaTabPlayer from '../components/AlphaTabPlayer'
import HeatmapModal from '../components/HeatmapModal'
import { useAuth } from '../context/AuthContext'
import { useLibrary } from '../context/LibraryContext'
import { IconPlay, IconVideo, IconPlus, IconEdit, IconClose, IconChartBar, IconChevronLeft } from '../components/icons'
import './PlayerPage.css'
import '../components/HeatmapModal.css'

const DIFF_LABELS = ['', 'Beginner', 'Easy', 'Intermediate', 'Hard', 'Expert']

export default function PlayerPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { touchSong } = useLibrary()
  const navigate = useNavigate()
  const [song, setSong] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [stats, setStats] = useState(null)
  const [heatmapOpen, setHeatmapOpen] = useState(false)
  const [showYoutube, setShowYoutube] = useState(false)
  const [activeVideoIndex, setActiveVideoIndex] = useState(0)
  const ytPlayerRef = useRef(null)
  const ytHostRef = useRef(null)
  const lastYtTimesRef = useRef({}) // { videoId: czas }

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
      const removedIndex = song.videos.findIndex(v => v.id === videoId)
      const newVideos = song.videos.filter(v => v.id !== videoId)
      setSong(prev => ({ ...prev, videos: newVideos }))
      // usuniecie karty przed aktywna przesuwa indeksy - trzymaj sie tego samego wideo
      setActiveVideoIndex(idx => {
        const next = removedIndex < idx ? idx - 1 : idx
        return Math.min(Math.max(0, next), Math.max(0, newVideos.length - 1))
      })
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

  const videos = song?.videos
  const activeVideo = videos?.[activeVideoIndex]
  const activeVideoId = getYouTubeId(activeVideo?.url)

  const saveYtTime = () => {
    const p = ytPlayerRef.current
    if (!p || !p.getCurrentTime || !activeVideoId) return
    try {
      lastYtTimesRef.current[activeVideoId] = p.getCurrentTime()
    } catch { /* ramka juz zamknieta */ }
  }

  // YouTube API initialization
  useEffect(() => {
    if (!showYoutube || !activeVideoId) return
    let cancelled = false

    const createPlayer = () => {
      const host = ytHostRef.current
      if (cancelled || !host) return
      // YT podmienia podany element na <iframe>, wiec przy kazdej zmianie karty
      // dajemy mu swiezy kontener. Bez tego drugi Player tylko podpina sie do
      // starej ramki (ten sam id) i wideo sie nie przelacza.
      host.innerHTML = ''
      const mount = document.createElement('div')
      host.appendChild(mount)
      ytPlayerRef.current = new window.YT.Player(mount, {
        videoId: activeVideoId,
        playerVars: {
          'autoplay': 1,
          'start': Math.floor(lastYtTimesRef.current[activeVideoId] || 0),
        },
        events: {
          'onReady': (event) => {
            if (cancelled) { try { event.target.destroy() } catch { /* ignore */ } }
          },
        }
      })
    }

    if (window.YT && window.YT.Player) {
      createPlayer()
    } else {
      if (!window.YT) {
        const tag = document.createElement('script')
        tag.src = "https://www.youtube.com/iframe_api"
        const firstScriptTag = document.getElementsByTagName('script')[0]
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)
      }
      const prevReady = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevReady === 'function') prevReady()
        createPlayer()
      }
    }

    return () => {
      cancelled = true
      saveYtTime()
      try { ytPlayerRef.current?.destroy?.() } catch { /* ignore */ }
      ytPlayerRef.current = null
      if (ytHostRef.current) ytHostRef.current.innerHTML = ''
    }
  }, [showYoutube, activeVideoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCloseYoutube = useCallback(() => {
    saveYtTime()
    setShowYoutube(false)
  }, [activeVideoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwitchVideo = (index) => {
    if (index === activeVideoIndex) return
    saveYtTime()
    setActiveVideoIndex(index)
  }

  const fetchStats = useCallback(() => {
    if (!user) return
    getSongStats(id).then(({ data }) => setStats(data)).catch(() => {})
  }, [id, user])

  useEffect(() => {
    let cancelled = false
    // Pierwsze wejście (brak utworu) → pełny spinner. Kolejne przejścia →
    // zostaw poprzedni utwór widoczny aż nowy się załaduje, żeby layout się
    // nie zwijał (płynny crossfade jak przy przełączaniu czatów). Przy zmianie
    // `id` render ma jeszcze stary `song`, więc spinner pokaże się tylko za
    // pierwszym razem.
    if (!song) setLoading(true)
    setError('')
    getSong(id)
      .then(({ data }) => {
        if (cancelled) return
        setSong(data)
        playSong(id).then(() => touchSong(Number(id))).catch(() => {})
      })
      .catch(() => { if (!cancelled) setError('Tab not found.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchStats() }, [fetchStats])

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+V / Cmd+V to wklejanie, nie skrót do wideo
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      // Don't trigger if user is typing in an input
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

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

  if (loading && !song) return (
    <div className="player-loading">
      <div className="spinner" />
    </div>
  )

  if (error) return (
    <div className="player-error">
      <p>{error}</p>
      <Link to="/" className="btn btn-ghost"><IconChevronLeft /> Back</Link>
    </div>
  )

  const isOwner = user && (user.username === song.uploaded_by || user.is_staff)

  return (
    <div className="player-page">
      <div className="player-head" key={song.id}>
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
          <span className="tag"><IconPlay /> {song.play_count.toLocaleString()} plays</span>
          {song.uploaded_by && (
            <span className="tag tag-uploader">by {song.uploaded_by}</span>
          )}
          {song.videos?.length > 0 ? (
            <button 
              className={`tag tag-yt ${showYoutube ? 'active' : ''}`}
              onClick={() => showYoutube ? handleCloseYoutube() : setShowYoutube(true)}
            >
              <IconVideo /> YouTube ({song.videos.length})
            </button>
          ) : isOwner && (
            <button className="tag tag-yt-add" onClick={handleAddYoutube}>
              <IconPlus /> Add YouTube Video
            </button>
          )}
          {isOwner && song.videos?.length > 0 && (
            <button className="tag tag-edit" onClick={handleAddYoutube} title="Add Another Video">
              <IconPlus />
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
      </div>

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
                        <button className="yt-tab-action yt-tab-rename" onClick={(e) => handleRenameVideo(v, e)} title="Zmień nazwę"><IconEdit /></button>
                        <button className="yt-tab-action yt-tab-delete" onClick={(e) => handleDeleteVideo(v.id, e)} title="Usuń wideo"><IconClose /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button className="player-youtube-close" onClick={handleCloseYoutube}><IconClose /></button>
            </div>
            <div className="player-youtube-body">
              <div className="player-youtube-mount" ref={ytHostRef}></div>
            </div>
          </div>
        </div>
      )}

      <AlphaTabPlayer
        fileUrl={song.tab_file_url}
        songId={song.id}
        stats={stats}
        onStatsChange={fetchStats}
      />

      <div className="player-fabs">
        {song.videos?.length > 0 && (
          <button 
            className={`yt-fab ${showYoutube ? 'active' : ''}`} 
            onClick={() => showYoutube ? handleCloseYoutube() : setShowYoutube(true)} 
            title="Odtwarzacz YouTube"
          >
            <span className="yt-fab-icon"><IconVideo /></span>
            <span className="yt-fab-text">Wideo ({song.videos.length})</span>
          </button>
        )}

        {user && stats && stats.total_sessions > 0 && (
          <button className="hm-fab" onClick={() => setHeatmapOpen(true)} title="Statystyki ćwiczeń">
            <span className="hm-fab-icon"><IconChartBar /></span>
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
