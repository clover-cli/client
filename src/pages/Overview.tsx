import type { CliInfo, Session } from '../../shared/types';
import type { Page } from '../App';
import { CommandPreview, PageHeader, Spinner } from '../components/ui';
import { cloudFunctions, cloudSql, dynamodb, ec2, gce, gcs, lambda, rds, s3, type Cmd } from '../lib/clover';
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

export default function Overview({ session, cli, onNavigate }: { session: Session; cli?: CliInfo; onNavigate: (p: Page) => void }) {
    const identity = session.identity!;
    const gcp = session.provider === 'gcp';
    return (
        <div className="page">
            <PageHeader title="Overview" subtitle={<>{gcp ? 'Project' : 'Account'} {identity.account} · {identity.region}</>} />

            <section className="grid-3">
                <ServiceCard title="Table Editor" service="DynamoDB" icon={Table} cmd={gcp ? null : dynamodb.list()} noun="tables" onOpen={() => onNavigate('tables')} />
                <ServiceCard title="Storage" service={gcp ? 'Cloud Storage' : 'S3 · all regions'} icon={Archive} cmd={gcp ? gcs.list() : s3.list()} noun="buckets" onOpen={() => onNavigate('storage')} />
                <ServiceCard title="Functions" service={gcp ? 'Cloud Functions' : 'Lambda'} icon={Zap} cmd={gcp ? cloudFunctions.list() : lambda.list()} noun="functions" onOpen={() => onNavigate('functions')} />
                <ServiceCard title="Databases" service={gcp ? 'Cloud SQL' : 'RDS'} icon={Database} cmd={gcp ? cloudSql.list() : rds.list()} noun="databases" onOpen={() => onNavigate('databases')} />
                <ServiceCard title="Compute" service={gcp ? 'Compute Engine' : 'EC2'} icon={Server} cmd={gcp ? gce.list() : ec2.list()} noun="instances" onOpen={() => onNavigate('compute')} />
            </section>

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
