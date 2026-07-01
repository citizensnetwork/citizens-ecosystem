// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — shared UI primitives  (window.UI)
// ════════════════════════════════════════════════════════════════════
(function () {
  const { useState, useEffect, useRef } = React;
  const Icon = window.Icon;
  const cx = (...a) => a.filter(Boolean).join(' ');

  // First-letters of up to two words → honest initials placeholder.
  const initials = (s) => !s ? '' : String(s).trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  // ── Avatar (graceful fallback) ──
  // A missing or broken src never shows a broken-image glyph: it degrades to the
  // person/org's initials on gold, or a neutral User icon when we have no name —
  // honest, never a fake stock face (VISION: don't misrepresent identity).
  function Avatar({ src, alt, name, size = 40, rounded = 'full', ring, className, style }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    const r = rounded === 'full' ? '9999px' : rounded === 'xl' ? '14px' : '10px';
    const box = { width: size, height: size, borderRadius: r, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined, ...style };
    if (src && !failed) {
      return React.createElement('img', {
        src, alt: alt || name || '', loading: 'lazy', onError: () => setFailed(true),
        className: cx('object-cover shrink-0', className), style: box,
      });
    }
    const ini = initials(name || alt);
    return React.createElement('div', {
      'aria-label': alt || name || 'avatar',
      className: cx('shrink-0 flex items-center justify-center gold-gradient text-black font-bold select-none', className),
      style: Object.assign({}, box, { fontSize: Math.max(9, Math.round(size * 0.4)) }),
    }, ini || React.createElement(Icon, { name: 'User', size: Math.round(size * 0.5) }));
  }

  // ── SmartImage (graceful cover/photo) ──
  // Drop-in for cover <img>. Empty or broken src → an honest, category-tinted
  // placeholder (its colour + icon), never a generic stock photo standing in for
  // a real place/event. `cat` is an optional DATA category {hex,icon,name}.
  function SmartImage({ src, alt, className, cat, label, style }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    if (src && !failed) {
      return React.createElement('img', {
        src, alt: alt || '', loading: 'lazy', onError: () => setFailed(true),
        className: cx('object-cover', className), style,
      });
    }
    const hex = cat && cat.hex ? cat.hex : '#F0C024';
    return React.createElement('div', {
      'aria-label': alt || (cat ? cat.name : 'image'),
      className: cx('flex flex-col items-center justify-center gap-1 select-none', className),
      style: Object.assign({ background: `linear-gradient(135deg, ${hex}22, ${hex}0f 55%, ${hex}26)` }, style),
    },
      React.createElement(Icon, { name: cat && cat.icon ? cat.icon : 'Image', size: 26, style: { color: hex, opacity: 0.7 } }),
      label && React.createElement('span', { className: 'text-[10px] font-bold uppercase tracking-wider', style: { color: hex, opacity: 0.85 } }, label));
  }

  // ── Button ──
  function Button({ variant = 'primary', size = 'md', icon, iconRight, children, className, ...rest }) {
    const base = 'inline-flex items-center justify-center gap-2 font-bold rounded-xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed select-none focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-background';
    const sizes = { sm: 'text-xs px-3 py-2', md: 'text-sm px-4 py-2.5', lg: 'text-sm px-5 py-3.5' };
    const variants = {
      primary: 'bg-foreground text-background hover:bg-foreground/90 shadow-sm',
      gold: 'gold-gradient text-black shadow-[0_8px_22px_rgba(240,192,36,0.28)] hover:brightness-105',
      soft: 'bg-accent text-gold-dark hover:bg-gold-light/60',
      ghost: 'text-foreground/70 hover:bg-accent/60 hover:text-foreground',
      outline: 'border border-border bg-white text-foreground hover:bg-accent/40',
      danger: 'bg-[#FEE2E2] text-[#DC2626] hover:bg-red-100',
      success: 'bg-[#DCFCE7] text-[#16A34A] hover:bg-green-100',
    };
    return React.createElement('button', { className: cx(base, sizes[size], variants[variant], className), ...rest },
      icon && React.createElement(Icon, { name: icon, size: size === 'sm' ? 13 : 15 }),
      children,
      iconRight && React.createElement(Icon, { name: iconRight, size: size === 'sm' ? 13 : 15 }));
  }

  // ── Field (label + control) ──
  function Field({ label, hint, required, children, className }) {
    return React.createElement('div', { className: cx('space-y-1.5', className) },
      label && React.createElement('label', { className: 'flex items-center gap-1 text-xs font-semibold text-foreground/80' },
        label, required && React.createElement('span', { className: 'text-gold' }, '*')),
      children,
      hint && React.createElement('p', { className: 'text-[11px] text-muted-foreground' }, hint));
  }

  const inputCls = 'w-full px-3.5 py-2.5 bg-white border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/25 transition-all';
  function Input(props) { return React.createElement('input', { className: cx(inputCls, props.className), ...props, ref: undefined }); }
  function Textarea(props) { return React.createElement('textarea', { ...props, className: cx(inputCls, 'resize-none leading-relaxed', props.className) }); }

  // ── Toggle switch ──
  function Toggle({ checked, onChange, label, desc }) {
    return React.createElement('button', {
      type: 'button', onClick: () => onChange(!checked), role: 'switch', 'aria-checked': checked,
      className: 'flex items-center gap-3 w-full text-left',
    },
      React.createElement('span', {
        className: cx('relative w-11 h-6 rounded-full transition-colors shrink-0', checked ? 'bg-gold' : 'bg-[#DCD9D2]'),
      }, React.createElement('span', {
        className: 'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
        style: { transform: checked ? 'translateX(20px)' : 'none' },
      })),
      (label || desc) && React.createElement('span', { className: 'flex-1 min-w-0' },
        label && React.createElement('span', { className: 'block text-sm font-semibold text-foreground' }, label),
        desc && React.createElement('span', { className: 'block text-[11px] text-muted-foreground' }, desc)));
  }

  // ── Segmented control ──
  function Segmented({ options, value, onChange, size = 'md' }) {
    return React.createElement('div', { className: 'flex gap-0 bg-muted rounded-xl p-1 overflow-x-auto scrollbar-none border border-border' },
      options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const active = value === val;
        return React.createElement('button', {
          key: val, onClick: () => onChange(val),
          className: cx('flex-1 rounded-lg font-semibold whitespace-nowrap transition-all capitalize',
            size === 'sm' ? 'py-1.5 px-2.5 text-[11px]' : 'py-2 px-3 text-xs',
            active ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'),
        }, label);
      }));
  }

  // ── Category dot / chip ──
  function CategoryBadge({ cat, active, onClick, showIcon = true }) {
    if (!cat) return null;
    return React.createElement('button', {
      onClick,
      className: 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all shrink-0',
      style: active
        ? { background: cat.hex, color: '#fff', boxShadow: `0 3px 12px ${cat.hex}44` }
        : { background: 'rgba(255,255,255,0.8)', color: cat.hex, border: `1px solid ${cat.hex}40` },
    }, showIcon && React.createElement(Icon, { name: cat.icon, size: 11, strokeWidth: 2.5 }), cat.short || cat.name);
  }

  // ── Overlay container (modal / sheet / side panel) ──
  function Overlay({ variant = 'modal', onClose, children, title, maxWidth = 560 }) {
    useEffect(() => {
      const h = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', h);
      return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    const isSheet = variant === 'sheet', isSide = variant === 'side';
    const panelPos = isSheet
      ? 'absolute left-0 right-0 bottom-0 rounded-t-3xl max-h-[92%] slide-up-panel'
      : isSide
        ? 'absolute right-0 top-0 bottom-0 w-full max-w-[480px] rounded-l-3xl scale-in'
        : 'relative rounded-3xl w-full scale-in my-auto max-h-[92%]';
    return React.createElement('div', {
      className: cx('fixed inset-0 z-[200] flex', isSheet ? 'items-end' : isSide ? 'justify-end' : 'items-center justify-center p-4'),
    },
      React.createElement('div', { className: 'absolute inset-0 bg-black/40 backdrop-blur-sm fade-in', onClick: onClose }),
      React.createElement('div', {
        className: cx('bg-white border border-border shadow-2xl flex flex-col overflow-hidden relative', panelPos),
        style: !isSheet && !isSide ? { maxWidth } : undefined,
      },
        title && React.createElement('div', { className: 'flex items-center justify-between px-5 py-4 border-b border-border shrink-0' },
          React.createElement('h3', { className: 'text-foreground text-lg' }, title),
          React.createElement('button', { onClick: onClose, className: 'w-8 h-8 rounded-lg hover:bg-accent/60 flex items-center justify-center text-muted-foreground' },
            React.createElement(Icon, { name: 'X', size: 16 }))),
        children));
  }

  // ── Media picker (stand-in for upload) ──
  const STOCK = [
    'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&h=500&fit=crop',
    'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=800&h=500&fit=crop',
    'https://images.unsplash.com/photo-1501699169021-3759ee435d66?w=800&h=500&fit=crop',
    'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=500&fit=crop',
    'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800&h=500&fit=crop',
    'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=800&h=500&fit=crop',
    'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=800&h=500&fit=crop',
    'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=800&h=500&fit=crop',
  ];
  //  `scope` routes the device upload to the right backend path / Storage bucket:
  //  'avatar' (also persists profiles.avatar_url) · 'event-cover' · 'place-cover'.
  function MediaPicker({ value, onChange, aspect = '16/9', label = 'cover photo', scope = 'event-cover' }) {
    const [open, setOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [err, setErr] = useState('');
    const fileRef = useRef(null);

    const onFile = async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = ''; // allow re-picking the same file
      if (!file) return;
      setErr('');
      setUploading(true);
      try {
        const url = await window.uploadImage(file, { scope });
        onChange(url);
        setOpen(false);
      } catch (ex) {
        setErr((ex && ex.message) || 'Upload failed. Please try again.');
      } finally {
        setUploading(false);
      }
    };

    return React.createElement('div', { className: 'space-y-2' },
      React.createElement('button', {
        type: 'button', onClick: () => setOpen((o) => !o), disabled: uploading,
        className: 'relative w-full rounded-2xl overflow-hidden border border-border bg-white/60 group',
        style: { aspectRatio: aspect },
      },
        value
          ? React.createElement('img', { src: value, alt: '', className: 'w-full h-full object-cover' })
          : React.createElement('div', { className: 'w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground' },
              React.createElement('div', { className: 'w-11 h-11 rounded-2xl bg-accent flex items-center justify-center border border-border' },
                React.createElement(Icon, { name: 'ImagePlus', size: 18, className: 'text-gold-dark' })),
              React.createElement('span', { className: 'text-xs font-semibold' }, 'Add ' + label)),
        uploading && React.createElement('span', { className: 'absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm' },
          React.createElement('span', { className: 'w-6 h-6 rounded-full border-2 border-white border-t-transparent spin' })),
        !uploading && React.createElement('span', { className: 'absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/55 text-white text-[10px] font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity' },
          React.createElement(Icon, { name: 'Pencil', size: 10 }), value ? 'Change' : 'Browse')),

      React.createElement('input', { ref: fileRef, type: 'file', accept: 'image/*', className: 'hidden', onChange: onFile }),

      open && React.createElement('div', { className: 'p-2.5 rounded-2xl bg-white border border-border shadow-sm space-y-2.5 fade-in' },
        React.createElement('button', {
          type: 'button', onClick: () => fileRef.current && fileRef.current.click(), disabled: uploading,
          className: 'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl gold-gradient text-black text-xs font-bold shadow-sm disabled:opacity-60',
        }, React.createElement(Icon, { name: 'Upload', size: 13 }), uploading ? 'Uploading…' : 'Upload from device'),
        err && React.createElement('p', { className: 'text-[11px] text-destructive font-semibold px-1 flex items-center gap-1' },
          React.createElement(Icon, { name: 'AlertCircle', size: 11 }), err),
        React.createElement('p', { className: 'text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1' }, 'Or choose a stock image'),
        React.createElement('div', { className: 'grid grid-cols-4 gap-1.5' },
          STOCK.map((s) => React.createElement('button', {
            key: s, type: 'button', onClick: () => { onChange(s); setOpen(false); },
            className: cx('rounded-lg overflow-hidden aspect-square border-2 transition-all', value === s ? 'border-gold' : 'border-transparent hover:border-gold/40'),
          }, React.createElement('img', { src: s, alt: '', className: 'w-full h-full object-cover' })))),
        React.createElement('div', { className: 'flex gap-2 items-center pt-1' },
          React.createElement('input', {
            placeholder: 'or paste an image URL…',
            className: inputCls + ' text-xs py-2',
            onKeyDown: (e) => { if (e.key === 'Enter' && e.target.value) { onChange(e.target.value); setOpen(false); } },
          }))));
  }

  // ── Toast stack ──
  function Toasts() {
    const { toasts } = window.useApp();
    const tone = { gold: 'bg-gold-dark', green: 'bg-[#16A34A]', red: 'bg-[#DC2626]' };
    const ic = { gold: 'Sparkles', green: 'CheckCircle2', red: 'XCircle' };
    return React.createElement('div', { className: 'fixed top-4 left-1/2 -translate-x-1/2 z-[400] flex flex-col items-center gap-2 pointer-events-none w-full px-4' },
      toasts.map((t) => React.createElement('div', {
        key: t.id,
        className: cx('flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-2xl text-white text-xs font-semibold shadow-2xl slide-up max-w-sm', tone[t.kind] || tone.gold),
      },
        React.createElement(Icon, { name: ic[t.kind] || 'Sparkles', size: 15 }),
        React.createElement('span', null, t.msg))));
  }

  // ── Empty state ──
  function Empty({ icon = 'Inbox', title, sub }) {
    return React.createElement('div', { className: 'flex flex-col items-center justify-center py-16 text-center px-6' },
      React.createElement('div', { className: 'w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3' },
        React.createElement(Icon, { name: icon, size: 22, className: 'text-muted-foreground/50' })),
      React.createElement('p', { className: 'text-sm font-bold text-foreground mb-1' }, title),
      sub && React.createElement('p', { className: 'text-xs text-muted-foreground max-w-xs' }, sub));
  }

  // ── Stepper (wizard progress) ──
  function Stepper({ steps, current }) {
    return React.createElement('div', { className: 'flex items-center gap-1.5' },
      steps.map((s, i) => React.createElement('div', { key: i, className: 'flex-1 flex items-center gap-1.5' },
        React.createElement('div', {
          className: cx('h-1.5 flex-1 rounded-full transition-all', i <= current ? 'bg-gold' : 'bg-muted'),
        }))));
  }

  window.UI = { cx, Avatar, SmartImage, Button, Field, Input, Textarea, Toggle, Segmented, CategoryBadge, Overlay, MediaPicker, Toasts, Empty, Stepper, inputCls, STOCK, initials };
})();
