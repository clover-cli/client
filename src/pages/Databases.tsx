import { useState } from 'react';
import { ActionModal } from '../components/ActionModal';
import { Button, Check, Chips, CopyButton, DataTable, Empty, ErrorBox, Field, KeyValues, Modal, PageHeader, Spinner, Status } from '../components/ui';
import { cloudSql, lines, rds, type Cmd, type Database, type RdsClassCount } from '../lib/clover';
import { useCli } from '../lib/hooks';
import { DatabaseIcon, Pencil, Play, Plus, RefreshCw, RotateCw, Square, Trash2 } from 'lucide-react';

const ENGINES = ['postgres', 'mysql', 'mariadb'];
const CLASSES = ['db.t3.micro', 'db.t3.small', 'db.t3.medium', 'db.t4g.micro', 'db.t4g.small', 'db.t4g.medium'];
const SQL_VERSIONS = ['POSTGRES_16', 'POSTGRES_15', 'MYSQL_8_0', 'SQLSERVER_2022_EXPRESS'];
const SQL_TIERS = ['db-f1-micro', 'db-g1-small', 'db-custom-1-3840', 'db-custom-2-7680'];

/** Cloud SQL has no status for "stopped": a stopped instance has activation policy NEVER. */
const statusOf = (db: Database) => db.activation === 'NEVER' ? 'stopped' : db.status;

function connectionUrl(db: Database): string | undefined {
    // Cloud SQL: the root user is postgres / root, and there's a default database only on Postgres.
    if (db.ip) {
        if (db.version?.startsWith('POSTGRES')) return `postgresql://postgres:<password>@${db.ip}:5432/postgres`;
        if (db.version?.startsWith('MYSQL')) return `mysql://root:<password>@${db.ip}:3306/`;
        return undefined;
    }
    if (!db.endpoint) return undefined;
    const scheme = db.engine?.startsWith('postgres') ? 'postgresql' : 'mysql';
    return `${scheme}://${db.username ?? 'user'}:<password>@${db.endpoint}:${db.port}/${db.database ?? ''}`;
}

/** clover aws rds summary. Keyed on the list, so it's read again whenever the list changes. */
function ClassSummary() {
    const summary = useCli<RdsClassCount[]>(rds.summary());
    return <Chips items={(summary.data ?? []).map((g) => `${g.count} × ${g.engine} ${g.class} · ${g.storageGb} GiB · ${g.available} available`)} />;
}

