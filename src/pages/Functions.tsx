import { useState } from 'react';
import { ActionModal } from '../components/ActionModal';
import { Button, Check, CommandPreview, DataTable, Empty, ErrorBox, Field, KeyValues, PageHeader, Spinner, Status } from '../components/ui';
import { formatDate } from '../lib/format';
import { lambda, lines, runRaw, type InvokeResult, type LambdaFunction } from '../lib/clover';
import { useCli } from '../lib/hooks';

const RUNTIMES = ['nodejs22.x', 'nodejs20.x', 'python3.13', 'python3.12', 'java21', 'dotnet8', 'ruby3.3', 'provided.al2023'];

/** Lambda code: a .zip, or a file or folder the CLI zips for you. */
function CodePicker({ value, onChange }: { value: string; onChange: (path: string) => void }) {
    const pick = async (directory: boolean) => {
        const path = await window.clover.dialog.openPath({ directory, title: directory ? 'Code folder' : 'Code file or .zip' });
        if (path) onChange(path);
    };
    return (
        <Field label="Code" hint="A .zip, a single file, or a folder (zipped for you)">
            <div className="row">
                <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="/path/to/index.mjs" spellCheck={false} />
                <Button onClick={() => void pick(false)}>File…</Button>
                <Button onClick={() => void pick(true)}>Folder…</Button>
            </div>
        </Field>
    );
}

function CreateFunction({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [role, setRole] = useState('');
    const [runtime, setRuntime] = useState('nodejs22.x');
    const [handler, setHandler] = useState('index.handler');
    const [memory, setMemory] = useState('');
    const [timeout, setTimeout] = useState('');
    const [env, setEnv] = useState('');

    const cmd = lambda.create(name || '<name>', {
        code: code || '<code>', role: role || '<role-arn>', runtime, handler,
        memory: memory ? Number(memory) : undefined, timeout: timeout ? Number(timeout) : undefined,
        env: lines(env), wait: true,
    });
    return (
        <ActionModal wide title="New function" submitLabel="Create function" cmd={cmd} valid={!!name && !!code && !!role}
            onClose={onClose} onDone={() => onDone(name)}>
            <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="hello" autoFocus spellCheck={false} /></Field>
            <CodePicker value={code} onChange={setCode} />
            <Field label="Execution role ARN" hint="The IAM role the function runs as, e.g. one with AWSLambdaBasicExecutionRole. Create it in IAM first.">
                <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="arn:aws:iam::123456789012:role/lambda-basic" spellCheck={false} />
            </Field>
            <div className="field-row">
                <Field label="Runtime">
                    <select value={runtime} onChange={(e) => setRuntime(e.target.value)}>{RUNTIMES.map((r) => <option key={r}>{r}</option>)}</select>
                </Field>
                <Field label="Handler" hint="file.function"><input value={handler} onChange={(e) => setHandler(e.target.value)} spellCheck={false} /></Field>
            </div>
            <div className="field-row">
                <Field label="Memory (MB)"><input type="number" value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="128" /></Field>
                <Field label="Timeout (s)"><input type="number" value={timeout} onChange={(e) => setTimeout(e.target.value)} placeholder="3" /></Field>
            </div>
            <Field label="Environment variables (optional)" hint="One KEY=VALUE per line">
                <textarea rows={3} value={env} onChange={(e) => setEnv(e.target.value)} placeholder="STAGE=dev" spellCheck={false} />
            </Field>
        </ActionModal>
    );
}

function Deploy({ fn, onClose, onDone }: { fn: LambdaFunction; onClose: () => void; onDone: () => void }) {
    const [code, setCode] = useState('');
    const [env, setEnv] = useState('');
    const [removeEnv, setRemoveEnv] = useState('');
    const cmd = lambda.update(fn.name, { code, env: lines(env), 'remove-env': lines(removeEnv), wait: true });
    return (
        <ActionModal wide title={`Update ${fn.name}`} submitLabel="Update" cmd={cmd}
            valid={!!code || !!env.trim() || !!removeEnv.trim()} onClose={onClose} onDone={onDone}>
            <CodePicker value={code} onChange={setCode} />
            <Field label="Set environment variables" hint="One KEY=VALUE per line; the other variables are kept">
                <textarea rows={3} value={env} onChange={(e) => setEnv(e.target.value)} spellCheck={false} />
            </Field>
            <Field label="Remove environment variables" hint="One name per line">
                <textarea rows={2} value={removeEnv} onChange={(e) => setRemoveEnv(e.target.value)} spellCheck={false} />
            </Field>
        </ActionModal>
    );
}

function Invoke({ name }: { name: string }) {
    const [payload, setPayload] = useState('{}');
    const [logs, setLogs] = useState(true);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<InvokeResult>();
    const [error, setError] = useState<string>();

    let valid = true;
    try { JSON.parse(payload); } catch { valid = false; }
    const cmd = lambda.invoke(name, { payload: payload.trim() || undefined, logs: logs || undefined });

    async function invoke() {
        setBusy(true);
        setError(undefined);
        setResult(undefined);
        const r = await runRaw(cmd);
        // A function that throws exits 1 but still prints its result.
        if (r.json) setResult(r.json as InvokeResult);
        if (r.code !== 0) setError(r.stderr.trim());
        setBusy(false);
    }

    return (
        <div className="card">
            <h3>Invoke</h3>
            <Field label="Event (JSON)">
                <textarea className="code-input" rows={6} value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} />
            </Field>
            <div className="row spread">
                <Check label="Include logs" checked={logs} onChange={setLogs} />
                <Button variant="primary" icon="play" busy={busy} disabled={!valid} onClick={() => void invoke()}>Invoke</Button>
            </div>
            <CommandPreview cmd={cmd} />
            <ErrorBox error={error} />
            {result && (
                <>
                    <p className="muted small">Status {result.statusCode}{result.error && ` · ${result.error}`}</p>
                    <pre className="output">{JSON.stringify(result.payload, null, 2)}</pre>
                    {result.logs && <pre className="stderr">{result.logs}</pre>}
                </>
            )}
        </div>
    );
}

