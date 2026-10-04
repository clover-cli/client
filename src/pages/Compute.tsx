import { useState } from 'react';
import { ActionModal } from '../components/ActionModal';
import { Button, Check, DataTable, Empty, ErrorBox, Field, KeyValues, Modal, PageHeader, Spinner, Status } from '../components/ui';
import { ec2, gce, lines, type Cmd, type GceInstance, type Instance } from '../lib/clover';
import { useCli } from '../lib/hooks';
import { Play, Plus, RefreshCw, RotateCw, Server, Square, Trash2 } from 'lucide-react';

/** The CLI's image aliases, resolved to the latest AMI in the region. */
const IMAGES = ['al2023', 'al2023-arm64', 'ubuntu-24.04', 'ubuntu-24.04-arm64'];
const TYPES = ['t3.micro', 't3.small', 't3.medium', 't3.large', 't4g.micro', 't4g.small', 't4g.medium'];
/** The CLI's GCP image aliases, resolved to the latest image in the family. */
const GCP_IMAGES = ['debian-12', 'debian-12-arm64', 'ubuntu-24.04', 'ubuntu-24.04-arm64'];
const GCP_TYPES = ['e2-micro', 'e2-small', 'e2-medium', 'e2-standard-2', 't2a-standard-1', 't2a-standard-2'];

/** A Compute Engine instance in EC2's shape, so the table and actions are shared. TERMINATED is GCP's "stopped". */
function fromGce(i: GceInstance): Instance {
    const state = i.status?.toLowerCase();
    return {
        id: i.name, name: i.name, type: i.machineType, state: state === 'terminated' ? 'stopped' : state, az: i.zone,
        publicIp: i.publicIp, privateIp: i.privateIp, launched: i.created, tags: i.labels,
    };
}

function CreateInstance({ gcp, onClose, onDone }: { gcp: boolean; onClose: () => void; onDone: () => void }) {
    const [name, setName] = useState('');
    const [image, setImage] = useState(gcp ? 'debian-12' : 'al2023');
    const [type, setType] = useState(gcp ? 'e2-micro' : 't3.micro');
    const [keyName, setKeyName] = useState('');
    const [volume, setVolume] = useState('');
    const [userData, setUserData] = useState('');
    const [publicIp, setPublicIp] = useState(true);
    const [tags, setTags] = useState('');
    const [wait, setWait] = useState(true);

    const size = volume ? Number(volume) : undefined;
    const cmd = gcp
        ? gce.create({
            name, image, 'machine-type': type, 'disk-size': size, 'public-ip': publicIp, 'startup-script': userData,
            labels: lines(tags), wait: wait || undefined,
        })
        : ec2.create({
            name, image, 'instance-type': type, 'key-name': keyName, 'volume-size': size,
            'public-ip': publicIp, 'user-data': userData, tags: lines(tags), wait: wait || undefined,
        });
    return (
        <ActionModal wide title="New instance" submitLabel="Launch" cmd={cmd} valid={!gcp || !!name} onClose={onClose} onDone={onDone}>
            <div className="field-row">
                <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="web" autoFocus spellCheck={false} /></Field>
                <Field label="Image" hint={gcp ? 'Always the latest image in the family' : 'Always the latest AMI in the region'}>
                    <select value={image} onChange={(e) => setImage(e.target.value)}>{(gcp ? GCP_IMAGES : IMAGES).map((x) => <option key={x}>{x}</option>)}</select>
                </Field>
            </div>
            <div className="field-row">
                <Field label={gcp ? 'Machine type' : 'Instance type'} hint={`arm64 images need a ${gcp ? 't2a' : 't4g'} type`}>
                    <select value={type} onChange={(e) => setType(e.target.value)}>{(gcp ? GCP_TYPES : TYPES).map((x) => <option key={x}>{x}</option>)}</select>
                </Field>
                <Field label="Disk (GiB, optional)"><input type="number" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="image default" /></Field>
            </div>
            {!gcp && (
                <Field label="SSH key pair (optional)" hint="Name of an existing EC2 key pair">
                    <input value={keyName} onChange={(e) => setKeyName(e.target.value)} spellCheck={false} />
                </Field>
            )}
            <Field label="Startup script (optional)" hint={gcp ? 'Runs on every boot' : 'Runs once on first boot (user data)'}>
                <textarea className="code-input" rows={5} value={userData} onChange={(e) => setUserData(e.target.value)}
                    placeholder={'#!/bin/bash\ndnf install -y nginx && systemctl enable --now nginx'} spellCheck={false} />
            </Field>
            <Field label={`${gcp ? 'Labels' : 'Tags'} (optional)`} hint="One Key=Value per line">
                <textarea rows={2} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="env=dev" spellCheck={false} />
            </Field>
            <Check label="Public IP" checked={publicIp} onChange={setPublicIp} />
            <Check label="Wait until running" checked={wait} onChange={setWait} />
        </ActionModal>
    );
}

