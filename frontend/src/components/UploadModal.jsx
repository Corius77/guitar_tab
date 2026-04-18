import { useState, useEffect, useRef } from 'react'
import { uploadSong, addSongVideo } from '../api/songs'
import { getGenres } from '../api/songs'
import './UploadModal.css'

export default function UploadModal({ onClose, onSuccess }) {
  const [genres, setGenres] = useState([])
  const [file, setFile] = useState(null)
  const [form, setForm] = useState({
    title: '', artist: '', album: '', year: '',
    genre_id: '', difficulty: '', description: '', youtube_urls: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const dropRef = useRef()

  useEffect(() => {
    getGenres().then(({ data }) => setGenres(data.results ?? data))
  }, [])

  const handleDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) { setError('Please select a .gp5 / .gpx file.'); return }
    setError('')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('tab_file', file)
      // Append all except youtube_urls which is handled separately
      Object.entries(form).forEach(([k, v]) => { 
        if (k !== 'youtube_urls' && v !== '') fd.append(k, v) 
      })
      
      const { data: song } = await uploadSong(fd)
      
      // Handle multiple videos
      const lines = form.youtube_urls.split('\n').map(s => s.trim()).filter(Boolean)
      for (const line of lines) {
        const [url, ...titleParts] = line.split('|')
        const title = titleParts.join('|').trim()
        try {
          await addSongVideo({ song: song.id, url: url.trim(), title: title || '' })
        } catch (vErr) {
          console.error('Failed to add video:', line, vErr)
        }
      }

      onSuccess(song)
      onClose()
    } catch (err) {
      const detail = err.response?.data
      setError(typeof detail === 'object' ? JSON.stringify(detail) : String(detail))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Upload Tab</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Drop zone */}
          <div
            ref={dropRef}
            className={`drop-zone ${file ? 'has-file' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => dropRef.current.querySelector('input').click()}
          >
            <input
              type="file"
              accept=".gp5,.gpx,.gp4,.gp3,.gp"
              style={{ display: 'none' }}
              onChange={(e) => setFile(e.target.files[0])}
            />
            {file ? (
              <span className="drop-file-name">📄 {file.name}</span>
            ) : (
              <>
                <span className="drop-icon">🎼</span>
                <span>Drop .gp5 / .gpx file here or click to browse</span>
              </>
            )}
          </div>

          <div className="form-row">
            <label>Title *
              <input required value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} />
            </label>
            <label>Artist *
              <input required value={form.artist} onChange={e => setForm(f => ({...f, artist: e.target.value}))} />
            </label>
          </div>
          <div className="form-row">
            <label>Album
              <input value={form.album} onChange={e => setForm(f => ({...f, album: e.target.value}))} />
            </label>
            <label>Year
              <input type="number" min="1900" max="2099" value={form.year} onChange={e => setForm(f => ({...f, year: e.target.value}))} />
            </label>
          </div>
          <div className="form-row">
            <label>Genre
              <select value={form.genre_id} onChange={e => setForm(f => ({...f, genre_id: e.target.value}))}>
                <option value="">— select —</option>
                {genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label>Difficulty
              <select value={form.difficulty} onChange={e => setForm(f => ({...f, difficulty: e.target.value}))}>
                <option value="">— select —</option>
                <option value="1">1 – Beginner</option>
                <option value="2">2 – Easy</option>
                <option value="3">3 – Intermediate</option>
                <option value="4">4 – Hard</option>
                <option value="5">5 – Expert</option>
              </select>
            </label>
          </div>
          <label>YouTube Video URLs (one per line, optional title after '|')
            <textarea 
              rows={2} 
              placeholder="https://youtube.com/watch?v=... | Lesson&#10;https://youtu.be/... | Cover" 
              value={form.youtube_urls} 
              onChange={e => setForm(f => ({...f, youtube_urls: e.target.value}))} 
            />
          </label>
          <label>Description
            <textarea rows={3} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          </label>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Uploading…' : 'Upload Tab'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
