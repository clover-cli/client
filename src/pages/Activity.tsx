import type { CliActivity } from '../../shared/types';
import { Button, CopyButton, Empty, PageHeader, Spinner } from '../components/ui';
import { Terminal, Trash2 } from 'lucide-react';

/** Every clover command the app ran this session, with its exit code and error output. */
export default function Activity({ activity, onClear }: { activity: CliActivity[]; onClear: () => void }) {
    return (
        <div className="page">
            <PageHeader
                title="Activity"
                subtitle="Every clover CLI command the app has run this session. Credentials are passed as environment variables, never as arguments."
                actions={<Button icon={Trash2} onClick={onClear} disabled={activity.length === 0}>Clear</Button>}
            />
            {activity.length === 0 ? (
                <Empty icon={Terminal} title="Nothing has run yet" />
            ) : (
                <ul className="activity">
                    {activity.map((a) => (
                        <li key={a.id} className={`activity-${a.status}`}>
                            <div className="activity-line">
                                <span className="activity-status">
                                    {a.status === 'running' ? <Spinner /> : a.status === 'ok' ? '✓' : `✕ ${a.code}`}
                                </span>
                                <code>{a.command}</code>
                                <span className="muted small">
                                    {new Date(a.startedAt).toLocaleTimeString()}
                                    {a.durationMs !== undefined && ` · ${(a.durationMs / 1000).toFixed(1)}s`}
                                </span>
                                <CopyButton text={a.command} label="" />
                            </div>
                            {a.stderr && <pre className={a.status === 'error' ? 'error-box' : 'stderr'}>{a.stderr}</pre>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