type Power = { action: 'start' | 'stop' | 'reboot'; id: string; zone?: string };

export default function Compute({ gcp }: { gcp: boolean }) {
    const query = useCli<Instance[] | GceInstance[]>(gcp ? gce.list() : ec2.list());
    const instances = { ...query, data: gcp ? (query.data as GceInstance[] | undefined)?.map(fromGce) : query.data as Instance[] | undefined };
    // GCP instances are created in the CLI's default zone, but listed from every zone: act on the one they're in.
    const powerCmd = (p: Power): Cmd => gcp ? gce[p.action](p.id, p.zone!) : ec2[p.action](p.id);
    const [creating, setCreating] = useState(false);
    const [details, setDetails] = useState<Instance>();
    const [power, setPower] = useState<Power>();
    const [deleting, setDeleting] = useState<Instance>();
    const [force, setForce] = useState(false);

    return (
        <div className="page">
            <PageHeader title="Compute" subtitle={`${gcp ? 'Compute Engine' : 'EC2'}: virtual servers`}
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
                    ...(gcp ? [] : [{ key: 'id', label: 'ID' }]),
                    { key: 'type', label: 'Type' },
                    { key: 'state', label: 'State', render: (i) => <Status value={i.state} /> },
                    { key: 'publicIp', label: 'Public IP' },
                    { key: 'az', label: 'Zone' },
                ]} actions={(i) => i.state === 'terminated' ? null : (
                    <span className="row">
                        {i.state === 'stopped'
                            ? <Button variant="ghost" icon={Play} title="Start" onClick={() => setPower({ action: 'start', id: i.id, zone: i.az })} />
                            : <Button variant="ghost" icon={Square} title="Stop" onClick={() => setPower({ action: 'stop', id: i.id, zone: i.az })} />}
                        <Button variant="ghost" icon={RefreshCw} title="Reboot" onClick={() => setPower({ action: 'reboot', id: i.id, zone: i.az })} />
                        <Button variant="ghost" icon={Trash2} title={gcp ? 'Delete' : 'Terminate'} onClick={() => { setForce(false); setDeleting(i); }} />
                    </span>
                )} />
            )}

            {creating && <CreateInstance gcp={gcp} onClose={() => setCreating(false)} onDone={instances.reload} />}
            {details && <Modal wide title={details.name ?? details.id} onClose={() => setDetails(undefined)}><KeyValues value={details} /></Modal>}
            {power && (
                <ActionModal title={`${power.action} ${power.id}`} submitLabel={power.action[0].toUpperCase() + power.action.slice(1)}
                    danger={power.action !== 'start'} cmd={powerCmd(power)} onClose={() => setPower(undefined)} onDone={instances.reload}>
                    {power.action === 'stop' && <p>A stopped instance keeps its disk (still billed) and usually gets a new public IP when started again.</p>}
                    {power.action === 'reboot' && gcp && <p>On GCP this is a hard reset, like pulling the plug.</p>}
                </ActionModal>
            )}
            {deleting && (
                <ActionModal danger title={gcp ? 'Delete instance' : 'Terminate instance'} submitLabel={gcp ? 'Delete' : 'Terminate'} confirmWord={deleting.name ?? deleting.id}
                    cmd={gcp ? gce.delete(deleting.id, deleting.az!, { force: force || undefined }) : ec2.delete(deleting.id, { force: force || undefined })}
                    onClose={() => setDeleting(undefined)} onDone={instances.reload}>
                    <p>{gcp ? 'Deleting' : 'Terminating'} deletes the instance and its boot disk. It can't be undone.</p>
                    <Check label={`Turn off ${gcp ? 'deletion' : 'termination'} protection first (--force)`} checked={force} onChange={setForce} />
                </ActionModal>
            )}
        </div>
    );
}
