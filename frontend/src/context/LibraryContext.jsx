import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getSongs } from '../api/songs'

// Współdzielona biblioteka tabulatur: lista, wyszukiwanie, sortowanie oraz
// stan modala uploadu. Konsumowane przez Sidebar (lista) i HomePage (powitanie).
const LibraryContext = createContext(null)

export function LibraryProvider({ children }) {
  const [songs, setSongs] = useState([])
  const [count, setCount] = useState(0)
  const [next, setNext] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [ordering, setOrdering] = useState('-recent_at')
  const [page, setPage] = useState(1)
  const [showUpload, setShowUpload] = useState(false)

  const fetchSongs = useCallback(async (pageNum = 1, reset = true) => {
    setLoading(true)
    try {
      const { data } = await getSongs({
        search: search || undefined,
        ordering,
        page: pageNum,
      })
      setSongs(prev => (reset ? data.results : [...prev, ...data.results]))
      setCount(data.count)
      setNext(data.next)
    } finally {
      setLoading(false)
    }
  }, [search, ordering])

  // Debounce na wyszukiwanie/sortowanie — reset do strony 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      fetchSongs(1, true)
    }, 250)
    return () => clearTimeout(t)
  }, [fetchSongs])

  const loadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    fetchSongs(nextPage, false)
  }

  const prependSong = (song) => {
    setSongs(prev => [song, ...prev])
    setCount(c => c + 1)
  }

  // Otwarcie utworu w playerze — przy sortowaniu „ostatnio grane” przesuwamy
  // go na górę od razu, bez refetchu (backend już ma nowe last_opened_at)
  const touchSong = useCallback((id) => {
    if (ordering !== '-recent_at') return
    setSongs(prev => {
      const idx = prev.findIndex(s => s.id === id)
      if (idx <= 0) return prev
      return [prev[idx], ...prev.slice(0, idx), ...prev.slice(idx + 1)]
    })
  }, [ordering])

  return (
    <LibraryContext.Provider value={{
      songs, count, next, loading,
      search, setSearch, ordering, setOrdering,
      loadMore, prependSong, touchSong,
      showUpload, setShowUpload,
    }}>
      {children}
    </LibraryContext.Provider>
  )
}

export const useLibrary = () => useContext(LibraryContext)
