import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function LoginPage({ shareToken, errorMessage }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(errorMessage || '');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const redirectTo =
      `${window.location.origin}/auth/callback?share_token=${shareToken}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
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
        </div>

        {sent ? (
          <>
            <h1 style={styles.heading}>Check your email</h1>
            <p style={styles.subheading}>
              We sent a sign-in link to <strong>{email}</strong>. Click the link to
              access your data request — it expires in 10 minutes.
            </p>
            <button
              style={styles.linkButton}
              onClick={() => { setSent(false); setEmail(''); setError(''); }}
            >
              Use a different email
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <h1 style={styles.heading}>Access your data request</h1>
            <p style={styles.subheading}>
              Enter the email address associated with this request and we'll send
              you a secure sign-in link.
            </p>

            <label style={styles.label} htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
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
    backgroundColor: '#f8fafc',
    padding: '24px',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '11px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '420px',
  },
  logoRow: {
    marginBottom: '32px',
  },
  logoText: {
    fontSize: '15px',
    fontWeight: '700',
    letterSpacing: '-0.3px',
    color: '#111827',
  },
  heading: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#111827',
    margin: '0 0 8px',
  },
  subheading: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '0 0 28px',
    lineHeight: '1.6',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#111827',
    marginBottom: '6px',
  },
  input: {
    display: 'block',
    width: '100%',
    padding: '10px 12px',
    fontSize: '15px',
    border: '1.5px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none',
    marginBottom: '20px',
    color: '#111827',
    backgroundColor: '#fff',
  },
  button: {
    display: 'block',
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#0f172a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '12px',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
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
