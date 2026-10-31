import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { formatCommand } from '../../shared/format';
import { cell } from '../lib/format';
import { CheckIcon, Copy, Terminal, X, type LucideIcon } from 'lucide-react';

export function Button({ variant = 'default', icon: Icon, children, busy, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'default' | 'danger' | 'ghost';
    icon?: LucideIcon;
    busy?: boolean;
}) {
    return (
        <button type="button" {...props} className={`btn btn-${variant} ${props.className ?? ''}`} disabled={props.disabled || busy}>
            {busy ? <Spinner /> : Icon && <Icon size={16} />}
            {children}
        </button>
    );
}

export function Spinner() {
    return <span className="spinner" aria-label="Loading" />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
    return (
        <label className="field">
            <span className="field-label">{label}</span>
            {children}
            {hint && <span className="field-hint">{hint}</span>}
        </label>
    );
}

export function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="check">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span>
                {label}
                {hint && <span className="field-hint">{hint}</span>}
            </span>
        </label>
    );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
    return (
        <header className="page-header">
            <div>
                <h1>{title}</h1>
                {subtitle && <p className="muted">{subtitle}</p>}
            </div>
            {actions && <div className="row">{actions}</div>}
        </header>
    );
}

export function ErrorBox({ error }: { error?: string }) {
    if (!error) return null;
    return <pre className="error-box">{error}</pre>;
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
    return (
        <div className="empty">
            <Icon size={28} />
            <h3>{title}</h3>
            {children}
        </div>
    );
}

const GOOD = /^(running|runnable|available|active|enabled|successful)$/i;
const BAD = /^(failed|error|terminated|deleting|shutting-down|inactive|incompatible.*|storage-full)$/i;
const IDLE = /^(stopped|disabled|suspended)$/i;

export function Status({ value }: { value?: string }) {
    if (!value) return <span className="muted">—</span>;
    const tone = GOOD.test(value) ? 'good' : BAD.test(value) ? 'bad' : IDLE.test(value) ? 'idle' : 'busy';
    return <span className={`status status-${tone}`}><i />{value}</span>;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <Button variant="ghost" icon={copied ? CheckIcon : Copy} title="Copy to clipboard" onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
            });
        }}>{copied ? 'Copied' : label}</Button>
    );
}

/** The CLI command an action runs, to copy into a terminal or script. */
export function CommandPreview({ cmd }: { cmd: string[] }) {
    const text = formatCommand(cmd);
    return (
        <div className="command">
            <div className="command-head">
                <span><Terminal size={14} /> Equivalent CLI command</span>
                <CopyButton text={text} />
            </div>
            <code>{text}</code>
        </div>
    );
}

export function Modal({ title, onClose, children, footer, wide }: {
    title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
    return (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-label={title}>
                <header className="modal-head">
                    <h2>{title}</h2>
                    <Button variant="ghost" icon={X} onClick={onClose} aria-label="Close" />
                </header>
                <div className="modal-body">{children}</div>
                {footer && <footer className="modal-foot">{footer}</footer>}
            </div>
        </div>
    );
}

export function KeyValues({ value }: { value: object }) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== '');
    return (
        <dl className="kv">
            {entries.map(([k, v]) => (
                <div key={k}>
                    <dt>{k}</dt>
                    <dd>{typeof v === 'object' ? <code>{JSON.stringify(v)}</code> : String(v)}</dd>
                </div>
            ))}
        </dl>
    );
}

export interface Column<T> {
    key: string;
    label: string;
    render?: (row: T) => ReactNode;
    width?: string;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, selected, actions }: {
    columns: Column<T>[];
    rows: T[];
    rowKey: (row: T) => string;
    onRowClick?: (row: T) => void;
    selected?: string;
    actions?: (row: T) => ReactNode;
}) {
    return (
        <div className="table-wrap">
            <table className="data">
                <thead>
                    <tr>
                        {columns.map((c) => <th key={c.key} style={{ width: c.width }}>{c.label}</th>)}
                        {actions && <th className="actions-col" />}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const id = rowKey(row);
                        return (
                            <tr key={id} className={`${onRowClick ? 'clickable' : ''} ${selected === id ? 'selected' : ''}`}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}>
                                {columns.map((c) => (
                                    <td key={c.key}>{c.render ? c.render(row) : cell((row as Record<string, unknown>)[c.key])}</td>
                                ))}
                                {actions && <td className="actions-col" onClick={(e) => e.stopPropagation()}>{actions(row)}</td>}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
