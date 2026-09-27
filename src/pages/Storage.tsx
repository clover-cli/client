import { useState } from 'react';
import { ActionModal } from '../components/ActionModal';
import { Icon } from '../components/Icon';
import { Button, Check, DataTable, Empty, ErrorBox, Field, KeyValues, Modal, PageHeader, Spinner } from '../components/ui';
import { formatBytes, formatDate } from '../lib/format';
import { REGIONS, lines, runRaw, s3, type Bucket, type S3Object } from '../lib/clover';
import { useCli } from '../lib/hooks';

const LIMIT = 1000;

const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

function CreateBucket({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
    const [name, setName] = useState('');
    const [region, setRegion] = useState('');
    const [versioning, setVersioning] = useState(false);
    const [tags, setTags] = useState('');
    const cmd = s3.create(name || '<bucket>', { region, versioning: versioning || undefined, tags: lines(tags) });
    return (
        <ActionModal title="New bucket" submitLabel="Create bucket" cmd={cmd} valid={!!name} onClose={onClose} onDone={() => onDone(name)}>
            <Field label="Name" hint="Globally unique across all of AWS: lowercase letters, numbers, dots and hyphens">
                <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="my-app-assets" autoFocus spellCheck={false} />
            </Field>
            <Field label="Region">
                <select value={region} onChange={(e) => setRegion(e.target.value)}>
                    <option value="">Current region</option>
                    {REGIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
            </Field>
            <Field label="Tags (optional)" hint="One Key=Value per line">
                <textarea rows={2} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="env=dev" spellCheck={false} />
            </Field>
            <Check label="Versioning" hint="Keep every version of every object" checked={versioning} onChange={setVersioning} />
        </ActionModal>
    );
}

function Upload({ bucket, prefix, file, onClose, onDone }: { bucket: string; prefix: string; file: string; onClose: () => void; onDone: () => void }) {
    const [key, setKey] = useState(prefix + basename(file));
    const [contentType, setContentType] = useState('');
    return (
        <ActionModal title="Upload file" submitLabel="Upload" cmd={s3.upload(bucket, file, { key, 'content-type': contentType })}
            valid={!!key} onClose={onClose} onDone={onDone}>
            <Field label="File"><input value={file} readOnly /></Field>
            <Field label="Key" hint="The object's path in the bucket">
                <input value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false} />
            </Field>
            <Field label="Content type (optional)" hint="e.g. text/html, image/png. Matters when serving files to browsers">
                <input value={contentType} onChange={(e) => setContentType(e.target.value)} spellCheck={false} />
            </Field>
        </ActionModal>
    );
}

function BucketSettings({ name, onClose }: { name: string; onClose: () => void }) {
    const bucket = useCli<Bucket>(s3.get(name));
    const [toggling, setToggling] = useState(false);
    const enabled = bucket.data?.versioning === 'Enabled';
    return (
        <Modal title={`${name} settings`} onClose={onClose}>
            <ErrorBox error={bucket.error} />
            {bucket.loading && !bucket.data && <Spinner />}
            {bucket.data && <KeyValues value={bucket.data} />}
            {bucket.data && (
                <Button icon="rotate" onClick={() => setToggling(true)}>{enabled ? 'Suspend versioning' : 'Enable versioning'}</Button>
            )}
            {toggling && (
                <ActionModal title={enabled ? 'Suspend versioning' : 'Enable versioning'} submitLabel="Apply"
                    cmd={s3.update(name, { versioning: !enabled })} onClose={() => setToggling(false)} onDone={bucket.reload}>
                    {enabled && <p className="muted">S3 can't turn versioning fully off once enabled; it can only be suspended. Existing versions are kept.</p>}
                </ActionModal>
            )}
        </Modal>
    );
}

function BucketView({ name, onDeleted }: { name: string; onDeleted: () => void }) {
    const [prefix, setPrefix] = useState('');
    const objects = useCli<S3Object[]>(s3.objects(name, { prefix: prefix || undefined, limit: LIMIT }));
    const [upload, setUpload] = useState<string>();
    const [deleting, setDeleting] = useState<string>();
    const [deletingBucket, setDeletingBucket] = useState(false);
    const [force, setForce] = useState(false);
    const [settings, setSettings] = useState(false);
    const [notice, setNotice] = useState<string>();

    // The CLI lists keys under the prefix; show the next "/" level as folders, like the S3 console.
    const folders = new Set<string>();
    const files: S3Object[] = [];
    for (const obj of objects.data ?? []) {
        const rest = obj.key.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash >= 0) folders.add(rest.slice(0, slash + 1));
        else if (rest) files.push(obj);
    }
    const rows: (S3Object & { folder?: boolean })[] = [
        ...[...folders].sort().map((f) => ({ key: prefix + f, folder: true })),
        ...files,
    ];
    const crumbs = prefix.split('/').filter(Boolean);

    async function pickUpload() {
        const file = await window.clover.dialog.openPath({ title: 'Upload to S3' });
        if (file) setUpload(file);
    }

    async function download(key: string) {
        const file = await window.clover.dialog.savePath(basename(key));
        if (!file) return;
        const result = await runRaw(s3.download(name, key, file));
        setNotice(result.code === 0 ? `Downloaded to ${file}` : result.stderr.trim());
    }

    return (
        <div className="pane">
            <div className="pane-head">
                <div className="crumbs">
                    <button onClick={() => setPrefix('')}><Icon name="bucket" /> {name}</button>
                    {crumbs.map((c, i) => (
                        <span key={i}>/<button onClick={() => setPrefix(crumbs.slice(0, i + 1).join('/') + '/')}>{c}</button></span>
                    ))}
                </div>
                <div className="row">
                    <Button icon="refresh" onClick={objects.reload} busy={objects.loading}>Refresh</Button>
                    <Button variant="primary" icon="upload" onClick={() => void pickUpload()}>Upload</Button>
                    <Button variant="ghost" icon="edit" title="Bucket settings" onClick={() => setSettings(true)} />
                    <Button variant="ghost" icon="trash" title="Delete bucket" onClick={() => setDeletingBucket(true)} />
                </div>
            </div>

            <ErrorBox error={objects.error} />
            {notice && <p className="notice" onClick={() => setNotice(undefined)}>{notice}</p>}
            {objects.data && rows.length === 0 && <Empty icon="folder" title={prefix ? 'Empty folder' : 'This bucket is empty'}>Upload a file to get started.</Empty>}
            {rows.length > 0 && (
                <DataTable rows={rows} rowKey={(r) => r.key}
                    onRowClick={(r) => { if (r.folder) setPrefix(r.key); }}
                    columns={[
                        { key: 'key', label: 'Name', render: (r) => <span className="row"><Icon name={r.folder ? 'folder' : 'file'} /> {r.key.slice(prefix.length)}</span> },
                        { key: 'size', label: 'Size', width: '110px', render: (r) => r.folder ? '' : formatBytes(r.size) },
                        { key: 'modified', label: 'Last modified', width: '200px', render: (r) => r.folder ? '' : formatDate(r.modified) },
                    ]}
                    actions={(r) => r.folder ? null : (
                        <span className="row">
                            <Button variant="ghost" icon="download" title="Download" onClick={() => void download(r.key)} />
                            <Button variant="ghost" icon="trash" title="Delete" onClick={() => setDeleting(r.key)} />
                        </span>
                    )} />
            )}
            {objects.data?.length === LIMIT && <p className="muted small">Showing the first {LIMIT} objects under this prefix.</p>}

            {upload && <Upload bucket={name} prefix={prefix} file={upload} onClose={() => setUpload(undefined)} onDone={objects.reload} />}
            {settings && <BucketSettings name={name} onClose={() => setSettings(false)} />}
            {deleting && (
                <ActionModal danger title="Delete object" submitLabel="Delete" cmd={s3.deleteObject(name, deleting)}
                    onClose={() => setDeleting(undefined)} onDone={objects.reload}>
                    <p>Delete <code>s3://{name}/{deleting}</code>?</p>
                </ActionModal>
            )}
            {deletingBucket && (
                <ActionModal danger title="Delete bucket" submitLabel="Delete bucket" confirmWord={name}
                    cmd={s3.delete(name, { force: force || undefined })} onClose={() => setDeletingBucket(false)} onDone={onDeleted}>
                    <p>S3 only deletes empty buckets.</p>
                    <Check label="Delete every object and version first (--force)" checked={force} onChange={setForce} />
                </ActionModal>
            )}
        </div>
    );
}

export default function Storage() {
    const buckets = useCli<Bucket[]>(s3.list());
    const [selected, setSelected] = useState<string>();
    const [creating, setCreating] = useState(false);
    const current = selected ?? buckets.data?.[0]?.name;

    return (
        <div className="page page-split">
            <aside className="list-pane">
                <PageHeader title="Storage" subtitle="S3 buckets (all regions)" />
                <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New bucket</Button>
                <ErrorBox error={buckets.error} />
                {buckets.loading && !buckets.data && <Spinner />}
                <ul className="list">
                    {buckets.data?.map((b) => (
                        <li key={b.name}>
                            <button className={b.name === current ? 'active' : ''} onClick={() => setSelected(b.name)}>
                                {b.name}
                                {b.region && <small>{b.region}</small>}
                            </button>
                        </li>
                    ))}
                </ul>
            </aside>
            {current ? (
                <BucketView key={current} name={current} onDeleted={() => { setSelected(undefined); buckets.reload(); }} />
            ) : buckets.data && (
                <Empty icon="bucket" title="No buckets yet">
                    <p className="muted">Buckets hold files: uploads, images, static sites, backups.</p>
                    <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Create a bucket</Button>
                </Empty>
            )}
            {creating && <CreateBucket onClose={() => setCreating(false)} onDone={(n) => { setSelected(n); buckets.reload(); }} />}
        </div>
    );
}
