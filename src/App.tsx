import { useEffect, useState } from 'react';
import type { CliActivity, CliInfo, Session } from '../shared/types';
import { Icon, type IconName } from './components/Icon';
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

export type Page = 'overview' | 'tables' | 'storage' | 'functions' | 'databases' | 'compute' | 'permissions' | 'activity';

const NAV: { page: Page; label: string; icon: IconName; service?: string }[] = [
    { page: 'overview', label: 'Overview', icon: 'home' },
    { page: 'tables', label: 'Table Editor', icon: 'table', service: 'DynamoDB' },
    { page: 'storage', label: 'Storage', icon: 'bucket', service: 'S3' },
    { page: 'functions', label: 'Functions', icon: 'function', service: 'Lambda' },
    { page: 'databases', label: 'Databases', icon: 'database', service: 'RDS' },
    { page: 'compute', label: 'Compute', icon: 'server', service: 'EC2' },
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
                    <span className="brand-mark"><Icon name="leaf" size={18} /></span>
                    <span>Clover</span>
                </div>
                <nav>
                    {NAV.map((item) => (
                        <button key={item.page} className={`nav-item ${page === item.page ? 'active' : ''}`} onClick={() => setPage(item.page)}>
                            <Icon name={item.icon} />
                            <span>{item.label}</span>
                            {item.service && <small>{item.service}</small>}
                        </button>
                    ))}
                </nav>
                <div className="sidebar-bottom">
                    <button className={`nav-item ${page === 'permissions' ? 'active' : ''}`} onClick={() => setPage('permissions')}>
                        <Icon name="key" />
                        <span>Permissions</span>
                        <small>IAM</small>
                    </button>
                    <button className={`nav-item ${page === 'activity' ? 'active' : ''}`} onClick={() => setPage('activity')}>
                        <Icon name="terminal" />
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
                        <span className="muted">Account</span>
                        <strong>{identity.account}</strong>
                        <span className="muted arn" title={identity.arn}>{identity.arn.split(':').pop()}</span>
                    </div>
                    <div className="row">
                        {regionError && <span className="error-text" title={regionError}>Region change failed</span>}
                        <label className="region">
                            {regionBusy ? <Spinner /> : <span className="muted">Region</span>}
                            <select value={identity.region} disabled={regionBusy} onChange={(e) => void changeRegion(e.target.value)}>
                                {(REGIONS.includes(identity.region) ? REGIONS : [identity.region, ...REGIONS]).map((r) => <option key={r}>{r}</option>)}
                            </select>
                        </label>
                        <Button variant="ghost" icon="logout" title={`Forget the credentials (${session.accessKeyHint}), like clover aws logout`}
                            onClick={() => void window.clover.session.disconnect().then(setSession)}>
                            Disconnect
                        </Button>
                    </div>
                </header>

                {/* Remount the page when the region changes so everything is listed again. */}
                <main className="content" key={identity.region}>
                    {page === 'overview' && <Overview session={session} cli={cli} onNavigate={setPage} />}
                    {page === 'tables' && <Tables />}
                    {page === 'storage' && <Storage />}
                    {page === 'functions' && <Functions />}
                    {page === 'databases' && <Databases />}
                    {page === 'compute' && <Compute />}
                    {page === 'permissions' && <Permissions session={session} />}
                    {page === 'activity' && <Activity activity={activity} onClear={() => setActivity((l) => l.filter((a) => a.status === 'running'))} />}
                </main>
            </div>
        </div>
    );
}
