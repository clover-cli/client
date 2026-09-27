import type { Session } from '../../shared/types';
import { Button, CommandPreview, DataTable, ErrorBox, PageHeader, Spinner } from '../components/ui';
import { iam, type AttachedPolicy, type CommandCheck } from '../lib/clover';
import { useCli } from '../lib/hooks';
import { Check, Key, RotateCw, X } from 'lucide-react';

const SERVICE_NAMES: Record<string, string> = {
    dynamodb: 'Table Editor · DynamoDB',
    s3: 'Storage · S3',
    lambda: 'Functions · Lambda',
    rds: 'Databases · RDS',
    ec2: 'Compute · EC2',
};

const order = (service: string) => {
    const i = Object.keys(SERVICE_NAMES).indexOf(service);
    return i === -1 ? Infinity : i;
};

const POLICY_TYPES: Record<AttachedPolicy['type'], string> = {
    'aws-managed': 'AWS managed',
    'customer-managed': 'Customer managed',
    inline: 'Inline',
};

/** Where to change the permissions: the user's or role's page in the IAM console. */
function consoleUrl(arn: string): string | undefined {
    const [, , service, , , resource = ''] = arn.split(':');
    const parts = resource.split('/');
    if (service === 'iam' && parts[0] === 'user') {
        return `https://console.aws.amazon.com/iam/home#/users/details/${parts[parts.length - 1]}?section=permissions`;
    }
    if (service === 'sts' && parts[0] === 'assumed-role') {
        return `https://console.aws.amazon.com/iam/home#/roles/details/${parts[1]}?section=permissions`;
    }
    return undefined;
}

/** Shown when the credentials can't read their own IAM policies. */
function IamReadHint({ error }: { error: string }) {
    if (!/not authorized|AccessDenied/i.test(error)) return null;
    return (
        <p className="muted small">
            Reading your own permissions needs IAM read access, e.g. the <code>IAMReadOnlyAccess</code> policy.
        </p>
    );
}

function ServiceChecks({ service, checks }: { service: string; checks: CommandCheck[] }) {
    const allowed = checks.filter((c) => c.allowed).length;
    return (
        <div className="card">
            <div className="row spread">
                <h3>{SERVICE_NAMES[service] ?? service}</h3>
                <span className={`small ${allowed === checks.length ? 'status-good' : allowed === 0 ? 'status-bad' : 'status-busy'}`}>
                    {allowed}/{checks.length} allowed
                </span>
            </div>
            <ul className="checks">
                {checks.map((c) => (
                    <li key={c.command} title={c.actions.join('\n')}>
                        <span className={c.allowed ? 'status-good' : 'status-bad'}>
                            {c.allowed ? <Check size={14} /> : <X size={14} />}
                        </span>
                        <code>{c.command}</code>
                        {!c.allowed && <span className="missing">needs {c.missing.join(', ')}</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function Permissions({ session }: { session: Session }) {
    const policies = useCli<AttachedPolicy[]>(iam.policies());
    const checks = useCli<CommandCheck[]>(iam.check());
    const url = session.identity && consoleUrl(session.identity.arn);

    const byService = new Map<string, CommandCheck[]>();
    for (const c of checks.data ?? []) byService.set(c.service, [...byService.get(c.service) ?? [], c]);

    return (
        <div className="page">
            <PageHeader
                title="Permissions"
                subtitle={<>What <code>{session.identity?.arn.split(':').pop()}</code> can do. Permissions are changed in IAM, not here.</>}
                actions={<>
                    <Button icon={RotateCw} busy={policies.loading || checks.loading} onClick={() => { policies.reload(); checks.reload(); }}>Refresh</Button>
                    {url && <a className="btn btn-default" href={url} target="_blank" rel="noreferrer"><Key size={16} /> Open in IAM console</a>}
                </>}
            />

            <section className="card section">
                <h3>Policies</h3>
                <p className="muted small">Attached to you directly, inline, and through your groups.</p>
                {policies.loading && !policies.data && <Spinner />}
                <ErrorBox error={policies.error} />
                {policies.error && <IamReadHint error={policies.error} />}
                {policies.data?.length === 0 && <p>No policies, so these credentials can't do anything yet.</p>}
                {!!policies.data?.length && (
                    <DataTable rows={policies.data} rowKey={(p) => `${p.via}/${p.name}`} columns={[
                        { key: 'name', label: 'Policy' },
                        { key: 'type', label: 'Type', render: (p) => POLICY_TYPES[p.type] },
                        { key: 'via', label: 'Attached to', render: (p) => p.via === 'user' || p.via === 'role' ? `This ${p.via}` : p.via.replace(/^group /, 'Group ') },
                    ]} />
                )}
                <CommandPreview cmd={iam.policies()} />
            </section>

            <section className="section">
                <h3>What you can do in Clover</h3>
                <p className="muted small">
                    Checked with the IAM policy simulator against all resources. A policy limited to specific buckets or
                    tables shows those actions as missing here, even though they work on the allowed resources.
                </p>
                {checks.loading && !checks.data && <Spinner />}
                <ErrorBox error={checks.error} />
                {checks.error && <IamReadHint error={checks.error} />}
                {checks.data && (
                    <div className="grid-2">
                        {/* Same order as the sidebar, then anything the CLI adds later. */}
                        {[...byService.keys()]
                            .sort((a, b) => order(a) - order(b))
                            .map((service) => <ServiceChecks key={service} service={service} checks={byService.get(service)!} />)}
                    </div>
                )}
                <CommandPreview cmd={iam.check()} />
            </section>
        </div>
    );
}
