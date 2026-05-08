import { useState } from 'react'

const CREDENTIALS = { username: 'thomas.mks.cac', password: 'thomas.cac.123' }

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
      localStorage.setItem('cac_auth', '1')
      onLogin()
    } else {
      setError('Invalid credentials. Please try again.')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font)',
    }}>
      <div style={{
        background: '#fff',
        border: '3px solid #000',
        width: 360,
        boxShadow: '8px 8px 0 #FFD166',
      }}>
        {/* Header */}
        <div style={{
          background: '#000',
          color: '#FFD166',
          padding: '14px 20px',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 3,
          textTransform: 'uppercase',
          borderBottom: '3px solid #000',
        }}>
          CAC Player Report
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#888', fontWeight: 700 }}>
            Sign in to continue
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, color: '#333' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError('') }}
              autoComplete="username"
              style={{
                fontFamily: 'var(--font)',
                fontSize: 12,
                padding: '8px 10px',
                border: '2px solid #000',
                outline: 'none',
                background: '#fff',
                color: '#000',
                letterSpacing: 1,
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, color: '#333' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              autoComplete="current-password"
              style={{
                fontFamily: 'var(--font)',
                fontSize: 12,
                padding: '8px 10px',
                border: '2px solid #000',
                outline: 'none',
                background: '#fff',
                color: '#000',
                letterSpacing: 1,
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#D90429',
              color: '#fff',
              padding: '6px 10px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              background: '#FFD166',
              color: '#000',
              border: '2px solid #000',
              fontFamily: 'var(--font)',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: 2,
              textTransform: 'uppercase',
              padding: '10px 0',
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            Login
          </button>
        </form>
      </div>
    </div>
  )
}
