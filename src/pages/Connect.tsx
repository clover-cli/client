import { useState, type FormEvent } from 'react';
import type { CliInfo, Provider, Session } from '../../shared/types';
import { Button, ErrorBox, Field } from '../components/ui';
import { REGIONS } from '../lib/clover';
import { Check, Leaf } from 'lucide-react';

/**
 * Connect with an AWS access key or a GCP project. This is `eval "$(clover aws login)"` (or
 * `clover gcp login`) for the app: the credentials are checked with `clover <provider> whoami` and kept
 * in memory only, never written to disk.
 */
export default function Connect({ cli, onConnected }: { cli?: CliInfo; onConnected: (s: Session) => void }) {
    const [provider, setProvider] = useState<Provider>('aws');
    const [project, setProject] = useState('');
    const [keyFile, setKeyFile] = useState('');
    const [accessKeyId, setAccessKeyId] = useState('');
    const [secretAccessKey, setSecretAccessKey] = useState('');
    const [sessionToken, setSessionToken] = useState('');
    const [region, setRegion] = useState('us-east-1');
    const [showToken, setShowToken] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        try {
            onConnected(await window.clover.session.connect(provider === 'gcp'
                ? { provider, project, keyFile }
                : { provider, accessKeyId, secretAccessKey, sessionToken, region }));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="connect">
            <div className="connect-card">
                <div className="brand brand-large">
                    <span className="brand-mark"><Leaf size={22} /></span>
                    <span>Clover</span>
                </div>
                <p className="muted">
                    Your AWS account or GCP project, your resources, no middleman. Everything here runs the <code>clover</code> CLI
                    on your machine with your own credentials.
                </p>

                <div className="row">
                    <Button variant={provider === 'aws' ? 'primary' : 'default'} onClick={() => setProvider('aws')}>AWS</Button>
                    <Button variant={provider === 'gcp' ? 'primary' : 'default'} onClick={() => setProvider('gcp')}>GCP</Button>
                </div>

                {provider === 'gcp' ? (
                    <form className="form" onSubmit={(e) => void submit(e)}>
                        <Field label="Project ID">
                            <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="my-project-123" autoFocus spellCheck={false} />
                        </Field>
                        <Field label="Service account key file (optional)" hint="Without one, the credentials from gcloud auth application-default login are used">
                            <div className="row">
                                <input value={keyFile} onChange={(e) => setKeyFile(e.target.value)} placeholder="Application default credentials" spellCheck={false} />
                                <Button onClick={() => void window.clover.dialog.openPath({ title: 'Service account key file' }).then((f) => { if (f) setKeyFile(f); })}>Browse</Button>
                            </div>
                        </Field>
                        <ErrorBox error={error} />
                        <Button type="submit" variant="primary" busy={busy} disabled={!project}>Connect</Button>
                    </form>
                ) : (
                    <form className="form" onSubmit={(e) => void submit(e)}>
                        <Field label="Access key ID">
                            <input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} placeholder="AKIA…" autoFocus spellCheck={false} />
                        </Field>
                        <Field label="Secret access key">
                            <input type="password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} spellCheck={false} />
                        </Field>
                        {showToken ? (
                            <Field label="Session token" hint="Only for temporary credentials">
                                <input type="password" value={sessionToken} onChange={(e) => setSessionToken(e.target.value)} spellCheck={false} />
                            </Field>
                        ) : (
                            <button type="button" className="link" onClick={() => setShowToken(true)}>Using temporary credentials? Add a session token</button>
                        )}
                        <Field label="Region">
                            <select value={region} onChange={(e) => setRegion(e.target.value)}>
                                {REGIONS.map((r) => <option key={r}>{r}</option>)}
                            </select>
                        </Field>
                        <ErrorBox error={error} />
                        <Button type="submit" variant="primary" busy={busy} disabled={!accessKeyId || !secretAccessKey}>
                            Connect
                        </Button>
                    </form>
                )}

                <div className="note">
                    {provider === 'gcp' ? (
                        <p>
                            The project is verified with <code>clover gcp whoami</code>, then kept in memory until you disconnect
                            or quit, as with <code>eval "$(clover gcp login)"</code>. Already logged in to a shell? Start the app
                            from it and it picks up <code>GOOGLE_CLOUD_PROJECT</code>.
                        </p>
                    ) : <>
                        <p>
                            The keys are verified with <code>clover aws whoami</code>, then kept in memory until you disconnect
                            or quit. Nothing is written to disk, as with <code>eval "$(clover aws login)"</code>.
                        </p>
                        <p>
                            Already logged in to a shell? Start the app from it (<code>npm run dev</code>) and it picks up the
                            same <code>AWS_*</code> variables. <a href="https://github.com/clover-cli/cli/blob/main/docs/setup.md#getting-aws-credentials" target="_blank" rel="noreferrer">How to get an access key</a>
                        </p>
                    </>}
                </div>

                <div className="cli-status">
                    {cli?.version && <><Check size={14} /> clover-cli {cli.version} <span className="muted">· {cli.location}</span></>}
                    {cli?.error && <ErrorBox error={`The clover CLI could not be run (${cli.location}):\n${cli.error}`} />}
                </div>
            </div>
        </div>
    );
}
