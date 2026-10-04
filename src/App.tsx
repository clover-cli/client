import { useEffect, useState } from 'react';
import type { CliActivity, CliInfo, Session } from '../shared/types';
import { Button, Spinner } from './components/ui';
import { REGIONS } from './lib/clover';
import Activity from './pages/Activity';
import Compute from './pages/Compute';
import Connect from './pages/Connect';
import Databases from './pages/Databases';
import Functions from './pages/Functions';
import Overview from './pages/Overview';
import Permissions from './pages/Permissions';
import Storage from './pages/Storage';
import Tables from './pages/Tables';
import { Archive, Database, House, Key, Leaf, LogOut, Server, Table, Terminal, Zap, type LucideIcon } from 'lucide-react';

export type Page = 'overview' | 'tables' | 'storage' | 'functions' | 'databases' | 'compute' | 'permissions' | 'activity';

/** `aws` / `gcp`: the service behind the page on that provider. Pages without one for the session's provider are hidden. */
const NAV: { page: Page; label: string; icon: LucideIcon; aws?: string; gcp?: string }[] = [
    { page: 'overview', label: 'Overview', icon: House },
    { page: 'tables', label: 'Table Editor', icon: Table, aws: 'DynamoDB' },
    { page: 'storage', label: 'Storage', icon: Archive, aws: 'S3', gcp: 'Cloud Storage' },
    { page: 'functions', label: 'Functions', icon: Zap, aws: 'Lambda', gcp: 'Cloud Functions' },
    { page: 'databases', label: 'Databases', icon: Database, aws: 'RDS', gcp: 'Cloud SQL' },
    { page: 'compute', label: 'Compute', icon: Server, aws: 'EC2' },
];

export default function App() {
    const [session, setSession] = useState<Session>();
    const [cli, setCli] = useState<CliInfo>();
    const [page, setPage] = useState<Page>('overview');
    const [activity, setActivity] = useState<CliActivity[]>([]);
    const [regionBusy, setRegionBusy] = useState(false);
    const [regionError, setRegionError] = useState<string>();

    useEffect(() => {
        void window.clover.session.get().then(setSession);
        void window.clover.cli.info().then(setCli);
        return window.clover.cli.onActivity((a) => {
            setActivity((list) => {
                const i = list.findIndex((x) => x.id === a.id);
                if (i === -1) return [a, ...list].slice(0, 300);
                const next = [...list];
                next[i] = a;
                return next;
            });
        });
    }, []);

    if (!session) {
        return <div className="center-screen"><Spinner /></div>;
    }
    if (!session.connected || !session.identity) {
        return <Connect cli={cli} onConnected={setSession} />;
    }

    const { identity } = session;
    const provider = session.provider ?? 'aws';
    const runningCount = activity.filter((a) => a.status === 'running').length;

    async function changeRegion(region: string) {
        setRegionBusy(true);
        setRegionError(undefined);
        try {
            setSession(await window.clover.session.setRegion(region));
        } catch (err) {
            setRegionError((err as Error).message);
        } finally {
            setRegionBusy(false);
        }
    }

    return (
        <div className="app">
            <aside className="sidebar">
                <div className="brand">
                    <span className="brand-mark"><Leaf size={18} /></span>
                    <span>Clover</span>
                </div>
                <nav>
                    {NAV.filter((item) => !item.aws || item[provider]).map((item) => (
                        <button key={item.page} className={`nav-item ${page === item.page ? 'active' : ''}`} onClick={() => setPage(item.page)}>
                            <item.icon size={16} />
                            <span>{item.label}</span>
                            {item[provider] && <small>{item[provider]}</small>}
                        </button>
                    ))}
                </nav>
                <div className="sidebar-bottom">
                    {provider === 'aws' && (
                        <button className={`nav-item ${page === 'permissions' ? 'active' : ''}`} onClick={() => setPage('permissions')}>
                            <Key size={16} />
                            <span>Permissions</span>
                            <small>IAM</small>
                        </button>
                    )}
                    <button className={`nav-item ${page === 'activity' ? 'active' : ''}`} onClick={() => setPage('activity')}>
                        <Terminal size={16} />
                        <span>Activity</span>
                        {runningCount > 0 && <span className="pill">{runningCount}</span>}
                    </button>
                    <div className="cli-version" title={cli?.location}>
                        {cli?.version ? `clover-cli ${cli.version}` : cli?.error ? 'CLI not found' : '…'}
                    </div>
                </div>
            </aside>

            <div className="main">
                <header className="topbar">
                    <div className="account">
                        <span className="muted">{provider === 'gcp' ? 'Project' : 'Account'}</span>
                        <strong>{identity.account}</strong>
                        <span className="muted arn" title={identity.arn}>{identity.arn.split(':').pop()}</span>
                    </div>
                    <div className="row">
                        {regionError && <span className="error-text" title={regionError}>Region change failed</span>}
                        {provider === 'aws' ? (
                            <label className="region">
                                {regionBusy ? <Spinner /> : <span className="muted">Region</span>}
                                <select value={identity.region} disabled={regionBusy} onChange={(e) => void changeRegion(e.target.value)}>
                                    {(REGIONS.includes(identity.region) ? REGIONS : [identity.region, ...REGIONS]).map((r) => <option key={r}>{r}</option>)}
                                </select>
                            </label>
                        ) : (
                            // ponytail: GCP commands use the CLI's default region; add a picker (passing --region) when someone needs another.
                            <span className="muted">Region {identity.region}</span>
                        )}
                        <Button variant="ghost" icon={LogOut} title={`Forget the credentials (${session.accessKeyHint}), like clover ${provider} logout`}
                            onClick={() => void window.clover.session.disconnect().then(setSession)}>
                            Disconnect
                        </Button>
                    </div>
                </header>

                {/* Remount the page when the region changes so everything is listed again. */}
                <main className="content" key={identity.region}>
                    {page === 'overview' && <Overview session={session} cli={cli} onNavigate={setPage} />}
                    {page === 'tables' && <Tables />}
                    {page === 'storage' && <Storage gcp={provider === 'gcp'} />}
                    {page === 'functions' && <Functions gcp={provider === 'gcp'} />}
                    {page === 'databases' && <Databases gcp={provider === 'gcp'} />}
                    {page === 'compute' && <Compute />}
                    {page === 'permissions' && <Permissions session={session} />}
                    {page === 'activity' && <Activity activity={activity} onClear={() => setActivity((l) => l.filter((a) => a.status === 'running'))} />}
                </main>
            </div>
        </div>
    );
}
