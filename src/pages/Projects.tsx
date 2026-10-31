import { useState } from 'react';
import { ActionModal } from '../components/ActionModal';
import { Button, DataTable, Empty, ErrorBox, Field, Modal, PageHeader, Spinner } from '../components/ui';
import { formatDate } from '../lib/format';
import { lines, projects, type Project, type ProjectOverview, type ProjectResource } from '../lib/clover';
import { useCli } from '../lib/hooks';
import { CircleCheck, CircleOff, FolderKanban, Plus, RotateCw, Trash2 } from 'lucide-react';

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

function CreateProject({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const [name, setName] = useState('');
    return (
        <ActionModal title="New project" submitLabel="Create project" cmd={projects.create(name || '<name>')} valid={NAME.test(name)}
            onClose={onClose} onDone={onDone}>
            <Field label="Name" hint="Lowercase letters, digits and dashes. Use it afterwards to make it the current project.">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="web-app" autoFocus spellCheck={false} />
            </Field>
        </ActionModal>
    );
}

function AddResources({ name, onClose, onDone }: { name: string; onClose: () => void; onDone: () => void }) {
    const [arns, setArns] = useState('');
    return (
        <ActionModal wide title={`Add to ${name}`} submitLabel="Add" cmd={projects.add(name, lines(arns).length ? lines(arns) : ['<arn>'])}
            valid={lines(arns).length > 0} onClose={onClose} onDone={onDone}>
            <Field label="Resource ARNs" hint={<>One per line. Each gets the tag <code>clover:project={name}</code>.</>}>
                <textarea className="code-input" rows={5} value={arns} onChange={(e) => setArns(e.target.value)} autoFocus spellCheck={false}
                    placeholder={'arn:aws:s3:::my-bucket\narn:aws:lambda:us-east-1:123456789012:function:api'} />
            </Field>
        </ActionModal>
    );
}

function ProjectView({ name, onClose }: { name: string; onClose: () => void }) {
    const project = useCli<Project & { resources?: ProjectResource[] }>(projects.get(name));
    const [adding, setAdding] = useState(false);
    const resources = project.data?.resources;
    return (
        <Modal wide title={name} onClose={onClose} footer={<Button icon={Plus} onClick={() => setAdding(true)}>Add resources</Button>}>
            <ErrorBox error={project.error} />
            {project.loading && !project.data && <Spinner />}
            {project.data && !resources && <p className="muted small">Couldn't list the project's resources. Activity has the CLI's message.</p>}
            {resources?.length === 0 && <p className="muted">No resources in this project yet, in this region.</p>}
            {!!resources?.length && (
                <DataTable rows={resources} rowKey={(r) => r.arn} columns={[
                    { key: 'service', label: 'Service' },
                    { key: 'id', label: 'ID' },
                    { key: 'arn', label: 'ARN' },
                ]} />
            )}
            {adding && <AddResources name={name} onClose={() => setAdding(false)} onDone={project.reload} />}
        </Modal>
    );
}

/** `onChange` runs after the current project changes, so the rest of the app can follow it. */
export default function Projects({ onChange }: { onChange: () => void }) {
    const list = useCli<Project[]>(projects.list());
    const overview = useCli<ProjectOverview>(projects.overview());
    const [creating, setCreating] = useState(false);
    const [selected, setSelected] = useState<string>();
    const [using, setUsing] = useState<{ name: string | null }>();
    const [deleting, setDeleting] = useState<Project>();

    const totals = new Map(overview.data?.projects.map((p) => [p.project, p.total]));
    const current = list.data?.find((p) => p.current)?.name;
    const reload = () => { list.reload(); overview.reload(); onChange(); };

    return (
        <div className="page">
            <PageHeader title="Projects" subtitle={current
                ? <>Showing only <strong>{current}</strong>'s resources everywhere. New resources join it.</>
                : 'Group resources by project. With a current project, every screen shows only its resources.'}
                actions={<>
                    <Button icon={RotateCw} onClick={reload} busy={list.loading}>Refresh</Button>
                    {current && <Button icon={CircleOff} onClick={() => setUsing({ name: null })}>Show everything</Button>}
                    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New project</Button>
                </>} />
            <ErrorBox error={list.error} />
            {list.loading && !list.data && <Spinner />}
            {list.data?.length === 0 && <Empty icon={FolderKanban} title="No projects yet">Create one, then use it to keep its resources together.</Empty>}
            {!!list.data?.length && (
                <DataTable rows={list.data} rowKey={(p) => p.name} onRowClick={(p) => setSelected(p.name)} selected={current} columns={[
                    { key: 'name', label: 'Name', render: (p) => <>{p.name} {p.current && <span className="muted small">· current</span>}</> },
                    { key: 'resources', label: 'Resources', render: (p) => overview.loading ? <Spinner /> : totals.get(p.name) ?? '—' },
                    { key: 'created', label: 'Created', render: (p) => formatDate(p.created) },
                ]} actions={(p) => (
                    <span className="row">
                        {!p.current && <Button variant="ghost" icon={CircleCheck} title="Use this project" onClick={() => setUsing({ name: p.name })} />}
                        <Button variant="ghost" icon={Trash2} title="Delete project" onClick={() => setDeleting(p)} />
                    </span>
                )} />
            )}
            {overview.error && !!list.data?.length && <p className="muted small">Resource counts need the tag:GetResources permission.</p>}

            {creating && <CreateProject onClose={() => setCreating(false)} onDone={reload} />}
            {selected && <ProjectView name={selected} onClose={() => setSelected(undefined)} />}
            {using && (
                <ActionModal title={using.name ? `Use ${using.name}` : 'Show everything'} submitLabel={using.name ? 'Use project' : 'Show everything'}
                    cmd={projects.use(using.name)} onClose={() => setUsing(undefined)} onDone={reload}>
                    <p>{using.name
                        ? <>Every screen shows only resources tagged <code>clover:project={using.name}</code>, and new ones get the tag.</>
                        : 'Every screen shows all resources again.'}</p>
                    <p className="muted small">The current project is shared with <code>clover</code> in your terminal.</p>
                </ActionModal>
            )}
            {deleting && (
                <ActionModal danger title="Delete project" submitLabel="Delete project" cmd={projects.delete(deleting.name)}
                    onClose={() => setDeleting(undefined)} onDone={reload}>
                    <p>This forgets <strong>{deleting.name}</strong>. Its resources and their tags are kept.</p>
                </ActionModal>
            )}
        </div>
    );
}
