import { useEffect, useId, useRef, type ReactNode } from 'react';
import {
  IconAlertTriangle,
  IconCheck,
  IconInfoCircle,
  IconLoader2,
  IconX,
} from '@tabler/icons-react';

// ---------------------------------------------------------------- buttons

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  title,
  type = 'button',
  block,
  loading,
  icon,
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}) {
  const cls = [
    'btn',
    variant === 'primary' ? 'btn-primary' : '',
    variant === 'danger' ? 'btn-danger' : '',
    variant === 'ghost' ? 'btn-ghost' : '',
    size === 'sm' ? 'btn-sm' : '',
    block ? 'btn-block' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} onClick={onClick} disabled={disabled || loading} title={title} type={type}>
      {loading ? <IconLoader2 size={13} className="spin" style={{ animation: 'spin 700ms linear infinite' }} /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  title,
  disabled,
  size = 'md',
}: {
  children: ReactNode;
  onClick?: () => void;
  title: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      className={`btn btn-ghost btn-icon ${size === 'sm' ? 'btn-sm' : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      type="button"
    >
      {children}
    </button>
  );
}

// ----------------------------------------------------------------- fields

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  disabled,
  onEnter,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
  onEnter?: () => void;
  id?: string;
}) {
  return (
    <input
      id={id}
      className={`input ${mono ? 'mono-input' : ''}`}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      spellCheck={false}
      autoComplete="off"
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  mono,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <textarea
      className={`textarea ${mono ? 'mono-input' : ''}`}
      value={value}
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
  id,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as T)} disabled={disabled}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label className="switch" title={label}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="switch-track" />
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ------------------------------------------------------------------ chips

export type Tone = 'neutral' | 'ok' | 'warn' | 'err' | 'info' | 'accent';

export function Tag({ children, tone = 'neutral', title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span className={`tag ${tone === 'neutral' ? '' : `tag-${tone}`}`} title={title}>
      {children}
    </span>
  );
}

export function Pill({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="pill" title={title}>
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: 'ok' | 'warn' | 'err' | 'info' | 'idle' | 'live' }) {
  const cls = tone === 'idle' ? 'dot' : `dot dot-${tone}`;
  return <span className={cls} aria-hidden="true" />;
}

// ---------------------------------------------------------------- states

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      <p className="empty-text">{text}</p>
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'err' | 'ok';
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const Icon = tone === 'err' || tone === 'warn' ? IconAlertTriangle : tone === 'ok' ? IconCheck : IconInfoCircle;
  return (
    <div className={`banner banner-${tone}`} role={tone === 'err' ? 'alert' : undefined}>
      <Icon size={15} style={{ flex: 'none', marginTop: 1, color: `var(--${tone === 'info' ? 'info' : tone})` }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        {title ? <div className="banner-title">{title}</div> : null}
        <div>{children}</div>
      </div>
      {action}
    </div>
  );
}

// --------------------------------------------------------------- dialog

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Move focus into the dialog for keyboard users.
    const first = ref.current?.querySelector<HTMLElement>(
      'input, button, textarea, select, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-lg' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head">
          <span className="modal-title" id={titleId}>
            {title}
          </span>
          <span className="spacer" />
          <IconButton title="Close dialog" onClick={onClose}>
            <IconX size={15} />
          </IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- stats

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-label">
        {icon}
        {label}
      </span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

export function KeyValue({ items }: { items: Array<{ key: string; value: ReactNode }> }) {
  return (
    <dl className="kv">
      {items.map((i) => (
        <div key={i.key} style={{ display: 'contents' }}>
          <dt>{i.key}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const diff = Date.now() - then;
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 45) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString([], { hour12: false, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
