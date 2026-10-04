import { useMemo, useState } from 'react';
import { ActionModal } from '../components/ActionModal';
import { Button, Check, DataTable, Empty, ErrorBox, Field, PageHeader, Spinner, Status, type Column } from '../components/ui';
import { cell, formatBytes } from '../lib/format';
import { dynamodb, firestore, lines, type Cmd, type FirestoreDatabase, type Item, type Table } from '../lib/clover';
import { useCli } from '../lib/hooks';
import { Plus, RotateCw, TableIcon, Trash2 } from 'lucide-react';

/** "userId:S" -> "userId" */
const keyName = (spec?: string) => spec?.split(':')[0];

function CreateTable({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
    const [name, setName] = useState('');
    const [pk, setPk] = useState('id');
    const [pkType, setPkType] = useState('S');
    const [sk, setSk] = useState('');
    const [skType, setSkType] = useState('S');
    const [ttl, setTtl] = useState('');
    const [protect, setProtect] = useState(false);
    const [tags, setTags] = useState('');

    const cmd = dynamodb.create(name || '<table>', {
        'partition-key': pkType === 'S' ? pk : `${pk}:${pkType}`,
        'sort-key': sk ? (skType === 'S' ? sk : `${sk}:${skType}`) : undefined,
        'ttl-attribute': ttl,
        'deletion-protection': protect || undefined,
        tags: lines(tags),
        wait: true,
    });

    const typeSelect = (value: string, set: (v: string) => void) => (
        <select value={value} onChange={(e) => set(e.target.value)} className="type-select">
            <option value="S">String</option>
            <option value="N">Number</option>
            <option value="B">Binary</option>
        </select>
    );

    return (
        <ActionModal title="New table" submitLabel="Create table" cmd={cmd} valid={!!name && !!pk}
            onClose={onClose} onDone={() => onDone(name)}>
            <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="users" autoFocus spellCheck={false} />
            </Field>
            <div className="field-row">
                <Field label="Partition key" hint="Every item needs one; together with the sort key it identifies the item">
                    <div className="row">
                        <input value={pk} onChange={(e) => setPk(e.target.value)} spellCheck={false} />
                        {typeSelect(pkType, setPkType)}
                    </div>
                </Field>
            </div>
            <Field label="Sort key (optional)" hint="Lets many items share a partition key, ordered by this">
                <div className="row">
                    <input value={sk} onChange={(e) => setSk(e.target.value)} placeholder="createdAt" spellCheck={false} />
                    {typeSelect(skType, setSkType)}
                </div>
            </Field>
            <Field label="TTL attribute (optional)" hint="Items expire at the epoch-seconds time stored in this attribute">
                <input value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder="expiresAt" spellCheck={false} />
            </Field>
            <Field label="Tags (optional)" hint="One Key=Value per line">
                <textarea rows={2} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="env=dev" spellCheck={false} />
            </Field>
            <Check label="Deletion protection" checked={protect} onChange={setProtect} />
            <p className="muted small">Billing is on-demand: you pay per request, nothing while idle.</p>
        </ActionModal>
    );
}

/** `put` builds the write command for an item (DynamoDB put-item, or Firestore put-item by id). */
function ItemEditor({ put, item, keys, onClose, onDone }: {
    put: (item: Item) => Cmd; item?: Item; keys: string[]; onClose: () => void; onDone: () => void;
}) {
    const initial = item ?? Object.fromEntries(keys.map((k) => [k, '']));
    const [text, setText] = useState(JSON.stringify(initial, null, 2));

    let value: Item = initial;
    let parseError: string | undefined;
    try {
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('An item must be a JSON object.');
        const missing = keys.filter((k) => (parsed as Item)[k] === undefined || (parsed as Item)[k] === '');
        if (missing.length) throw new Error(`The key attribute ${missing.join(' and ')} needs a value.`);
        value = parsed as Item;
    } catch (err) {
        parseError = (err as Error).message;
    }

    return (
        <ActionModal wide title={item ? 'Edit row' : 'Insert row'} submitLabel={item ? 'Save' : 'Insert'}
            cmd={put(value)} valid={!parseError} onClose={onClose} onDone={onDone}>
            <Field label="Item (JSON)" hint={item
                ? 'Saving replaces the whole item. Changing a key attribute creates a new item instead.'
                : 'Any attributes you like; only the key attributes are required.'}>
                <textarea className="code-input" rows={14} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoFocus />
            </Field>
            {parseError && text.trim() && <p className="error-text small">{parseError}</p>}
        </ActionModal>
    );
}

function CreateFirestoreDatabase({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
    const [name, setName] = useState('default');
    const [region, setRegion] = useState('');
    const [protect, setProtect] = useState(false);
    const cmd = firestore.create(name || '<database>', { region, 'deletion-protection': protect || undefined, wait: true });
    return (
        <ActionModal title="New database" submitLabel="Create database" cmd={cmd} valid={!!name} onClose={onClose} onDone={() => onDone(name)}>
            <Field label="Name" hint="default is the project's (default) database">
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus spellCheck={false} />
            </Field>
            <Field label="Location (optional)" hint="A region like us-central1, or a multi-region like nam5 or eur3. Can't be changed later">
                <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="us-central1" spellCheck={false} />
            </Field>
            <Check label="Deletion protection" checked={protect} onChange={setProtect} />
        </ActionModal>
    );
}

function TableView({ gcp, name, onDeleted }: { gcp: boolean; name: string; onDeleted: () => void }) {
    const [limit, setLimit] = useState(100);
    // Firestore documents live in collections: read one at a time, by path (e.g. users or users/1/posts).
    const [collection, setCollection] = useState('');
    const meta = useCli<Table & FirestoreDatabase>(gcp ? firestore.get(name) : dynamodb.get(name));
    const items = useCli<Item[]>(gcp ? (collection ? firestore.scan(name, { collection, limit }) : null) : dynamodb.scan(name, { limit }));
    const [editing, setEditing] = useState<Item | 'new'>();
    const [deleting, setDeleting] = useState<Item>();
    const [deletingTable, setDeletingTable] = useState(false);
    const [force, setForce] = useState(false);

    const pk = gcp ? 'id' : keyName(meta.data?.partitionKey);
    const sk = gcp ? undefined : keyName(meta.data?.sortKey);
    const keys = [pk, sk].filter((k): k is string => !!k);

    const columns = useMemo<Column<Item>[]>(() => {
        const keyColumns = [pk, sk].filter((k): k is string => !!k);
        const others = new Set<string>();
        for (const item of items.data ?? []) for (const k of Object.keys(item)) if (!keyColumns.includes(k)) others.add(k);
        return [...keyColumns, ...[...others].sort()].map((k) => ({
            key: k,
            label: k === pk ? `${k} · PK` : k === sk ? `${k} · SK` : k,
            render: (row: Item) => cell(row[k]),
        }));
    }, [items.data, pk, sk]);

    const keyOf = (item: Item) => Object.fromEntries(keys.map((k) => [k, item[k]]));
    // Firestore stores the id as the document name, not a field.
    const put = (item: Item): Cmd => {
        if (!gcp) return dynamodb.putItem(name, JSON.stringify(item));
        const { id, ...fields } = item;
        return firestore.putItem(name, collection, String(id), JSON.stringify(fields));
    };
    const reload = () => { items.reload(); meta.reload(); };

    return (
        <div className="pane">
            <div className="pane-head">
                <div>
                    <h2>{name}</h2>
                    {meta.data && gcp && <p className="muted small">{meta.data.location} · {meta.data.type}</p>}
                    {meta.data && !gcp && (
                        <p className="muted small">
                            <Status value={meta.data.status} /> · {meta.data.billing} · ~{meta.data.items ?? 0} items · {formatBytes(meta.data.sizeBytes)}
                            {meta.data.ttlAttribute && ` · TTL on ${meta.data.ttlAttribute}`}
                        </p>
                    )}
                </div>
                <div className="row">
                    {gcp && (
                        <form onSubmit={(e) => { e.preventDefault(); setCollection(new FormData(e.currentTarget).get('collection') as string); }}>
                            <input name="collection" defaultValue={collection} placeholder="Collection, e.g. users" title="Press Enter to read it" spellCheck={false} />
                        </form>
                    )}
                    <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} title="Rows to read (scan --limit)">
                        {[25, 100, 500, 1000].map((n) => <option key={n} value={n}>{n} rows</option>)}
                        <option value={0}>All rows</option>
                    </select>
                    <Button icon={RotateCw} onClick={reload} busy={items.loading}>Refresh</Button>
                    <Button variant="primary" icon={Plus} onClick={() => setEditing('new')} disabled={!pk || (gcp && !collection)}>Insert row</Button>
                    <Button variant="ghost" icon={Trash2} title={gcp ? 'Delete database' : 'Delete table'} onClick={() => setDeletingTable(true)} />
                </div>
            </div>

            <ErrorBox error={meta.error ?? items.error} />
            {gcp && !collection && <Empty icon={TableIcon} title="Pick a collection">Type a collection path above and press Enter.</Empty>}
            {items.data && items.data.length === 0 && <Empty icon={TableIcon} title={gcp ? 'This collection is empty' : 'This table is empty'}>Insert a row to get started.</Empty>}
            {items.data && items.data.length > 0 && (
                <DataTable columns={columns} rows={items.data} rowKey={(r) => JSON.stringify(keyOf(r))}
                    onRowClick={(r) => setEditing(r)}
                    actions={(r) => <Button variant="ghost" icon={Trash2} title="Delete row" onClick={() => setDeleting(r)} />} />
            )}
            {!items.data && items.loading && <div className="center"><Spinner /></div>}

            {editing && (
                <ItemEditor put={put} keys={keys} item={editing === 'new' ? undefined : editing}
                    onClose={() => setEditing(undefined)} onDone={reload} />
            )}
            {deleting && (
                <ActionModal danger title="Delete row" submitLabel="Delete row" cmd={gcp ? firestore.deleteItem(name, collection, String(deleting.id)) : dynamodb.deleteItem(name, keyOf(deleting))}
                    onClose={() => setDeleting(undefined)} onDone={reload}>
                    <p>Delete the item with key <code>{JSON.stringify(keyOf(deleting))}</code>?</p>
                </ActionModal>
            )}
            {deletingTable && (
                <ActionModal danger title={gcp ? 'Delete database' : 'Delete table'} submitLabel={gcp ? 'Delete database' : 'Delete table'} confirmWord={name}
                    cmd={(gcp ? firestore : dynamodb).delete(name, { force: force || undefined })}
                    onClose={() => setDeletingTable(false)} onDone={onDeleted}>
                    <p>This deletes <strong>{name}</strong> and every {gcp ? 'document' : 'item'} in it. It can't be undone.</p>
                    {meta.data?.deletionProtection && (
                        <Check label="Turn off deletion protection first (--force)" checked={force} onChange={setForce} />
                    )}
                </ActionModal>
            )}
        </div>
    );
}

export default function Tables({ gcp }: { gcp: boolean }) {
    const tables = useCli<(string | FirestoreDatabase)[]>(gcp ? firestore.list() : dynamodb.list());
    const names = tables.data?.map((t) => typeof t === 'string' ? t : t.name);
    const [selected, setSelected] = useState<string>();
    const [creating, setCreating] = useState(false);
    const current = selected ?? names?.[0];

    return (
        <div className="page page-split">
            <aside className="list-pane">
                <PageHeader title="Table Editor" subtitle={gcp ? 'Firestore databases' : 'DynamoDB'} />
                <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>{gcp ? 'New database' : 'New table'}</Button>
                <ErrorBox error={tables.error} />
                {tables.loading && !tables.data && <Spinner />}
                <ul className="list">
                    {names?.map((t) => (
                        <li key={t}>
                            <button className={t === current ? 'active' : ''} onClick={() => setSelected(t)}>{t}</button>
                        </li>
                    ))}
                </ul>
            </aside>
            {current ? (
                <TableView key={current} gcp={gcp} name={current} onDeleted={() => { setSelected(undefined); tables.reload(); }} />
            ) : tables.data && (
                <Empty icon={TableIcon} title={gcp ? 'No databases yet' : 'No tables yet'}>
                    <p className="muted">{gcp
                        ? 'A Firestore database stores JSON documents in collections: no servers, pay per request.'
                        : 'A DynamoDB table is a key-value store that scales to zero: no servers, pay per request.'}</p>
                    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>{gcp ? 'Create a database' : 'Create a table'}</Button>
                </Empty>
            )}
            {creating && (gcp
                ? <CreateFirestoreDatabase onClose={() => setCreating(false)} onDone={(n) => { setSelected(n); tables.reload(); }} />
                : <CreateTable onClose={() => setCreating(false)} onDone={(n) => { setSelected(n); tables.reload(); }} />)}
        </div>
    );
}
