import { useState } from 'react';
import { ActionModal } from '../components/ActionModal';
import { Button, Check, DataTable, Empty, ErrorBox, Field, KeyValues, Modal, PageHeader, Spinner, Status } from '../components/ui';
import { ec2, lines, type Instance } from '../lib/clover';
import { useCli } from '../lib/hooks';
import { Play, Plus, RefreshCw, RotateCw, Server, Square, Trash2 } from 'lucide-react';

/** The CLI's image aliases, resolved to the latest AMI in the region. */
const IMAGES = ['al2023', 'al2023-arm64', 'ubuntu-24.04', 'ubuntu-24.04-arm64'];
const TYPES = ['t3.micro', 't3.small', 't3.medium', 't3.large', 't4g.micro', 't4g.small', 't4g.medium'];

function CreateInstance({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const [name, setName] = useState('');
    const [image, setImage] = useState('al2023');
    const [type, setType] = useState('t3.micro');
    const [keyName, setKeyName] = useState('');
    const [volume, setVolume] = useState('');
    const [userData, setUserData] = useState('');
    const [publicIp, setPublicIp] = useState(true);
    const [tags, setTags] = useState('');
    const [wait, setWait] = useState(true);

    const cmd = ec2.create({
        name, image, 'instance-type': type, 'key-name': keyName, 'volume-size': volume ? Number(volume) : undefined,
        'public-ip': publicIp, 'user-data': userData, tags: lines(tags), wait: wait || undefined,
    });
    return (
        <ActionModal wide title="New instance" submitLabel="Launch" cmd={cmd} onClose={onClose} onDone={onDone}>
            <div className="field-row">
                <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="web" autoFocus spellCheck={false} /></Field>
                <Field label="Image" hint="Always the latest AMI in the region">
                    <select value={image} onChange={(e) => setImage(e.target.value)}>{IMAGES.map((x) => <option key={x}>{x}</option>)}</select>
                </Field>
            </div>
            <div className="field-row">
                <Field label="Instance type" hint="arm64 images need a t4g type">
                    <select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((x) => <option key={x}>{x}</option>)}</select>
                </Field>
                <Field label="Disk (GiB, optional)"><input type="number" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="image default" /></Field>
            </div>
            <Field label="SSH key pair (optional)" hint="Name of an existing EC2 key pair">
                <input value={keyName} onChange={(e) => setKeyName(e.target.value)} spellCheck={false} />
            </Field>
            <Field label="Startup script (optional)" hint="Runs once on first boot (user data)">
                <textarea className="code-input" rows={5} value={userData} onChange={(e) => setUserData(e.target.value)}
                    placeholder={'#!/bin/bash\ndnf install -y nginx && systemctl enable --now nginx'} spellCheck={false} />
            </Field>
            <Field label="Tags (optional)" hint="One Key=Value per line">
                <textarea rows={2} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="env=dev" spellCheck={false} />
            </Field>
            <Check label="Public IP" checked={publicIp} onChange={setPublicIp} />
            <Check label="Wait until running" checked={wait} onChange={setWait} />
        </ActionModal>
    );
}

type Power = { action: 'start' | 'stop' | 'reboot'; id: string };

export default function Compute() {
    const instances = useCli<Instance[]>(ec2.list());
    const [creating, setCreating] = useState(false);
    const [details, setDetails] = useState<Instance>();
    const [power, setPower] = useState<Power>();
    const [deleting, setDeleting] = useState<Instance>();
    const [force, setForce] = useState(false);

    return (
        <div className="page">
            <PageHeader title="Compute" subtitle="EC2: virtual servers"
                actions={<>
                    <Button icon={RotateCw} onClick={instances.reload} busy={instances.loading}>Refresh</Button>
                    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New instance</Button>
                </>} />
            <ErrorBox error={instances.error} />
            {instances.loading && !instances.data && <Spinner />}
            {instances.data?.length === 0 && <Empty icon={Server} title="No instances">Launch a server with a startup script in one step.</Empty>}
            {!!instances.data?.length && (
                <DataTable rows={instances.data} rowKey={(i) => i.id} onRowClick={setDetails} columns={[
                    { key: 'name', label: 'Name' },
                    { key: 'id', label: 'ID' },
                    { key: 'type', label: 'Type' },
                    { key: 'state', label: 'State', render: (i) => <Status value={i.state} /> },
                    { key: 'publicIp', label: 'Public IP' },
                    { key: 'az', label: 'Zone' },
                ]} actions={(i) => i.state === 'terminated' ? null : (
                    <span className="row">
                        {i.state === 'stopped'
                            ? <Button variant="ghost" icon={Play} title="Start" onClick={() => setPower({ action: 'start', id: i.id })} />
                            : <Button variant="ghost" icon={Square} title="Stop" onClick={() => setPower({ action: 'stop', id: i.id })} />}
                        <Button variant="ghost" icon={RefreshCw} title="Reboot" onClick={() => setPower({ action: 'reboot', id: i.id })} />
                        <Button variant="ghost" icon={Trash2} title="Terminate" onClick={() => { setForce(false); setDeleting(i); }} />
                    </span>
                )} />
            )}

            {creating && <CreateInstance onClose={() => setCreating(false)} onDone={instances.reload} />}
            {details && <Modal wide title={details.name ?? details.id} onClose={() => setDetails(undefined)}><KeyValues value={details} /></Modal>}
            {power && (
                <ActionModal title={`${power.action} ${power.id}`} submitLabel={power.action[0].toUpperCase() + power.action.slice(1)}
                    danger={power.action !== 'start'} cmd={ec2[power.action](power.id)} onClose={() => setPower(undefined)} onDone={instances.reload}>
                    {power.action === 'stop' && <p>A stopped instance keeps its disk (still billed) and usually gets a new public IP when started again.</p>}
                </ActionModal>
            )}
            {deleting && (
                <ActionModal danger title="Terminate instance" submitLabel="Terminate" confirmWord={deleting.name ?? deleting.id}
                    cmd={ec2.delete(deleting.id, { force: force || undefined })} onClose={() => setDeleting(undefined)} onDone={instances.reload}>
                    <p>Terminating deletes the instance and its root disk. It can't be undone.</p>
                    <Check label="Turn off termination protection first (--force)" checked={force} onChange={setForce} />
                </ActionModal>
            )}
        </div>
    );
}
