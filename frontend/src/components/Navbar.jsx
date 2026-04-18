import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Navbar.css'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <span className="brand-icon">🎸</span>
        <span className="brand-name">GuitarTab</span>
      </Link>

      <div className="navbar-actions">
        {user ? (
          <>
            <Link to="/progress" className="btn btn-ghost btn-sm navbar-progress-link">
              📈 Progresja
            </Link>
            <Link to="/upload" className="btn btn-primary btn-sm">
              + Upload Tab
            </Link>
            <span className="navbar-user">{user.username}</span>
            <button onClick={handleLogout} className="btn btn-ghost btn-sm">
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-ghost btn-sm">Login</Link>
            <Link to="/register" className="btn btn-primary btn-sm">Sign Up</Link>
          </>
        )}
      </div>
    </nav>
  )
}
