import { useState } from 'react';
import { ActionModal } from '../components/ActionModal';
import { Button, Check, DataTable, Empty, ErrorBox, Field, KeyValues, Modal, PageHeader, Spinner } from '../components/ui';
import { formatBytes, formatDate } from '../lib/format';
import { REGIONS, gcs, lines, runRaw, s3, type Bucket, type S3Object } from '../lib/clover';
import { useCli } from '../lib/hooks';
import { Archive, Download, File, Folder, Pencil, Plus, RefreshCw, RotateCw, Trash2, UploadIcon } from 'lucide-react';

const LIMIT = 1000;

const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

function CreateBucket({ gcp, onClose, onDone }: { gcp: boolean; onClose: () => void; onDone: (name: string) => void }) {
    const [name, setName] = useState('');
    const [region, setRegion] = useState('');
    const [versioning, setVersioning] = useState(false);
    const [tags, setTags] = useState('');
    const o = { region, versioning: versioning || undefined };
    const cmd = gcp ? gcs.create(name || '<bucket>', { ...o, labels: lines(tags) }) : s3.create(name || '<bucket>', { ...o, tags: lines(tags) });
    return (
        <ActionModal title="New bucket" submitLabel="Create bucket" cmd={cmd} valid={!!name} onClose={onClose} onDone={() => onDone(name)}>
            <Field label="Name" hint={`Globally unique across all of ${gcp ? 'Cloud Storage' : 'AWS'}: lowercase letters, numbers, dots and hyphens`}>
                <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="my-app-assets" autoFocus spellCheck={false} />
            </Field>
            {gcp ? (
                <Field label="Location (optional)" hint="A region like europe-west1, or a multi-region like US or EU">
                    <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="us-central1" spellCheck={false} />
                </Field>
            ) : (
                <Field label="Region">
                    <select value={region} onChange={(e) => setRegion(e.target.value)}>
                        <option value="">Current region</option>
                        {REGIONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                </Field>
            )}
            <Field label={`${gcp ? 'Labels' : 'Tags'} (optional)`} hint="One Key=Value per line">
                <textarea rows={2} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="env=dev" spellCheck={false} />
            </Field>
            <Check label="Versioning" hint="Keep every version of every object" checked={versioning} onChange={setVersioning} />
        </ActionModal>
    );
}

function Upload({ gcp, bucket, prefix, file, onClose, onDone }: { gcp: boolean; bucket: string; prefix: string; file: string; onClose: () => void; onDone: () => void }) {
    const [key, setKey] = useState(prefix + basename(file));
    const [contentType, setContentType] = useState('');
    return (
        <ActionModal title="Upload file" submitLabel="Upload" cmd={(gcp ? gcs : s3).upload(bucket, file, { key, 'content-type': contentType })}
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

function BucketSettings({ gcp, name, onClose }: { gcp: boolean; name: string; onClose: () => void }) {
    const api = gcp ? gcs : s3;
    const bucket = useCli<Bucket>(api.get(name));
    const [toggling, setToggling] = useState(false);
    const enabled = bucket.data?.versioning === 'Enabled' || bucket.data?.versioning === true;
    return (
        <Modal title={`${name} settings`} onClose={onClose}>
            <ErrorBox error={bucket.error} />
            {bucket.loading && !bucket.data && <Spinner />}
            {bucket.data && <KeyValues value={bucket.data} />}
            {bucket.data && (
                <Button icon={RefreshCw} onClick={() => setToggling(true)}>{enabled ? `${gcp ? 'Disable' : 'Suspend'} versioning` : 'Enable versioning'}</Button>
            )}
            {toggling && (
                <ActionModal title={enabled ? `${gcp ? 'Disable' : 'Suspend'} versioning` : 'Enable versioning'} submitLabel="Apply"
                    cmd={api.update(name, { versioning: !enabled })} onClose={() => setToggling(false)} onDone={bucket.reload}>
                    {enabled && !gcp && <p className="muted">S3 can't turn versioning fully off once enabled; it can only be suspended. Existing versions are kept.</p>}
                </ActionModal>
            )}
        </Modal>
    );
}

function BucketView({ gcp, name, onDeleted }: { gcp: boolean; name: string; onDeleted: () => void }) {
    const api = gcp ? gcs : s3;
    const scheme = gcp ? 'gs' : 's3';
    const [prefix, setPrefix] = useState('');
    // `clover gcp storage objects` has no --limit: it lists every object under the prefix.
    const objects = useCli<S3Object[]>(gcp
        ? gcs.objects(name, { prefix: prefix || undefined })
        : s3.objects(name, { prefix: prefix || undefined, limit: LIMIT }));
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
        const file = await window.clover.dialog.openPath({ title: `Upload to ${gcp ? 'Cloud Storage' : 'S3'}` });
        if (file) setUpload(file);
    }

    async function download(key: string) {
        const file = await window.clover.dialog.savePath(basename(key));
        if (!file) return;
        const result = await runRaw(api.download(name, key, file));
        setNotice(result.code === 0 ? `Downloaded to ${file}` : result.stderr.trim());
    }

    return (
        <div className="pane">
            <div className="pane-head">
                <div className="crumbs">
                    <button onClick={() => setPrefix('')}><Archive size={16} /> {name}</button>
                    {crumbs.map((c, i) => (
                        <span key={i}>/<button onClick={() => setPrefix(crumbs.slice(0, i + 1).join('/') + '/')}>{c}</button></span>
                    ))}
                </div>
                <div className="row">
                    <Button icon={RotateCw} onClick={objects.reload} busy={objects.loading}>Refresh</Button>
                    <Button variant="primary" icon={UploadIcon} onClick={() => void pickUpload()}>Upload</Button>
                    <Button variant="ghost" icon={Pencil} title="Bucket settings" onClick={() => setSettings(true)} />
                    <Button variant="ghost" icon={Trash2} title="Delete bucket" onClick={() => setDeletingBucket(true)} />
                </div>
            </div>

            <ErrorBox error={objects.error} />
            {notice && <p className="notice" onClick={() => setNotice(undefined)}>{notice}</p>}
            {objects.data && rows.length === 0 && <Empty icon={Folder} title={prefix ? 'Empty folder' : 'This bucket is empty'}>Upload a file to get started.</Empty>}
            {rows.length > 0 && (
                <DataTable rows={rows} rowKey={(r) => r.key}
                    onRowClick={(r) => { if (r.folder) setPrefix(r.key); }}
                    columns={[
                        { key: 'key', label: 'Name', render: (r) => <span className="row">{r.folder ? <Folder size={16} /> : <File size={16} />} {r.key.slice(prefix.length)}</span> },
                        { key: 'size', label: 'Size', width: '110px', render: (r) => r.folder ? '' : formatBytes(r.size) },
                        { key: 'modified', label: 'Last modified', width: '200px', render: (r) => r.folder ? '' : formatDate(r.modified) },
                    ]}
                    actions={(r) => r.folder ? null : (
                        <span className="row">
                            <Button variant="ghost" icon={Download} title="Download" onClick={() => void download(r.key)} />
                            <Button variant="ghost" icon={Trash2} title="Delete" onClick={() => setDeleting(r.key)} />
                        </span>
                    )} />
            )}
            {!gcp && objects.data?.length === LIMIT && <p className="muted small">Showing the first {LIMIT} objects under this prefix.</p>}

            {upload && <Upload gcp={gcp} bucket={name} prefix={prefix} file={upload} onClose={() => setUpload(undefined)} onDone={objects.reload} />}
            {settings && <BucketSettings gcp={gcp} name={name} onClose={() => setSettings(false)} />}
            {deleting && (
                <ActionModal danger title="Delete object" submitLabel="Delete" cmd={api.deleteObject(name, deleting)}
                    onClose={() => setDeleting(undefined)} onDone={objects.reload}>
                    <p>Delete <code>{scheme}://{name}/{deleting}</code>?</p>
                </ActionModal>
            )}
            {deletingBucket && (
                <ActionModal danger title="Delete bucket" submitLabel="Delete bucket" confirmWord={name}
                    cmd={api.delete(name, { force: force || undefined })} onClose={() => setDeletingBucket(false)} onDone={onDeleted}>
                    <p>{gcp ? 'Cloud Storage' : 'S3'} only deletes empty buckets.</p>
                    <Check label="Delete every object and version first (--force)" checked={force} onChange={setForce} />
                </ActionModal>
            )}
        </div>
    );
}

export default function Storage({ gcp }: { gcp: boolean }) {
    const buckets = useCli<Bucket[]>((gcp ? gcs : s3).list());
    const [selected, setSelected] = useState<string>();
    const [creating, setCreating] = useState(false);
    const current = selected ?? buckets.data?.[0]?.name;

    return (
        <div className="page page-split">
            <aside className="list-pane">
                <PageHeader title="Storage" subtitle={gcp ? 'Cloud Storage buckets (all locations)' : 'S3 buckets (all regions)'} />
                <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New bucket</Button>
                <ErrorBox error={buckets.error} />
                {buckets.loading && !buckets.data && <Spinner />}
                <ul className="list">
                    {buckets.data?.map((b) => (
                        <li key={b.name}>
                            <button className={b.name === current ? 'active' : ''} onClick={() => setSelected(b.name)}>
                                {b.name}
                                {(b.region ?? b.location) && <small>{b.region ?? b.location}</small>}
                            </button>
                        </li>
                    ))}
                </ul>
            </aside>
            {current ? (
                <BucketView key={current} gcp={gcp} name={current} onDeleted={() => { setSelected(undefined); buckets.reload(); }} />
            ) : buckets.data && (
                <Empty icon={Archive} title="No buckets yet">
                    <p className="muted">Buckets hold files: uploads, images, static sites, backups.</p>
                    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Create a bucket</Button>
                </Empty>
            )}
            {creating && <CreateBucket gcp={gcp} onClose={() => setCreating(false)} onDone={(n) => { setSelected(n); buckets.reload(); }} />}
        </div>
    );
}