function FunctionView({ name, onDeleted }: { name: string; onDeleted: () => void }) {
    const fn = useCli<LambdaFunction>(lambda.get(name));
    const [deploying, setDeploying] = useState(false);
    const [deleting, setDeleting] = useState(false);
    return (
        <div className="pane">
            <div className="pane-head">
                <div>
                    <h2>{name}</h2>
                    {fn.data && <p className="muted small"><Status value={fn.data.state} /> · {fn.data.runtime} · {fn.data.memoryMb} MB · {fn.data.timeoutSec}s</p>}
                </div>
                <div className="row">
                    <Button icon="refresh" onClick={fn.reload} busy={fn.loading}>Refresh</Button>
                    <Button variant="primary" icon="upload" onClick={() => setDeploying(true)} disabled={!fn.data}>Update</Button>
                    <Button variant="ghost" icon="trash" title="Delete function" onClick={() => setDeleting(true)} />
                </div>
            </div>
            <ErrorBox error={fn.error} />
            <div className="grid-2">
                <Invoke name={name} />
                <div className="card">
                    <h3>Configuration</h3>
                    {fn.data ? <KeyValues value={{ ...fn.data, environment: undefined, modified: formatDate(fn.data.modified) }} /> : <Spinner />}
                    {fn.data?.environment && (
                        <>
                            <h3>Environment</h3>
                            <KeyValues value={fn.data.environment} />
                        </>
                    )}
                </div>
            </div>
            {deploying && fn.data && <Deploy fn={fn.data} onClose={() => setDeploying(false)} onDone={fn.reload} />}
            {deleting && (
                <ActionModal danger title="Delete function" submitLabel="Delete function" confirmWord={name}
                    cmd={lambda.delete(name)} onClose={() => setDeleting(false)} onDone={onDeleted}>
                    <p>This deletes <strong>{name}</strong> and its code.</p>
                </ActionModal>
            )}
        </div>
    );
}

export default function Functions() {
    const fns = useCli<LambdaFunction[]>(lambda.list());
    const [selected, setSelected] = useState<string>();
    const [creating, setCreating] = useState(false);

    if (selected) {
        return (
            <div className="page">
                <button className="link back" onClick={() => { setSelected(undefined); fns.reload(); }}>← All functions</button>
                <FunctionView key={selected} name={selected} onDeleted={() => { setSelected(undefined); fns.reload(); }} />
            </div>
        );
    }

    return (
        <div className="page">
            <PageHeader title="Functions" subtitle="Lambda: code that runs on demand, billed per request"
                actions={<>
                    <Button icon="refresh" onClick={fns.reload} busy={fns.loading}>Refresh</Button>
                    <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New function</Button>
                </>} />
            <ErrorBox error={fns.error} />
            {fns.loading && !fns.data && <Spinner />}
            {fns.data?.length === 0 && <Empty icon="function" title="No functions yet">Deploy a file or folder as a function in one step.</Empty>}
            {!!fns.data?.length && (
                <DataTable rows={fns.data} rowKey={(f) => f.name} onRowClick={(f) => setSelected(f.name)} columns={[
                    { key: 'name', label: 'Name' },
                    { key: 'runtime', label: 'Runtime' },
                    { key: 'state', label: 'State', render: (f) => <Status value={f.state} /> },
                    { key: 'memoryMb', label: 'Memory', render: (f) => `${f.memoryMb} MB` },
                    { key: 'timeoutSec', label: 'Timeout', render: (f) => `${f.timeoutSec}s` },
                    { key: 'modified', label: 'Modified', render: (f) => formatDate(f.modified) },
                ]} />
            )}
            {creating && <CreateFunction onClose={() => setCreating(false)} onDone={(n) => { setSelected(n); fns.reload(); }} />}
        </div>
    );
}
