import { useState, type FormEvent, type ReactNode } from 'react';
import type { CliResult } from '../../shared/types';
import { runRaw, type Cmd } from '../lib/clover';
import { Button, CommandPreview, ErrorBox, Modal } from './ui';

/**
 * A form that runs exactly one CLI command. The command is shown (and copyable) as the form is
 * filled in, and what runs is exactly that command, plus `--output json` so the app can read the
 * result.
 *
 * With `confirmWord`, the command only runs once that word is typed (for deletes).
 */
export function ActionModal({ title, cmd, submitLabel, onClose, onDone, children, danger, valid = true, confirmWord, wide }: {
    title: string;
    cmd: Cmd;
    submitLabel: string;
    onClose: () => void;
    onDone?: (result: CliResult) => void;
    children?: ReactNode;
    danger?: boolean;
    valid?: boolean;
    confirmWord?: string;
    wide?: boolean;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [typed, setTyped] = useState('');
    const confirmed = !confirmWord || typed === confirmWord;

    async function submit(e?: FormEvent) {
        e?.preventDefault();
        if (!valid || !confirmed || busy) return;
        setBusy(true);
        setError(undefined);
        try {
            const result = await runRaw(cmd);
            if (result.code !== 0) {
                setError(result.stderr.trim() || `Exited with code ${result.code}`);
                return;
            }
            onDone?.(result);
            onClose();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal title={title} onClose={busy ? () => {} : onClose} wide={wide} footer={
            <>
                <Button onClick={onClose} disabled={busy}>Cancel</Button>
                <Button variant={danger ? 'danger' : 'primary'} busy={busy} disabled={!valid || !confirmed}
                    onClick={() => void submit()}>{submitLabel}</Button>
            </>
        }>
            <form className="form" onSubmit={(e) => void submit(e)}>
                {children}
                {confirmWord && (
                    <label className="field">
                        <span className="field-label">Type <strong>{confirmWord}</strong> to confirm</span>
                        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus spellCheck={false} />
                    </label>
                )}
                {/* Enter submits the form even though the buttons live in the footer. */}
                <button type="submit" hidden />
            </form>
            <CommandPreview cmd={cmd} />
            {busy && cmd.includes('--wait') && (
                <p className="muted small">Waiting for AWS to finish. This can take several minutes; progress is in Activity.</p>
            )}
            <ErrorBox error={error} />
        </Modal>
    );
}
