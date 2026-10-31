import type { CliInfo, Session } from '../../shared/types';
import type { Page } from '../App';
import { useState } from 'react';
import { CommandPreview, ErrorBox, PageHeader, Spinner } from '../components/ui';
import { cloudFunctions, cloudSql, cost, dynamodb, ec2, firestore, gce, gcs, lambda, rds, s3, type Cmd, type MonthlyCost } from '../lib/clover';
import { useCli } from '../lib/hooks';
import { Archive, Database, Server, Table, Zap, type LucideIcon } from 'lucide-react';

/** `cmd` is null when the service has no equivalent on the session's provider: no card. */
function ServiceCard({ title, service, icon: Icon, cmd, noun, onOpen }: {
    title: string; service: string; icon: LucideIcon; cmd: Cmd | null; noun: string; onOpen: () => void;
}) {
    const { data, error, loading } = useCli<unknown[]>(cmd);
    if (!cmd) return null;
    return (
        <button className="card service-card" onClick={onOpen}>
            <div className="service-card-head">
                <span className="service-icon"><Icon size={18} /></span>
                <div>
                    <h3>{title}</h3>
                    <span className="muted small">{service}</span>
                </div>
            </div>
            <div className="service-count">
                {loading ? <Spinner /> : error
                    ? <span className="error-text small" title={error}>Couldn't list: {error.split('\n')[0]}</span>
                    : <><strong>{data?.length ?? 0}</strong> <span className="muted">{noun}</span></>}
            </div>
        </button>
    );
}

const money = (amount: number, unit = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency: unit }).format(amount);

/** The AWS bill per month, from Cost Explorer (the whole organization from its management account). */
function Billing() {
    const [months, setMonths] = useState(6);
    const cmd = cost.monthly({ months });
    const bill = useCli<MonthlyCost[]>(cmd);
    const rows = [...bill.data ?? []].reverse();
    return (
        <div className="card">
            <div className="row spread">
                <h3>Billing</h3>
                <select value={months} onChange={(e) => setMonths(Number(e.target.value))} title="Months to show (--months)">
                    {[3, 6, 12].map((n) => <option key={n} value={n}>Last {n} months</option>)}
                </select>
            </div>
            <ErrorBox error={bill.error} />
            {bill.loading && !bill.data && <Spinner />}
            {rows.length > 0 && (
                <dl className="kv">
                    {rows.map((m, i) => (
                        <div key={m.month}>
                            <dt>{m.month}{i === 0 && <span className="muted"> · so far</span>}</dt>
                            <dd>{money(m.amount, m.unit)}</dd>
                        </div>
                    ))}
                </dl>
            )}
            <CommandPreview cmd={cmd} />
        </div>
    );
}

export default function Overview({ session, cli, onNavigate }: { session: Session; cli?: CliInfo; onNavigate: (p: Page) => void }) {
    const identity = session.identity!;
    const gcp = session.provider === 'gcp';
    return (
        <div className="page">
            <PageHeader title="Overview" subtitle={<>{gcp ? 'Project' : 'Account'} {identity.account} · {identity.region}</>} />

            <section className="grid-3">
                <ServiceCard title="Table Editor" service={gcp ? 'Firestore' : 'DynamoDB'} icon={Table} cmd={gcp ? firestore.list() : dynamodb.list()} noun={gcp ? 'databases' : 'tables'} onOpen={() => onNavigate('tables')} />
                <ServiceCard title="Storage" service={gcp ? 'Cloud Storage' : 'S3 · all regions'} icon={Archive} cmd={gcp ? gcs.list() : s3.list()} noun="buckets" onOpen={() => onNavigate('storage')} />
                <ServiceCard title="Functions" service={gcp ? 'Cloud Functions' : 'Lambda'} icon={Zap} cmd={gcp ? cloudFunctions.list() : lambda.list()} noun="functions" onOpen={() => onNavigate('functions')} />
                <ServiceCard title="Databases" service={gcp ? 'Cloud SQL' : 'RDS'} icon={Database} cmd={gcp ? cloudSql.list() : rds.list()} noun="databases" onOpen={() => onNavigate('databases')} />
                <ServiceCard title="Compute" service={gcp ? 'Compute Engine' : 'EC2'} icon={Server} cmd={gcp ? gce.list() : ec2.list()} noun="instances" onOpen={() => onNavigate('compute')} />
            </section>

            {!gcp && <section className="section-gap"><Billing /></section>}

            <section className="grid-2">
                <div className="card">
                    <h3>Connection</h3>
                    <dl className="kv">
                        <div><dt>Identity</dt><dd>{identity.arn}</dd></div>
                        <div><dt>{gcp ? 'Key file' : 'Access key'}</dt><dd>{session.accessKeyHint}</dd></div>
                        <div><dt>Credentials from</dt><dd>{session.source === 'env' ? 'The environment the app was started from' : 'Entered in the app (in memory only)'}</dd></div>
                        <div><dt>CLI</dt><dd>{cli?.version ? `clover-cli ${cli.version}` : '—'} <span className="muted">{cli?.location}</span></dd></div>
                    </dl>
                </div>
                <div className="card">
                    <h3>Same thing, from a terminal</h3>
                    <p className="muted small">
                        Every screen here runs a <code>clover</code> command, and shows it so you can copy it into a script.
                        The Activity page lists everything that ran.
                    </p>
                    <CommandPreview cmd={[gcp ? 'gcp' : 'aws', 'list-resources']} />
                </div>
            </section>
        </div>
    );
}
