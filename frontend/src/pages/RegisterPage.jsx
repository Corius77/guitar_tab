import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './AuthPage.css'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', password: '', password2: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password !== form.password2) { setError('Passwords do not match.'); return }
    setError('')
    setLoading(true)
    try {
      await register(form.username, form.email, form.password, form.password2)
      navigate('/')
    } catch (err) {
      const data = err.response?.data
      setError(typeof data === 'object' ? Object.values(data).flat().join(' ') : String(data))
    } finally {
      setLoading(false)
    }
  }

  const f = (field) => ({
    value: form[field],
    onChange: e => setForm(prev => ({ ...prev, [field]: e.target.value })),
  })

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🎸</div>
        <h1>Create account</h1>

        <form onSubmit={handleSubmit}>
          <label>Username <input autoFocus required {...f('username')} /></label>
          <label>Email <input type="email" {...f('email')} /></label>
          <label>Password <input type="password" required minLength={8} {...f('password')} /></label>
          <label>Repeat password <input type="password" required {...f('password2')} /></label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating account…' : 'Sign Up'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </div>
    </div>
  )
}
