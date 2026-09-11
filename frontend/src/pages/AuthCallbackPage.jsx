import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get('share_token');
  const [status, setStatus] = useState('Signing you in…');

  useEffect(() => {
    // Supabase detects the magic link tokens in the URL hash automatically.
    // We listen for SIGNED_IN and then validate email authorization.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          await validateAndRedirect(session);
        } else if (event === 'SIGNED_OUT') {
          redirectToLogin('Sign-in failed. Please try again.');
        }
      }
    );

    // Also check if there's already a session (e.g. page reloaded after auth)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) validateAndRedirect(session);
    });

    return () => subscription.unsubscribe();
  }, [shareToken]); // eslint-disable-line react-hooks/exhaustive-deps

  async function validateAndRedirect(session) {
    setStatus('Verifying your access…');

    const email = session.user.email?.toLowerCase();

    if (!shareToken) {
      setStatus('Invalid link — missing request token.');
      return;
    }

    // 1. Resolve share_token → request
    const { data: request, error: reqErr } = await supabase
      .from('requests')
      .select('id')
      .eq('share_token', shareToken)
      .maybeSingle();

    if (reqErr || !request) {
      await supabase.auth.signOut();
      redirectToLogin('This share link is invalid or has expired.');
      return;
    }

    // 2. Check email is authorized for this request
    const { data: item, error: itemErr } = await supabase
      .from('request_items')
      .select('id')
      .eq('request_id', request.id)
      .eq('contact_email', email)
      .maybeSingle();

    if (itemErr || !item) {
      await supabase.auth.signOut();
      redirectToLogin('This email address is not authorized for this request.');
      return;
    }

    // 3. Authorized — save context and go to upload page
    localStorage.setItem('share_token', shareToken);
    navigate(`/upload/${request.id}`, { replace: true });
  }

  function redirectToLogin(errorMsg) {
    const dest = shareToken
      ? `/request/${shareToken}?error=${encodeURIComponent(errorMsg)}`
      : `/`;
    navigate(dest, { replace: true });
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <p style={styles.text}>{status}</p>
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
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '48px 40px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e0e0e0',
    borderTopColor: '#1a1a1a',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  text: {
    fontSize: '14px',
    color: '#555',
    margin: 0,
  },
};

// Inject keyframe once
if (typeof document !== 'undefined' && !document.getElementById('auth-cb-spin')) {
  const style = document.createElement('style');
  style.id = 'auth-cb-spin';
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}
