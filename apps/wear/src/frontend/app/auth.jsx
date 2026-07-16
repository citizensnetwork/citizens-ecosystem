// ── Auth screens ───────────────────────────────────────────────────
// Crown + wordmark on the design's warm paper tones. Email+password is
// the primary credential (Google availability is not guaranteed long-
// term); Google OAuth stays as a one-tap secondary. Also exposes the
// set-new-password screen the password-recovery email link lands on
// (store.recovery — rendered by the app Gate above everything else).
(function () {
  const { createElement: h, useState } = React;
  const { Crown } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, GoldButton, Spinner } = window.CWUI;

  const PAPER = '#fbfaf8';
  const INK = '#1a1a1a';
  const ERR = '#8f4a2b';

  // ── shared bits ──────────────────────────────────────────────────

  function TextField({ label, type, value, onChange, autoComplete, placeholder, autoFocus }) {
    const [focused, setFocused] = useState(false);
    return h(
      'label',
      { style: { display: 'block', textAlign: 'left' } },
      h(
        'div',
        {
          style: {
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#8b8980',
            marginBottom: 6,
          },
        },
        label,
      ),
      h('input', {
        type,
        value,
        placeholder: placeholder || '',
        autoComplete,
        autoFocus: !!autoFocus,
        onChange: (e) => onChange(e.target.value),
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        style: {
          width: '100%',
          background: '#fff',
          border: '1px solid ' + (focused ? GOLD : '#e6e3dc'),
          borderRadius: 14,
          padding: '13px 14px',
          fontSize: 14,
          fontWeight: 500,
          color: INK,
          outline: 'none',
          boxSizing: 'border-box',
        },
      }),
    );
  }

  function FormError({ message }) {
    if (!message) return null;
    return h(
      'div',
      {
        style: {
          fontSize: 12,
          color: ERR,
          fontWeight: 600,
          textAlign: 'center',
          lineHeight: 1.5,
          background: '#fdf6ec',
          border: '1px solid #f2e3c8',
          borderRadius: 12,
          padding: '10px 14px',
        },
      },
      message,
    );
  }

  function Notice({ title, body }) {
    return h(
      'div',
      {
        style: {
          background: '#fff',
          border: '1px solid #f0eee7',
          borderRadius: 16,
          padding: '20px 18px',
          textAlign: 'center',
        },
      },
      h('div', { style: { fontSize: 14.5, fontWeight: 800, color: INK } }, title),
      h(
        'div',
        {
          style: {
            marginTop: 8,
            fontSize: 12.5,
            color: '#7d7b73',
            fontWeight: 500,
            lineHeight: 1.6,
          },
        },
        body,
      ),
    );
  }

  function LinkButton({ label, onClick, muted }) {
    return h(
      'button',
      {
        type: 'button',
        onClick,
        style: {
          border: 'none',
          background: 'none',
          fontSize: 12.5,
          fontWeight: 700,
          color: muted ? '#a09e97' : '#b8860b',
          padding: 4,
        },
      },
      label,
    );
  }

  function Wordmark() {
    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } },
      h(Crown, { size: 74 }),
      h(
        'div',
        { style: { marginTop: 22, textAlign: 'center', lineHeight: 1.2 } },
        h(
          'div',
          { style: { fontSize: 19, letterSpacing: '0.42em', fontWeight: 700, color: INK } },
          'CITIZENS',
        ),
        h(
          'div',
          {
            style: {
              fontSize: 13,
              letterSpacing: '0.34em',
              color: '#a09e97',
              marginTop: 4,
              fontWeight: 600,
            },
          },
          'WEAR',
        ),
      ),
    );
  }

  function Page({ children, tagline }) {
    return h(
      'div',
      {
        className: 'fade-in',
        style: {
          minHeight: '100%',
          background: PAPER,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 28px',
        },
      },
      h(Wordmark, {}),
      tagline
        ? h(
            'div',
            {
              style: {
                marginTop: 18,
                fontSize: 13.5,
                color: '#4a4a4a',
                fontWeight: 500,
                textAlign: 'center',
                maxWidth: 300,
                lineHeight: 1.55,
              },
            },
            tagline,
          )
        : null,
      h('div', { style: { width: '100%', maxWidth: 340, marginTop: 30 } }, children),
      h(
        'div',
        {
          style: {
            marginTop: 40,
            fontSize: 10.5,
            color: '#c2c0b9',
            fontWeight: 600,
            letterSpacing: '0.24em',
          },
        },
        'CONNECTING THE KINGDOM',
      ),
    );
  }

  const GoogleIcon = () =>
    h(
      'svg',
      { width: 17, height: 17, viewBox: '0 0 24 24' },
      h('path', {
        fill: '#fff',
        d: 'M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 4.3-5.35 4.3a5.8 5.8 0 1 1 0-11.6c1.5 0 2.8.55 3.85 1.45l2.15-2.15A8.9 8.9 0 0 0 12 3.2a8.8 8.8 0 1 0 0 17.6c5.1 0 8.75-3.6 8.75-8.65 0-.35-.05-.7-.1-1.05Z',
      }),
    );

  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  // ── the auth screen (signed-out gate) ────────────────────────────

  function AuthScreen() {
    const {
      signIn,
      signInPassword,
      signUpPassword,
      requestPasswordReset,
      sendEmailCode,
      verifyEmailCode,
      authStatus,
      authError,
    } = useStore();
    const unconfigured = authStatus === 'unconfigured';

    // 'signin' | 'signup' | 'forgot' | 'confirmSent' | 'resetSent' | 'code' | 'codeVerify'
    const [mode, setMode] = useState('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const switchMode = (m) => {
      setMode(m);
      setError(null);
      setPassword('');
      setConfirm('');
      setCode('');
    };

    async function submit(e) {
      e.preventDefault();
      if (busy) return;
      setError(null);
      if (!validEmail(email)) {
        setError('Please enter a valid email address.');
        return;
      }
      try {
        if (mode === 'signin') {
          if (!password) {
            setError('Please enter your password.');
            return;
          }
          setBusy(true);
          await signInPassword(email.trim(), password);
          // SIGNED_IN takes over via the store; no local transition needed.
        } else if (mode === 'signup') {
          if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
          }
          if (password !== confirm) {
            setError('Passwords do not match.');
            return;
          }
          setBusy(true);
          const res = await signUpPassword(email.trim(), password);
          if (res && res.needsConfirmation) setMode('confirmSent');
        } else if (mode === 'forgot') {
          setBusy(true);
          await requestPasswordReset(email.trim());
          setMode('resetSent');
        } else if (mode === 'code') {
          setBusy(true);
          await sendEmailCode(email.trim());
          setMode('codeVerify');
        } else if (mode === 'codeVerify') {
          const digits = code.replace(/\D/g, '');
          if (digits.length !== 6) {
            setError('Enter the 6-digit code from your email.');
            return;
          }
          setBusy(true);
          await verifyEmailCode(email.trim(), digits);
          // SIGNED_IN takes over via the store; no local transition needed.
        }
      } catch (err) {
        setError(err.message || 'Something went wrong. Please try again.');
      } finally {
        setBusy(false);
      }
    }

    if (unconfigured) {
      return h(
        Page,
        { tagline: 'Faith-rooted fashion and the brands behind it.' },
        h(FormError, {
          message:
            'Supabase is not configured. Copy config.example.js → config.js (local dev) or set the NEXT_PUBLIC_SUPABASE_* env vars (deploy).',
        }),
      );
    }

    if (mode === 'confirmSent' || mode === 'resetSent') {
      return h(
        Page,
        {},
        h(Notice, {
          title: mode === 'confirmSent' ? 'Confirm your email' : 'Reset link sent',
          body:
            (mode === 'confirmSent'
              ? 'We sent a confirmation link to '
              : 'If an account exists for ') +
            email.trim() +
            (mode === 'confirmSent'
              ? '. Open it on this device to finish creating your account.'
              : ', a password-reset link is on its way. Open it on this device to choose a new password.'),
        }),
        h(
          'div',
          { style: { textAlign: 'center', marginTop: 16 } },
          h(LinkButton, { label: 'Back to sign in', onClick: () => switchMode('signin') }),
        ),
      );
    }

    if (mode === 'codeVerify') {
      return h(
        Page,
        { tagline: 'Enter the 6-digit code we emailed to ' + email.trim() + '.' },
        h(
          'form',
          { onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          h(TextField, {
            label: 'Sign-in code',
            type: 'text',
            value: code,
            onChange: (v) => setCode(v.replace(/\D/g, '').slice(0, 6)),
            autoComplete: 'one-time-code',
            placeholder: '123456',
            autoFocus: true,
          }),
          h(FormError, { message: error || authError }),
          busy ? h(Spinner, { size: 20 }) : h(GoldButton, { label: 'Verify & sign in' }),
        ),
        h(
          'div',
          {
            style: {
              textAlign: 'center',
              marginTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            },
          },
          h(LinkButton, {
            label: 'Send a new code',
            onClick: () => switchMode('code'),
            muted: true,
          }),
          h(LinkButton, { label: 'Back to sign in', onClick: () => switchMode('signin') }),
        ),
      );
    }

    const emailOnly = mode === 'forgot' || mode === 'code';
    const fields = [
      h(TextField, {
        key: 'email',
        label: 'Email',
        type: 'email',
        value: email,
        onChange: setEmail,
        autoComplete: 'email',
        placeholder: 'you@example.com',
      }),
    ];
    if (!emailOnly) {
      fields.push(
        h(TextField, {
          key: 'pw',
          label: 'Password',
          type: 'password',
          value: password,
          onChange: setPassword,
          autoComplete: mode === 'signup' ? 'new-password' : 'current-password',
        }),
      );
    }
    if (mode === 'signup') {
      fields.push(
        h(TextField, {
          key: 'pw2',
          label: 'Confirm password',
          type: 'password',
          value: confirm,
          onChange: setConfirm,
          autoComplete: 'new-password',
        }),
      );
    }

    return h(
      Page,
      {
        tagline:
          mode === 'forgot'
            ? 'Enter your account email and we will send you a reset link.'
            : mode === 'code'
              ? 'Enter your account email and we will send you a 6-digit sign-in code.'
              : 'Faith-rooted fashion and the brands behind it — one Kingdom identity across every Citizens app.',
      },
      h(
        'form',
        { onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        ...fields,
        h(FormError, { message: error || authError }),
        busy
          ? h(Spinner, { size: 20 })
          : h(GoldButton, {
              label:
                mode === 'signin'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : mode === 'code'
                      ? 'Send code'
                      : 'Send reset link',
            }),
      ),
      mode === 'signin'
        ? h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                alignItems: 'center',
                marginTop: 12,
              },
            },
            h(LinkButton, {
              label: 'Email me a 6-digit sign-in code instead',
              onClick: () => switchMode('code'),
            }),
            h(LinkButton, {
              label: 'Forgot password?',
              onClick: () => switchMode('forgot'),
              muted: true,
            }),
          )
        : null,
      !emailOnly
        ? h(
            'div',
            {},
            h(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  margin: '18px 0',
                },
              },
              h('div', { style: { flex: 1, height: 1, background: '#e6e3dc' } }),
              h(
                'span',
                {
                  style: {
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#c2c0b9',
                    letterSpacing: '0.1em',
                  },
                },
                'OR',
              ),
              h('div', { style: { flex: 1, height: 1, background: '#e6e3dc' } }),
            ),
            h(GoldButton, {
              label: mode === 'signup' ? 'Sign up with Google' : 'Continue with Google',
              onClick: signIn,
              icon: h(GoogleIcon, {}),
              style: { background: INK, boxShadow: '0 6px 18px -6px rgba(26,26,26,0.5)' },
            }),
          )
        : null,
      h(
        'div',
        { style: { textAlign: 'center', marginTop: 18 } },
        mode === 'signin'
          ? h(LinkButton, {
              label: 'New here? Create an account',
              onClick: () => switchMode('signup'),
            })
          : h(LinkButton, {
              label: mode === 'signup' ? 'Already a Citizen? Sign in' : 'Back to sign in',
              onClick: () => switchMode('signin'),
            }),
      ),
    );
  }

  // ── set-new-password (recovery-link landing) ─────────────────────

  function ResetPasswordScreen() {
    const { completePasswordReset, signOut } = useStore();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    async function submit(e) {
      e.preventDefault();
      if (busy) return;
      setError(null);
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
      setBusy(true);
      try {
        await completePasswordReset(password);
        // recovery flag clears in the store → Gate falls through to the app.
      } catch (err) {
        setError(err.message || 'Could not update your password. Please try again.');
      } finally {
        setBusy(false);
      }
    }

    return h(
      Page,
      { tagline: 'Choose a new password for your Citizens account.' },
      h(
        'form',
        { onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h(TextField, {
          label: 'New password',
          type: 'password',
          value: password,
          onChange: setPassword,
          autoComplete: 'new-password',
          autoFocus: true,
        }),
        h(TextField, {
          label: 'Confirm new password',
          type: 'password',
          value: confirm,
          onChange: setConfirm,
          autoComplete: 'new-password',
        }),
        h(FormError, { message: error }),
        busy ? h(Spinner, { size: 20 }) : h(GoldButton, { label: 'Set new password' }),
      ),
      h(
        'div',
        { style: { textAlign: 'center', marginTop: 16 } },
        h(LinkButton, { label: 'Cancel and sign out', onClick: signOut, muted: true }),
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Auth = AuthScreen;
  window.CWScreens.ResetPassword = ResetPasswordScreen;
})();
