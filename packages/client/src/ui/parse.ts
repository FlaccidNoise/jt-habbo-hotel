export type ChatIntent =
  | { kind: "say" | "shout"; text: string }
  | { kind: "whisper"; to: string; text: string }
  | { kind: "trade"; to: string };

/** What a line of chat input means. Null when there is nothing to send. */
export function parseChatInput(raw: string, shiftEnter: boolean): ChatIntent | null {
  const text = raw.trim();
  if (text.length === 0) return null;

  const whisper = /^\/w\s+(\S+)\s+(.+)$/s.exec(text);
  if (whisper) {
    const to = whisper[1] ?? "";
    const body = (whisper[2] ?? "").trim();
    return body.length === 0 ? null : { kind: "whisper", to, text: body };
  }
  if (text.startsWith("/w")) return null;

  const trade = /^\/trade\s+(\S+)\s*$/.exec(text);
  if (trade) return { kind: "trade", to: trade[1] ?? "" };
  if (text.startsWith("/trade")) return null;

  // Touch keyboards have no Shift+Enter, so /shout is the phone path to shouting.
  const shout = /^\/shout\s+(.+)$/s.exec(text);
  if (shout) {
    const body = (shout[1] ?? "").trim();
    return body.length === 0 ? null : { kind: "shout", text: body };
  }
  if (text.startsWith("/shout")) return null;

  return { kind: shiftEnter ? "shout" : "say", text };
}
