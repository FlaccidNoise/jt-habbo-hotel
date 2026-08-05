export interface BubbleMsg {
  mode: "say" | "shout" | "whisper";
  text: string;
  faded: boolean;
}

const LIFETIME_MS = 5000;
const FADE_MS = 800;

/** Speech bubbles over the canvas. Styling comes from the message fields the server sets, never
 *  from the text — a player who types "…" gets an ordinary bubble. */
export class ChatOverlay {
  private root: HTMLElement;
  private live = new Map<number, { node: HTMLElement; timers: ReturnType<typeof setTimeout>[] }>();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /** `tint` is the speaker's own colour, derived from their outfit (GAME.md) — never from the
   *  text, so a player cannot style their own bubble by what they type. */
  show(id: number, msg: BubbleMsg, tint?: number): void {
    this.remove(id);
    const node = document.createElement("div");
    node.className = `bubble ${msg.mode}${msg.faded ? " faded" : ""}`;
    if (tint !== undefined) {
      node.style.borderColor = `#${tint.toString(16).padStart(6, "0")}`;
    }
    node.textContent = msg.text;
    node.style.visibility = "hidden";
    this.root.appendChild(node);
    this.live.set(id, {
      node,
      timers: [
        setTimeout(() => node.classList.add("fading"), LIFETIME_MS - FADE_MS),
        setTimeout(() => this.remove(id), LIFETIME_MS),
      ],
    });
  }

  /** Called each frame with the current screen point of each speaker's head. */
  layout(point: (id: number) => { sx: number; sy: number } | null): void {
    for (const [id, entry] of this.live) {
      const p = point(id);
      if (!p) {
        entry.node.style.visibility = "hidden";
        continue;
      }
      entry.node.style.visibility = "visible";
      entry.node.style.left = `${Math.round(p.sx)}px`;
      entry.node.style.top = `${Math.round(p.sy)}px`;
    }
  }

  clear(): void {
    for (const id of [...this.live.keys()]) this.remove(id);
  }

  private remove(id: number): void {
    const entry = this.live.get(id);
    if (!entry) return;
    for (const timer of entry.timers) clearTimeout(timer);
    entry.node.remove();
    this.live.delete(id);
  }
}
