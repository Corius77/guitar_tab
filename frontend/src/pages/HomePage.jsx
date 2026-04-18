import { useState, useEffect, useCallback } from 'react'
import { getSongs } from '../api/songs'
import SongCard from '../components/SongCard'
import UploadModal from '../components/UploadModal'
import { useAuth } from '../context/AuthContext'
import './HomePage.css'

const ORDERING_OPTIONS = [
  { value: '-created_at', label: 'Newest' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'artist', label: 'Artist A–Z' },
  { value: '-play_count', label: 'Most Played' },
]

export default function HomePage() {
  const { user } = useAuth()
  const [songs, setSongs] = useState([])
  const [count, setCount] = useState(0)
  const [next, setNext] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [ordering, setOrdering] = useState('-created_at')
  const [showUpload, setShowUpload] = useState(false)
  const [page, setPage] = useState(1)

  const fetchSongs = useCallback(async (pageNum = 1, reset = true) => {
    setLoading(true)
    try {
      const { data } = await getSongs({
        search: search || undefined,
        ordering,
        page: pageNum,
      })
      if (reset) {
        setSongs(data.results)
      } else {
        setSongs(prev => [...prev, ...data.results])
      }
      setCount(data.count)
      setNext(data.next)
    } finally {
      setLoading(false)
    }
  }, [search, ordering])

  // Reset to page 1 on search/ordering change
  useEffect(() => {
    setPage(1)
    fetchSongs(1, true)
  }, [fetchSongs])

  const loadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    fetchSongs(nextPage, false)
  }

  const handleUploadSuccess = (newSong) => {
    setSongs(prev => [newSong, ...prev])
    setCount(c => c + 1)
  }

  return (
    <div className="home">
      <div className="home-header">
        <div className="home-title">
          <h1>Guitar Tabs</h1>
          <span className="song-count">{count.toLocaleString()} tabs</span>
        </div>

        <div className="home-toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="search"
              placeholder="Search by title, artist, album…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select value={ordering} onChange={e => setOrdering(e.target.value)} className="ordering-select">
            {ORDERING_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {user && (
            <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
              + Upload Tab
            </button>
          )}
        </div>
      </div>

      <div className="song-list">
        {songs.map(song => <SongCard key={song.id} song={song} />)}
      </div>

      {loading && (
        <div className="list-loading">
          <div className="spinner" />
        </div>
      )}

      {!loading && songs.length === 0 && (
        <div className="empty-state">
          <p>🎸 No tabs found.</p>
          {user && <button className="btn btn-primary" onClick={() => setShowUpload(true)}>Upload first tab</button>}
        </div>
      )}

      {next && !loading && (
        <div className="load-more">
          <button className="btn btn-ghost" onClick={loadMore}>Load more</button>
        </div>
      )}

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onSuccess={handleUploadSuccess} />
      )}
    </div>
  )
}
