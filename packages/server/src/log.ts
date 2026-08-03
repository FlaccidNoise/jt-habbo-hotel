/** One JSON line per notable event, to stdout. */
export function log(event: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ ts: Date.now(), event, ...fields })}\n`);
}
