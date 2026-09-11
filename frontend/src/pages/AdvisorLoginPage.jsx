import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function AdvisorLoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }

    setLoading(false);
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <span style={styles.logoText}>Riveron</span>
          <span style={styles.logoBadge}>Advisor</span>
        </div>

        {sent ? (
          <div>
            <h1 style={styles.heading}>Check your email</h1>
            <p style={styles.subheading}>
              We sent a sign-in link to <strong>{email}</strong>. Click the link to
              access your dashboard — it expires in 1 hour.
            </p>
            <button
              style={styles.linkButton}
              onClick={() => { setSent(false); setEmail(''); }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <h1 style={styles.heading}>Sign in</h1>
            <p style={styles.subheading}>
              Enter your Riveron email and we'll send you a secure sign-in link.
            </p>

            <label style={styles.label} htmlFor="advisor-email">
              Email address
            </label>
            <input
              id="advisor-email"
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
              style={{ ...styles.button, ...(loading || !email.trim() ? styles.buttonDisabled : {}) }}
              disabled={loading || !email.trim()}
            >
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
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
    backgroundColor: '#f5f5f5',
    padding: '24px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '420px',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '32px',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: '700',
    letterSpacing: '-0.3px',
    color: '#111',
  },
  logoBadge: {
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#888',
    backgroundColor: '#f0f0f0',
    padding: '2px 7px',
    borderRadius: '99px',
  },
  heading: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#111',
    margin: '0 0 8px',
  },
  subheading: {
    fontSize: '14px',
    color: '#555',
    margin: '0 0 28px',
    lineHeight: '1.6',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '6px',
  },
  input: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    fontSize: '15px',
    border: '1.5px solid #ddd',
    borderRadius: '8px',
    outline: 'none',
    marginBottom: '20px',
    color: '#111',
    backgroundColor: '#fff',
  },
  button: {
    display: 'block',
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  buttonDisabled: {
    backgroundColor: '#999',
    cursor: 'not-allowed',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#555',
    fontSize: '13px',
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: 0,
  },
  error: {
    fontSize: '13px',
    color: '#c0392b',
    margin: '-12px 0 16px',
  },
};
