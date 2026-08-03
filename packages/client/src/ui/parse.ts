export type ChatIntent =
  | { kind: "say" | "shout"; text: string }
  | { kind: "whisper"; to: string; text: string };

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

  return { kind: shiftEnter ? "shout" : "say", text };
}
