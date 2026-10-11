import { useEffect, useMemo, useRef, useState } from 'react';

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, inline }) {
  return (
    <label className={`field ${inline ? 'field-inline' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Chip({ color, children, onRemove, onClick, active }) {
  return (
    <span
      className={`chip ${onClick ? 'chip-click' : ''} ${active ? 'chip-active' : ''}`}
      style={color ? { '--chip': color } : undefined}
      onClick={onClick}
    >
      {children}
      {onRemove && (
        <button className="chip-x" onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label="Remove">×</button>
      )}
    </span>
  );
}

/** Dropdown menu triggered by a button. items: [{label, onClick, danger, disabled}|'-'] */
export function Menu({ label = '⋯', items, title = 'Actions', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className={`menu ${className}`} ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" title={title} aria-label={title} onClick={() => setOpen((o) => !o)}>{label}</button>
      {open && (
        <div className="menu-pop">
          {items.filter(Boolean).map((it, i) =>
            it === '-' ? <hr key={i} /> : (
              <button
                key={i}
                className={it.danger ? 'danger' : ''}
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick(); }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Multi-select chip picker with search and optional free-text add.
 * options: [{value, label, sub?, color?}]
 */
export function MultiPicker({ options, value, onChange, placeholder = 'Search…', allowCustom, onAddCustom, disabled, max = 40 }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const byValue = useMemo(() => Object.fromEntries(options.map((o) => [o.value, o])), [options]);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return options
      .filter((o) => !value.includes(o.value))
      .filter((o) => !t || `${o.label} ${o.sub || ''}`.toLowerCase().includes(t))
      .slice(0, max);
  }, [options, value, q, max]);
  const add = (v) => { onChange([...value, v]); setQ(''); };
  return (
    <div className="picker" ref={ref}>
      <div className="chips">
        {value.map((v) => (
          <Chip key={v} color={byValue[v]?.color} onRemove={disabled ? undefined : () => onChange(value.filter((x) => x !== v))}>
            <span title={byValue[v]?.sub}>{byValue[v]?.label || v}</span>
          </Chip>
        ))}
      </div>
      {!disabled && (
        <input
          value={q}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (matches[0]) add(matches[0].value);
              else if (allowCustom && q.trim()) { onAddCustom?.(q.trim()); add(q.trim()); }
            }
          }}
        />
      )}
      {open && !disabled && (matches.length > 0 || (allowCustom && q.trim())) && (
        <div className="picker-pop">
          {matches.map((o) => (
            <button key={o.value} onClick={() => add(o.value)}>
              <strong>{o.label}</strong>
              {o.sub && <span className="muted"> — {o.sub}</span>}
            </button>
          ))}
          {allowCustom && q.trim() && !options.some((o) => o.label.toLowerCase() === q.trim().toLowerCase()) && (
            <button onClick={() => { onAddCustom?.(q.trim()); add(q.trim()); }}>+ Add “{q.trim()}” to my library</button>
          )}
        </div>
      )}
    </div>
  );
}

export function ColorInput({ value, onChange, swatches }) {
  return (
    <div className="color-input">
      {swatches?.map((c) => (
        <button
          key={c}
          className={`swatch ${c === value ? 'swatch-on' : ''}`}
          style={{ background: c }}
          onClick={(e) => { e.preventDefault(); onChange(c); }}
          aria-label={c}
        />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'tab-on' : ''} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
