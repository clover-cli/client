/** A small inline icon set (Lucide-style strokes), so the app needs no icon dependency. */
const PATHS = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    bucket: 'M4 7h16l-1.5 12.2a2 2 0 0 1-2 1.8h-9a2 2 0 0 1-2-1.8zM3 7h18M8 7V5a4 4 0 0 1 8 0v2',
    table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
    database: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    function: 'M13 2 4 14h7l-1 8 9-12h-7z',
    server: 'M3 4h18v7H3zM3 13h18v7H3zM7 7.5h.01M7 16.5h.01',
    terminal: 'M4 17l6-5-6-5M12 19h8',
    refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
    plus: 'M12 5v14M5 12h14',
    trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
    play: 'M7 4l13 8-13 8z',
    stop: 'M6 6h12v12H6z',
    rotate: 'M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.4 6.4L3 16M3 21v-5h5',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    close: 'M6 6l12 12M18 6 6 18',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    key: 'M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7zM16 11h.01',
    folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
    file: 'M6 3h8l5 5v13H6zM14 3v5h5',
    check: 'M5 12l5 5L20 7',
    leaf: 'M5 21c0-9 6-15 16-16-1 10-7 16-16 16zM5 21l7-7',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={PATHS[name]} />
        </svg>
    );
}
