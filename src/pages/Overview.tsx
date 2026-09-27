import type { CliInfo, Session } from '../../shared/types';
import type { Page } from '../App';
import { CommandPreview, PageHeader, Spinner } from '../components/ui';
import { dynamodb, ec2, lambda, rds, s3, type Cmd } from '../lib/clover';
import { useCli } from '../lib/hooks';
import { Archive, Database, Server, Table, Zap, type LucideIcon } from 'lucide-react';

function ServiceCard({ title, service, icon: Icon, cmd, noun, onOpen }: {
    title: string; service: string; icon: LucideIcon; cmd: Cmd; noun: string; onOpen: () => void;
}) {
    const { data, error, loading } = useCli<unknown[]>(cmd);
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
    return (
        <div className="page">
            <PageHeader title="Overview" subtitle={<>Account {identity.account} · {identity.region}</>} />

            <section className="grid-3">
                <ServiceCard title="Table Editor" service="DynamoDB" icon={Table} cmd={dynamodb.list()} noun="tables" onOpen={() => onNavigate('tables')} />
                <ServiceCard title="Storage" service="S3 · all regions" icon={Archive} cmd={s3.list()} noun="buckets" onOpen={() => onNavigate('storage')} />
                <ServiceCard title="Functions" service="Lambda" icon={Zap} cmd={lambda.list()} noun="functions" onOpen={() => onNavigate('functions')} />
                <ServiceCard title="Databases" service="RDS" icon={Database} cmd={rds.list()} noun="databases" onOpen={() => onNavigate('databases')} />
                <ServiceCard title="Compute" service="EC2" icon={Server} cmd={ec2.list()} noun="instances" onOpen={() => onNavigate('compute')} />
            </section>

            <section className="grid-2">
                <div className="card">
                    <h3>Connection</h3>
                    <dl className="kv">
                        <div><dt>Identity</dt><dd>{identity.arn}</dd></div>
                        <div><dt>Access key</dt><dd>{session.accessKeyHint}</dd></div>
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
                    <CommandPreview cmd={['aws', 'list-resources']} />
                </div>
            </section>
        </div>
    );
}
