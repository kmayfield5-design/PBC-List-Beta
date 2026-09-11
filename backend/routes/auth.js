const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const supabase = require('../config/supabase');

require('dotenv').config();

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

const MAX_ATTEMPTS = 3;

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function insertAuditLog({ action, actor, request_id, details = {} }) {
  const { error } = await supabase
    .from('audit_log')
    .insert({ action, actor, request_id, details });

  if (error) {
    // Non-fatal: log server-side but never let audit failure block the user flow
    console.error('audit_log insert failed:', error.message);
  }
}

// ─── POST /api/auth/request-otp ─────────────────────────────────────────────

router.post('/request-otp', async (req, res) => {
  const { share_token, email } = req.body;

  if (!share_token || !email) {
    return res.status(400).json({ success: false, message: 'share_token and email are required.' });
  }

  // 1. Validate share_token against requests table
  const { data: request, error: requestError } = await supabase
    .from('requests')
    .select('id')
    .eq('share_token', share_token)
    .single();

  if (requestError || !request) {
    return res.status(404).json({ success: false, message: 'Invalid or expired share link.' });
  }

  const request_id = request.id;

  // 2. Confirm email is authorized (exists as contact_email on an item for this request)
  const { data: item, error: itemError } = await supabase
    .from('request_items')
    .select('id')
    .eq('request_id', request_id)
    .eq('contact_email', email.toLowerCase())
    .limit(1)
    .single();

  if (itemError || !item) {
    return res.status(403).json({ success: false, message: 'This email is not authorized for this request.' });
  }

  // 3. Generate and hash OTP
  const otp = generateOtp();
  const otp_hash = await bcrypt.hash(otp, 10);

  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // 4. Insert auth_session
  const { data: session, error: sessionError } = await supabase
    .from('auth_sessions')
    .insert({
      request_id,
      email: email.toLowerCase(),
      otp_code: otp_hash,
      expires_at,
      attempts: 0,
    })
    .select('id')
    .single();

  if (sessionError || !session) {
    console.error('auth_sessions insert failed:', sessionError?.message);
    return res.status(500).json({ success: false, message: 'Failed to create session. Please try again.' });
  }

  // 5. Send OTP email via Resend
  const { error: emailError } = await resend.emails.send({
    from: 'noreply@riveron.dev',
    to: email,
    subject: 'Your Riveron data request code',
    html: `
      <h2>Verification code</h2>
      <div style="font-size:32px; font-family: monospace; letter-spacing: 2px;">${otp}</div>
      <p>Expires in 10 minutes</p>
    `,
  });

  if (emailError) {
    console.error('Resend email failed:', emailError.message);
    return res.status(502).json({ success: false, message: 'Failed to send OTP email. Please try again.' });
  }

  // 6. Audit log
  await insertAuditLog({
    action: 'otp_sent',
    actor: email.toLowerCase(),
    request_id,
    details: { session_id: session.id },
  });

  return res.json({ success: true, message: 'OTP sent.' });
});

// ─── POST /api/auth/verify-otp ──────────────────────────────────────────────

router.post('/verify-otp', async (req, res) => {
  const { share_token, email, otp_code } = req.body;

  if (!share_token || !email || !otp_code) {
    return res.status(400).json({ success: false, message: 'share_token, email, and otp_code are required.' });
  }

  // 1. Resolve share_token → request_id
  const { data: request, error: requestError } = await supabase
    .from('requests')
    .select('id')
    .eq('share_token', share_token)
    .single();

  if (requestError || !request) {
    return res.status(404).json({ success: false, message: 'Invalid or expired share link.' });
  }

  const request_id = request.id;

  // 2. Fetch the most recent active session for this email + request
  const { data: session, error: sessionError } = await supabase
    .from('auth_sessions')
    .select('id, otp_code, attempts, verified_at')
    .eq('request_id', request_id)
    .eq('email', email.toLowerCase())
    .is('verified_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (sessionError || !session) {
    return res.status(401).json({ success: false, message: 'No active session found. Please request a new code.' });
  }

  // 3. Block if already at or over attempt limit
  if (session.attempts >= MAX_ATTEMPTS) {
    return res.status(429).json({ success: false, message: 'Too many attempts. Please request a new code.' });
  }

  // 4. Compare OTP
  const isMatch = await bcrypt.compare(otp_code, session.otp_code);

  if (!isMatch) {
    // Increment attempts
    const { error: updateError } = await supabase
      .from('auth_sessions')
      .update({ attempts: session.attempts + 1 })
      .eq('id', session.id);

    if (updateError) {
      console.error('auth_sessions attempts update failed:', updateError.message);
    }

    await insertAuditLog({
      action: 'otp_failed',
      actor: email.toLowerCase(),
      request_id,
      details: { session_id: session.id, attempts: session.attempts + 1 },
    });

    const attemptsRemaining = MAX_ATTEMPTS - (session.attempts + 1);
    return res.status(401).json({ success: false, attemptsRemaining, message: 'Incorrect code.' });
  }

  // 5. OTP matched — sign JWT
  const token = jwt.sign(
    { request_id, email: email.toLowerCase(), role: 'client' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  // 6. Mark session verified and store token
  const { error: verifyError } = await supabase
    .from('auth_sessions')
    .update({
      verified_at: new Date().toISOString(),
      session_token: token,
    })
    .eq('id', session.id);

  if (verifyError) {
    console.error('auth_sessions verify update failed:', verifyError.message);
    return res.status(500).json({ success: false, message: 'Session verification failed. Please try again.' });
  }

  await insertAuditLog({
    action: 'otp_verified',
    actor: email.toLowerCase(),
    request_id,
    details: { session_id: session.id },
  });

  return res.json({
    success: true,
    token,
    redirectTo: `/upload/${request_id}`,
  });
});

module.exports = router;
