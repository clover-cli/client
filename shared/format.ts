/** Quotes an argument the way a POSIX shell needs it, so shown commands can be copy-pasted. */
export function shellQuote(arg: string): string {
    return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** ['aws', 's3', 'list'] -> "clover aws s3 list" */
export function formatCommand(args: readonly string[]): string {
    return ['clover', ...args].map(shellQuote).join(' ');
}
