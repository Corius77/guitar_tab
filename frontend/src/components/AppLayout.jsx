import { useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import UploadModal from './UploadModal'
import HomePage from '../pages/HomePage'
import PlayerPage from '../pages/PlayerPage'
import ProgressPage from '../pages/ProgressPage'
import { LibraryProvider, useLibrary } from '../context/LibraryContext'
import { PlayerProvider } from '../context/PlayerContext'
import { useAuth } from '../context/AuthContext'
import './AppLayout.css'

const SIDEBAR_KEY = 'guitarTab.sidebarCollapsed'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}

function LayoutInner() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1')
  const { showUpload, setShowUpload, prependSong } = useLibrary()
  const navigate = useNavigate()

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      return next
    })
  }

  const handleUploadSuccess = (song) => {
    prependSong(song)
    navigate(`/player/${song.id}`)
  }

  return (
    <div className="app-shell" style={{ '--sidebar-w': collapsed ? '60px' : '300px' }}>
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/progress" element={<RequireAuth><ProgressPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onSuccess={handleUploadSuccess} />
      )}
    </div>
  )
}

export default function AppLayout() {
  return (
    <LibraryProvider>
      <PlayerProvider>
        <LayoutInner />
      </PlayerProvider>
    </LibraryProvider>
  )
}