function CreateDatabase({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const [id, setId] = useState('');
    const [engine, setEngine] = useState('postgres');
    const [database, setDatabase] = useState('app');
    const [username, setUsername] = useState('dbadmin');
    const [password, setPassword] = useState('');
    const [cls, setCls] = useState('db.t3.micro');
    const [storage, setStorage] = useState('20');
    const [isPublic, setPublic] = useState(false);
    const [protect, setProtect] = useState(false);
    const [tags, setTags] = useState('');
    const [wait, setWait] = useState(false);

    const cmd = rds.create(id || '<id>', {
        engine, database, username, password, 'instance-class': cls, storage: Number(storage) || undefined,
        public: isPublic || undefined, 'deletion-protection': protect || undefined, tags: lines(tags), wait: wait || undefined,
    });
    return (
        <ActionModal wide title="New database" submitLabel="Create database" cmd={cmd} valid={!!id} onClose={onClose} onDone={onDone}>
            <div className="field-row">
                <Field label="Identifier"><input value={id} onChange={(e) => setId(e.target.value)} placeholder="app-db" autoFocus spellCheck={false} /></Field>
                <Field label="Engine">
                    <select value={engine} onChange={(e) => setEngine(e.target.value)}>{ENGINES.map((x) => <option key={x}>{x}</option>)}</select>
                </Field>
            </div>
            <div className="field-row">
                <Field label="Database name"><input value={database} onChange={(e) => setDatabase(e.target.value)} spellCheck={false} /></Field>
                <Field label="Master username"><input value={username} onChange={(e) => setUsername(e.target.value)} spellCheck={false} /></Field>
            </div>
            <Field label="Master password (optional)" hint="Leave empty and AWS generates one and keeps it in Secrets Manager (shown as passwordSecret)">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <div className="field-row">
                <Field label="Instance class">
                    <select value={cls} onChange={(e) => setCls(e.target.value)}>{CLASSES.map((x) => <option key={x}>{x}</option>)}</select>
                </Field>
                <Field label="Storage (GiB)"><input type="number" value={storage} onChange={(e) => setStorage(e.target.value)} /></Field>
            </div>
            <Field label="Tags (optional)" hint="One Key=Value per line">
                <textarea rows={2} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="env=dev" spellCheck={false} />
            </Field>
            <Check label="Publicly accessible" hint="Reachable from outside the VPC. The security group must also allow your IP." checked={isPublic} onChange={setPublic} />
            <Check label="Deletion protection" checked={protect} onChange={setProtect} />
            <Check label="Wait until available" hint="Usually 5–15 minutes" checked={wait} onChange={setWait} />
            {password && <p className="muted small">The password is passed to the CLI as an argument, as it would be in a terminal.</p>}
        </ActionModal>
    );
}

function CreateCloudSql({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const [id, setId] = useState('');
    const [version, setVersion] = useState(SQL_VERSIONS[0]);
    const [tier, setTier] = useState(SQL_TIERS[0]);
    const [storage, setStorage] = useState('10');
    const [password, setPassword] = useState('');
    const [isPublic, setPublic] = useState(false);
    const [protect, setProtect] = useState(false);
    const [labels, setLabels] = useState('');
    const [wait, setWait] = useState(false);

    const cmd = cloudSql.create(id || '<id>', {
        'database-version': version, tier, storage: Number(storage) || undefined, password: password || '<password>',
        public: isPublic || undefined, 'deletion-protection': protect || undefined, labels: lines(labels), wait: wait || undefined,
    });
    return (
        <ActionModal wide title="New database" submitLabel="Create database" cmd={cmd} valid={!!id && !!password} onClose={onClose} onDone={onDone}>
            <div className="field-row">
                <Field label="Instance ID"><input value={id} onChange={(e) => setId(e.target.value)} placeholder="app-db" autoFocus spellCheck={false} /></Field>
                <Field label="Version">
                    <select value={version} onChange={(e) => setVersion(e.target.value)}>{SQL_VERSIONS.map((x) => <option key={x}>{x}</option>)}</select>
                </Field>
            </div>
            <Field label="Root password" hint="For the postgres, root or sqlserver user">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <div className="field-row">
                <Field label="Tier">
                    <select value={tier} onChange={(e) => setTier(e.target.value)}>{SQL_TIERS.map((x) => <option key={x}>{x}</option>)}</select>
                </Field>
                <Field label="Storage (GiB)"><input type="number" value={storage} onChange={(e) => setStorage(e.target.value)} /></Field>
            </div>
            <Field label="Labels (optional)" hint="One Key=Value per line">
                <textarea rows={2} value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="env=dev" spellCheck={false} />
            </Field>
            <Check label="Public IP" hint="Connections still need an authorized network or the Cloud SQL Auth Proxy" checked={isPublic} onChange={setPublic} />
            <Check label="Deletion protection" checked={protect} onChange={setProtect} />
            <Check label="Wait until ready" hint="Usually 5–15 minutes" checked={wait} onChange={setWait} />
            <p className="muted small">The password is passed to the CLI as an argument, as it would be in a terminal.</p>
        </ActionModal>
    );
}

/** clover aws rds update: only what's changed is sent. */
function EditRds({ db, onClose, onDone }: { db: Database; onClose: () => void; onDone: () => void }) {
    const [cls, setCls] = useState(db.class ?? '');
    const [storage, setStorage] = useState(String(db.storageGb ?? ''));
    const [password, setPassword] = useState('');
    const [backups, setBackups] = useState('');
    const [multiAz, setMultiAz] = useState(!!db.multiAz);
    const [isPublic, setPublic] = useState(!!db.public);
    const [protect, setProtect] = useState(!!db.deletionProtection);
    const [tags, setTags] = useState('');
    const [now, setNow] = useState(true);
    const [wait, setWait] = useState(false);

    const changed = {
        'instance-class': cls !== db.class ? cls : undefined,
        storage: Number(storage) && Number(storage) !== db.storageGb ? Number(storage) : undefined,
        password: password || undefined,
        'backup-retention': backups === '' ? undefined : Number(backups),
        'multi-az': multiAz !== !!db.multiAz ? multiAz : undefined,
        public: isPublic !== !!db.public ? isPublic : undefined,
        'deletion-protection': protect !== !!db.deletionProtection ? protect : undefined,
        tags: lines(tags),
    };
    const valid = Object.values(changed).some((v) => Array.isArray(v) ? v.length : v !== undefined)
        && !(Number(storage) < (db.storageGb ?? 0));
    return (
        <ActionModal wide title={`Edit ${db.id}`} submitLabel="Save" valid={valid} onClose={onClose} onDone={onDone}
            cmd={rds.update(db.id, { ...changed, 'apply-immediately': now || undefined, wait: wait || undefined })}>
            <div className="field-row">
                <Field label="Instance class">
                    <select value={cls} onChange={(e) => setCls(e.target.value)}>
                        {[...new Set([db.class ?? '', ...CLASSES])].filter(Boolean).map((x) => <option key={x}>{x}</option>)}
                    </select>
                </Field>
                <Field label="Storage (GiB)" hint="Can only grow">
                    <input type="number" min={db.storageGb} value={storage} onChange={(e) => setStorage(e.target.value)} />
                </Field>
            </div>
            <div className="field-row">
                <Field label="New master password (optional)">
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <Field label="Backup retention (days, optional)">
                    <input type="number" min={0} value={backups} onChange={(e) => setBackups(e.target.value)} placeholder="unchanged" />
                </Field>
            </div>
            <Field label="Set tags (optional)" hint="One Key=Value per line">
                <textarea rows={2} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="env=prod" spellCheck={false} />
            </Field>
            <Check label="Multi-AZ" hint="A standby copy in another zone, for failover" checked={multiAz} onChange={setMultiAz} />
            <Check label="Publicly accessible" checked={isPublic} onChange={setPublic} />
            <Check label="Deletion protection" checked={protect} onChange={setProtect} />
            <Check label="Apply now" hint="Otherwise AWS applies it in the next maintenance window" checked={now} onChange={setNow} />
            <Check label="Wait until done" checked={wait} onChange={setWait} />
            {password && <p className="muted small">The password is passed to the CLI as an argument, as it would be in a terminal.</p>}
        </ActionModal>
    );
}

/** clover gcp sql update: only what's changed is sent. */
function EditCloudSql({ db, onClose, onDone }: { db: Database; onClose: () => void; onDone: () => void }) {
    const [tier, setTier] = useState(db.tier ?? '');
    const [storage, setStorage] = useState(String(db.storageGb ?? ''));
    const [isPublic, setPublic] = useState(!!db.public);
    const [protect, setProtect] = useState(!!db.deletionProtection);
    const [labels, setLabels] = useState('');
    const [wait, setWait] = useState(false);

    const changed = {
        tier: tier !== db.tier ? tier : undefined,
        storage: Number(storage) && Number(storage) !== db.storageGb ? Number(storage) : undefined,
        public: isPublic !== !!db.public ? isPublic : undefined,
        'deletion-protection': protect !== !!db.deletionProtection ? protect : undefined,
        labels: lines(labels),
    };
    const valid = Object.values(changed).some((v) => Array.isArray(v) ? v.length : v !== undefined)
        && !(Number(storage) < (db.storageGb ?? 0));
    return (
        <ActionModal wide title={`Edit ${db.id}`} submitLabel="Save" cmd={cloudSql.update(db.id, { ...changed, wait: wait || undefined })}
            valid={valid} onClose={onClose} onDone={onDone}>
            <div className="field-row">
                <Field label="Tier" hint="Changing it restarts the instance">
                    <select value={tier} onChange={(e) => setTier(e.target.value)}>
                        {[...new Set([db.tier ?? '', ...SQL_TIERS])].filter(Boolean).map((x) => <option key={x}>{x}</option>)}
                    </select>
                </Field>
                <Field label="Storage (GiB)" hint="Can only grow">
                    <input type="number" min={db.storageGb} value={storage} onChange={(e) => setStorage(e.target.value)} />
                </Field>
            </div>
            <Field label="Set labels (optional)" hint="One Key=Value per line">
                <textarea rows={2} value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="env=prod" spellCheck={false} />
            </Field>
            <Check label="Public IP" checked={isPublic} onChange={setPublic} />
            <Check label="Deletion protection" checked={protect} onChange={setProtect} />
            <Check label="Wait until done" checked={wait} onChange={setWait} />
        </ActionModal>
    );
}

function Details({ gcp, id, onClose }: { gcp: boolean; id: string; onClose: () => void }) {
    const db = useCli<Database>((gcp ? cloudSql : rds).get(id));
    const url = db.data && connectionUrl(db.data);
    return (
        <Modal wide title={id} onClose={onClose}>
            <ErrorBox error={db.error} />
            {db.loading && !db.data && <Spinner />}
            {url && (
                <div className="command">
                    <div className="command-head"><span>Connection string</span><CopyButton text={url} /></div>
                    <code>{url}</code>
                </div>
            )}
            {db.data && <KeyValues value={db.data} />}
        </Modal>
    );
}

type Power = { action: 'start' | 'stop' | 'reboot'; id: string };
const POWER_TEXT = {
    start: 'Start the database.',
    stop: 'Stop the database. You keep paying for storage.',
    reboot: 'Reboot the database. Connections drop for a moment.',
};

export default function Databases({ gcp }: { gcp: boolean }) {
    const api = gcp ? cloudSql : rds;
    const dbs = useCli<Database[]>(api.list());
    const [creating, setCreating] = useState(false);
    const [details, setDetails] = useState<string>();
    const [power, setPower] = useState<Power>();
    const [editing, setEditing] = useState<Database>();
    const [deleting, setDeleting] = useState<Database>();
    const [snapshot, setSnapshot] = useState('');
    const [force, setForce] = useState(false);

    const powerCmd = (p: Power): Cmd => api[p.action](p.id);

    return (
        <div className="page">
            <PageHeader title="Databases" subtitle={gcp ? 'Cloud SQL: managed Postgres, MySQL and SQL Server' : 'RDS: managed Postgres, MySQL and MariaDB'}
                actions={<>
                    <Button icon={RotateCw} onClick={dbs.reload} busy={dbs.loading}>Refresh</Button>
                    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New database</Button>
                </>} />
            <ErrorBox error={dbs.error} />
            {!gcp && dbs.data && <ClassSummary key={dbs.data.map((d) => `${d.id}:${d.class}:${d.status}:${d.storageGb}`).join()} />}
            {dbs.loading && !dbs.data && <Spinner />}
            {dbs.data?.length === 0 && <Empty icon={DatabaseIcon} title="No databases yet">A Postgres database is one form away.</Empty>}
            {!!dbs.data?.length && (
                <DataTable rows={dbs.data} rowKey={(d) => d.id} onRowClick={(d) => setDetails(d.id)} columns={[
                    { key: 'id', label: 'Identifier' },
                    { key: 'engine', label: 'Engine', render: (d) => [d.engine, d.version].filter(Boolean).join(' ') },
                    { key: 'class', label: gcp ? 'Tier' : 'Class', render: (d) => d.class ?? d.tier },
                    { key: 'status', label: 'Status', render: (d) => <Status value={statusOf(d)} /> },
                    { key: 'endpoint', label: 'Endpoint', render: (d) => d.endpoint ? `${d.endpoint}:${d.port}` : d.ip ?? '—' },
                ]} actions={(d) => (
                    <span className="row">
                        {statusOf(d) === 'stopped'
                            ? <Button variant="ghost" icon={Play} title="Start" onClick={() => setPower({ action: 'start', id: d.id })} />
                            : <Button variant="ghost" icon={Square} title="Stop" onClick={() => setPower({ action: 'stop', id: d.id })} />}
                        <Button variant="ghost" icon={RefreshCw} title="Reboot" onClick={() => setPower({ action: 'reboot', id: d.id })} />
                        <Button variant="ghost" icon={Pencil} title="Edit" onClick={() => setEditing(d)} />
                        <Button variant="ghost" icon={Trash2} title="Delete" onClick={() => { setSnapshot(''); setForce(false); setDeleting(d); }} />
                    </span>
                )} />
            )}

            {creating && (gcp
                ? <CreateCloudSql onClose={() => setCreating(false)} onDone={dbs.reload} />
                : <CreateDatabase onClose={() => setCreating(false)} onDone={dbs.reload} />)}
            {editing && (gcp
                ? <EditCloudSql db={editing} onClose={() => setEditing(undefined)} onDone={dbs.reload} />
                : <EditRds db={editing} onClose={() => setEditing(undefined)} onDone={dbs.reload} />)}
            {details && <Details gcp={gcp} id={details} onClose={() => setDetails(undefined)} />}
            {power && (
                <ActionModal title={`${power.action[0].toUpperCase()}${power.action.slice(1)} ${power.id}`} submitLabel={power.action[0].toUpperCase() + power.action.slice(1)}
                    danger={power.action !== 'start'} cmd={powerCmd(power)} onClose={() => setPower(undefined)} onDone={dbs.reload}>
                    <p>{POWER_TEXT[power.action]}{power.action === 'stop' && !gcp && ' AWS starts it again after 7 days.'}</p>
                </ActionModal>
            )}
            {deleting && (
                <ActionModal danger title="Delete database" submitLabel="Delete database" confirmWord={deleting.id}
                    cmd={gcp
                        ? cloudSql.delete(deleting.id, { force: force || undefined })
                        : rds.delete(deleting.id, { 'final-snapshot': snapshot, force: force || undefined })}
                    onClose={() => setDeleting(undefined)} onDone={dbs.reload}>
                    {gcp ? <p>This deletes the instance, its data and its automated backups.</p> : (
                        <Field label="Final snapshot name (optional)" hint="Without one, no snapshot is taken and the data is gone.">
                            <input value={snapshot} onChange={(e) => setSnapshot(e.target.value)} placeholder={`${deleting.id}-final`} spellCheck={false} />
                        </Field>
                    )}
                    {deleting.deletionProtection && <Check label="Turn off deletion protection first (--force)" checked={force} onChange={setForce} />}
                </ActionModal>
            )}
        </div>
    );
}
