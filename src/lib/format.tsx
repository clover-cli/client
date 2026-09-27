import type { ReactNode } from 'react';

export function cell(value: unknown): ReactNode {
    if (value === undefined || value === null || value === '') return <span className="muted">—</span>;
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    if (typeof value === 'object') return <code className="cell-json">{JSON.stringify(value)}</code>;
    return String(value);
}

export function formatBytes(bytes?: number): string {
    if (bytes === undefined) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(value?: string): string {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}
