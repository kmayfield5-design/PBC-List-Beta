import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function AdvisorLoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('password'); // 'password' | 'magic'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // ─── Password login ───────────────────────────────────────

  async function handlePasswordLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
    } else {
      navigate('/dashboard');
    }

    setLoading(false);
  }

  // ─── Magic link ───────────────────────────────────────────

  async function handleMagicLink(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }

    setLoading(false);
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img src="/riveron-wordmark.png" alt="Riveron" style={styles.wordmarkImg} />

        {sent ? (
          <div>
            <h1 style={styles.heading}>Check your email</h1>
            <p style={styles.subheading}>
              We sent a sign-in link to <strong>{email}</strong>. Click it to access
              your dashboard — it expires in 1 hour.
            </p>
            <button
              style={styles.linkButton}
              onClick={() => { setSent(false); setEmail(''); setError(''); }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h1 style={styles.heading}>Sign in</h1>

            {/* Mode toggle */}
            <div style={styles.modeToggle}>
              <button
                style={{ ...styles.modeBtn, ...(mode === 'password' ? styles.modeBtnActive : {}) }}
                onClick={() => { setMode('password'); setError(''); }}
                type="button"
              >
                Password
              </button>
              <button
                style={{ ...styles.modeBtn, ...(mode === 'magic' ? styles.modeBtnActive : {}) }}
                onClick={() => { setMode('magic'); setError(''); }}
                type="button"
              >
                Email link
              </button>
            </div>

            {mode === 'password' ? (
              <form onSubmit={handlePasswordLogin} noValidate>
                <label style={styles.label} htmlFor="email-pw">Email</label>
                <input
                  id="email-pw"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@riveron.com"
                  style={styles.input}
                  disabled={loading}
                />
                <label style={styles.label} htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={styles.input}
                  disabled={loading}
                />
                {error && <p style={styles.error}>{error}</p>}
                <button
                  type="submit"
                  style={{ ...styles.button, ...(!email.trim() || !password || loading ? styles.buttonDisabled : {}) }}
                  disabled={!email.trim() || !password || loading}
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
                <p style={styles.switchHint}>
                  No password yet?{' '}
                  <button
                    type="button"
                    style={styles.linkButton}
                    onClick={() => { setMode('magic'); setError(''); }}
                  >
                    Use an email link instead
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleMagicLink} noValidate>
                <p style={styles.subheading}>
                  Enter your Riveron email and we'll send you a secure sign-in link.
                </p>
                <label style={styles.label} htmlFor="email-magic">Email</label>
                <input
                  id="email-magic"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@riveron.com"
                  style={styles.input}
                  disabled={loading}
                />
                {error && <p style={styles.error}>{error}</p>}
                <button
                  type="submit"
                  style={{ ...styles.button, ...(!email.trim() || loading ? styles.buttonDisabled : {}) }}
                  disabled={!email.trim() || loading}
                >
                  {loading ? 'Sending…' : 'Send sign-in link'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundImage: 'linear-gradient(rgba(7,23,57,0.88), rgba(7,23,57,0.88)), url("/hero-river.png")',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
    padding: '24px',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 24px 64px rgba(7,23,57,0.32)',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '420px',
  },
  wordmarkImg: {
    height: '22px',
    display: 'block',
    marginBottom: '28px',
  },
  heading: {
    fontSize: '22px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#071739',
    margin: '0 0 20px',
  },
  modeToggle: {
    display: 'flex',
    borderRadius: '8px',
    border: '1px solid #dadde6',
    overflow: 'hidden',
    marginBottom: '24px',
  },
  modeBtn: {
    flex: 1,
    padding: '8px',
    fontSize: '13px',
    fontWeight: '500',
    fontFamily: 'Arial, Helvetica, sans-serif',
    background: '#fff',
    border: 'none',
    cursor: 'pointer',
    color: '#4c6382',
  },
  modeBtnActive: {
    background: '#071739',
    color: '#fff',
    fontWeight: '600',
  },
  subheading: {
    fontSize: '14px',
    color: '#4c6382',
    margin: '0 0 20px',
    lineHeight: '1.6',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#071739',
    marginBottom: '6px',
  },
  input: {
    display: 'block',
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1.5px solid #dadde6',
    borderRadius: '8px',
    outline: 'none',
    marginBottom: '16px',
    color: '#071739',
    backgroundColor: '#fff',
    boxSizing: 'border-box',
  },
  button: {
    display: 'block',
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    fontWeight: '700',
    fontFamily: 'Arial, Helvetica, sans-serif',
    color: '#fff',
    backgroundColor: '#379190',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '16px',
    boxShadow: '0 4px 20px rgba(55,145,144,0.35)',
  },
  buttonDisabled: {
    backgroundColor: '#6b7d94',
    boxShadow: 'none',
    cursor: 'not-allowed',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#379190',
    fontSize: '13px',
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: 0,
  },
  switchHint: {
    fontSize: '13px',
    color: '#6b7d94',
    margin: 0,
    textAlign: 'center',
  },
  error: {
    fontSize: '13px',
    color: '#c0392b',
    margin: '-8px 0 14px',
  },
};
