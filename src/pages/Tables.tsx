import { useMemo, useState } from 'react';
import { ActionModal } from '../components/ActionModal';
import { Button, Check, DataTable, Empty, ErrorBox, Field, PageHeader, Spinner, Status, type Column } from '../components/ui';
import { cell, formatBytes } from '../lib/format';
import { dynamodb, lines, type Item, type Table } from '../lib/clover';
import { useCli } from '../lib/hooks';

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

function ItemEditor({ table, item, keys, onClose, onDone }: {
    table: string; item?: Item; keys: string[]; onClose: () => void; onDone: () => void;
}) {
    const initial = item ?? Object.fromEntries(keys.map((k) => [k, '']));
    const [text, setText] = useState(JSON.stringify(initial, null, 2));

    let compact = text;
    let parseError: string | undefined;
    try {
        const value: unknown = JSON.parse(text);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('An item must be a JSON object.');
        const missing = keys.filter((k) => (value as Item)[k] === undefined || (value as Item)[k] === '');
        if (missing.length) throw new Error(`The key attribute ${missing.join(' and ')} needs a value.`);
        compact = JSON.stringify(value);
    } catch (err) {
        parseError = (err as Error).message;
    }

    return (
        <ActionModal wide title={item ? 'Edit row' : 'Insert row'} submitLabel={item ? 'Save' : 'Insert'}
            cmd={dynamodb.putItem(table, compact)} valid={!parseError} onClose={onClose} onDone={onDone}>
            <Field label="Item (JSON)" hint={item
                ? 'Saving replaces the whole item. Changing a key attribute creates a new item instead.'
                : 'Any attributes you like; only the key attributes are required.'}>
                <textarea className="code-input" rows={14} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoFocus />
            </Field>
            {parseError && text.trim() && <p className="error-text small">{parseError}</p>}
        </ActionModal>
    );
}

function TableView({ name, onDeleted }: { name: string; onDeleted: () => void }) {
    const [limit, setLimit] = useState(100);
    const meta = useCli<Table>(dynamodb.get(name));
    const items = useCli<Item[]>(dynamodb.scan(name, { limit }));
    const [editing, setEditing] = useState<Item | 'new'>();
    const [deleting, setDeleting] = useState<Item>();
    const [deletingTable, setDeletingTable] = useState(false);
    const [force, setForce] = useState(false);

    const pk = keyName(meta.data?.partitionKey);
    const sk = keyName(meta.data?.sortKey);
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
    const reload = () => { items.reload(); meta.reload(); };

    return (
        <div className="pane">
            <div className="pane-head">
                <div>
                    <h2>{name}</h2>
                    {meta.data && (
                        <p className="muted small">
                            <Status value={meta.data.status} /> · {meta.data.billing} · ~{meta.data.items ?? 0} items · {formatBytes(meta.data.sizeBytes)}
                            {meta.data.ttlAttribute && ` · TTL on ${meta.data.ttlAttribute}`}
                        </p>
                    )}
                </div>
                <div className="row">
                    <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} title="Rows to read (scan --limit)">
                        {[25, 100, 500, 1000].map((n) => <option key={n} value={n}>{n} rows</option>)}
                        <option value={0}>All rows</option>
                    </select>
                    <Button icon="refresh" onClick={reload} busy={items.loading}>Refresh</Button>
                    <Button variant="primary" icon="plus" onClick={() => setEditing('new')} disabled={!pk}>Insert row</Button>
                    <Button variant="ghost" icon="trash" title="Delete table" onClick={() => setDeletingTable(true)} />
                </div>
            </div>

            <ErrorBox error={meta.error ?? items.error} />
            {items.data && items.data.length === 0 && <Empty icon="table" title="This table is empty">Insert a row to get started.</Empty>}
            {items.data && items.data.length > 0 && (
                <DataTable columns={columns} rows={items.data} rowKey={(r) => JSON.stringify(keyOf(r))}
                    onRowClick={(r) => setEditing(r)}
                    actions={(r) => <Button variant="ghost" icon="trash" title="Delete row" onClick={() => setDeleting(r)} />} />
            )}
            {!items.data && items.loading && <div className="center"><Spinner /></div>}

            {editing && (
                <ItemEditor table={name} keys={keys} item={editing === 'new' ? undefined : editing}
                    onClose={() => setEditing(undefined)} onDone={reload} />
            )}
            {deleting && (
                <ActionModal danger title="Delete row" submitLabel="Delete row" cmd={dynamodb.deleteItem(name, keyOf(deleting))}
                    onClose={() => setDeleting(undefined)} onDone={reload}>
                    <p>Delete the item with key <code>{JSON.stringify(keyOf(deleting))}</code>?</p>
                </ActionModal>
            )}
            {deletingTable && (
                <ActionModal danger title="Delete table" submitLabel="Delete table" confirmWord={name}
                    cmd={dynamodb.delete(name, { force: force || undefined })}
                    onClose={() => setDeletingTable(false)} onDone={onDeleted}>
                    <p>This deletes <strong>{name}</strong> and every item in it. It can't be undone.</p>
                    {meta.data?.deletionProtection && (
                        <Check label="Turn off deletion protection first (--force)" checked={force} onChange={setForce} />
                    )}
                </ActionModal>
            )}
        </div>
    );
}

export default function Tables() {
    const tables = useCli<string[]>(dynamodb.list());
    const [selected, setSelected] = useState<string>();
    const [creating, setCreating] = useState(false);
    const current = selected ?? tables.data?.[0];

    return (
        <div className="page page-split">
            <aside className="list-pane">
                <PageHeader title="Table Editor" subtitle="DynamoDB" />
                <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New table</Button>
                <ErrorBox error={tables.error} />
                {tables.loading && !tables.data && <Spinner />}
                <ul className="list">
                    {tables.data?.map((t) => (
                        <li key={t}>
                            <button className={t === current ? 'active' : ''} onClick={() => setSelected(t)}>{t}</button>
                        </li>
                    ))}
                </ul>
            </aside>
            {current ? (
                <TableView key={current} name={current} onDeleted={() => { setSelected(undefined); tables.reload(); }} />
            ) : tables.data && (
                <Empty icon="table" title="No tables yet">
                    <p className="muted">A DynamoDB table is a key-value store that scales to zero: no servers, pay per request.</p>
                    <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Create a table</Button>
                </Empty>
            )}
            {creating && <CreateTable onClose={() => setCreating(false)} onDone={(n) => { setSelected(n); tables.reload(); }} />}
        </div>
    );
}
