import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function LoginPage({ shareToken, onLoginSuccess }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ─── Step 1: Request OTP via Supabase ────────────────────

  async function handleRequestOtp(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (error) {
      setError(error.message);
    } else {
      setStep('otp');
    }

    setLoading(false);
  }

  // ─── Step 2: Verify OTP via Supabase ─────────────────────

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });

    if (verifyError) {
      setError('Incorrect or expired code. Please try again.');
      setLoading(false);
      return;
    }

    // Confirm this email is authorized for the request
    const { data: request } = await supabase
      .from('requests')
      .select('id')
      .eq('share_token', shareToken)
      .single();

    if (!request) {
      await supabase.auth.signOut();
      setError('This share link is invalid or expired.');
      setLoading(false);
      return;
    }

    const { data: item } = await supabase
      .from('request_items')
      .select('id')
      .eq('request_id', request.id)
      .eq('contact_email', email.toLowerCase())
      .limit(1)
      .maybeSingle();

    if (!item) {
      await supabase.auth.signOut();
      setError('This email is not authorized for this request.');
      setLoading(false);
      return;
    }

    localStorage.setItem('share_token', shareToken);
    onLoginSuccess(null, `/upload/${request.id}`);
    setLoading(false);
  }

  function handleResendCode() {
    setStep('email');
    setOtp('');
    setError('');
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <span style={styles.logoText}>Riveron</span>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleRequestOtp} noValidate>
            <h1 style={styles.heading}>Access your data request</h1>
            <p style={styles.subheading}>
              Enter the email address associated with this request. We'll send you a
              one-time verification code.
            </p>

            <label style={styles.label} htmlFor="email">
              Email address
            </label>
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
              {loading ? 'Sending…' : 'Send verification code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} noValidate>
            <h1 style={styles.heading}>Enter your code</h1>
            <p style={styles.subheading}>
              We sent a 6-digit code to <strong>{email}</strong>. It expires in 10
              minutes.
            </p>

            <label style={styles.label} htmlFor="otp">
              Verification code
            </label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              style={styles.otpInput}
              disabled={loading}
              autoFocus
            />

            {error && <p style={styles.error}>{error}</p>}

            <button
              type="submit"
              style={{ ...styles.button, ...(loading || otp.length !== 6 ? styles.buttonDisabled : {}) }}
              disabled={loading || otp.length !== 6}
            >
              {loading ? 'Verifying…' : 'Verify code'}
            </button>

            <button
              type="button"
              onClick={handleResendCode}
              style={styles.linkButton}
              disabled={loading}
            >
              Resend or use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────

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
    marginBottom: '32px',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: '700',
    letterSpacing: '-0.3px',
    color: '#111',
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
  otpInput: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '14px 16px',
    fontSize: '28px',
    fontFamily: 'monospace',
    letterSpacing: '8px',
    textAlign: 'center',
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
    marginBottom: '12px',
  },
  buttonDisabled: {
    backgroundColor: '#999',
    cursor: 'not-allowed',
  },
  linkButton: {
    display: 'block',
    width: '100%',
    padding: '8px',
    fontSize: '13px',
    color: '#555',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
    textAlign: 'center',
  },
  error: {
    fontSize: '13px',
    color: '#c0392b',
    margin: '0 0 16px',
  },
};
