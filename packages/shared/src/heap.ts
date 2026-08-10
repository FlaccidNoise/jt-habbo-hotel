/** A binary min-heap over integer node ids `0..capacity`, ordered by `better(a, b)` — true when
 *  `a` must pop before `b`. Every pair the comparator sees has to resolve one way or the other (a
 *  total order, tie-break key included), or pop order stops being deterministic.
 *
 *  Tracks each live node's slot, so `resift` can restore heap order after a node already queued
 *  gets a better key — a shortest-path search needs that when an edge relaxes a queued node's
 *  score. A caller that never improves a queued node's key can just ignore `resift`. */
export class IndexedHeap {
  private readonly heap: Int32Array;
  private readonly at: Int32Array;
  private len = 0;

  constructor(capacity: number, private readonly better: (a: number, b: number) => boolean) {
    this.heap = new Int32Array(capacity);
    this.at = new Int32Array(capacity).fill(-1);
  }

  get length(): number {
    return this.len;
  }

  private swap(i: number, j: number): void {
    const a = this.heap[i] ?? 0, b = this.heap[j] ?? 0;
    this.heap[i] = b; this.at[b] = i;
    this.heap[j] = a; this.at[a] = j;
  }

  private siftUp(from0: number): void {
    let i = from0;
    while (i > 0) {
      const parentAt = (i - 1) >> 1;
      if (!this.better(this.heap[i] ?? 0, this.heap[parentAt] ?? 0)) break;
      this.swap(i, parentAt);
      i = parentAt;
    }
  }

  private siftDown(from0: number): void {
    let i = from0;
    for (;;) {
      const left = i * 2 + 1, right = left + 1;
      let best = i;
      if (left < this.len && this.better(this.heap[left] ?? 0, this.heap[best] ?? 0)) best = left;
      if (right < this.len && this.better(this.heap[right] ?? 0, this.heap[best] ?? 0)) best = right;
      if (best === i) break;
      this.swap(i, best);
      i = best;
    }
  }

  push(node: number): void {
    this.heap[this.len] = node;
    this.at[node] = this.len;
    this.len++;
    this.siftUp(this.len - 1);
  }

  pop(): number {
    const top = this.heap[0] ?? 0;
    this.at[top] = -1;
    this.len--;
    if (this.len > 0) {
      const last = this.heap[this.len] ?? 0;
      this.heap[0] = last;
      this.at[last] = 0;
      this.siftDown(0);
    }
    return top;
  }

  /** Restore heap order for a node already queued whose key just improved. */
  resift(node: number): void {
    this.siftUp(this.at[node] ?? 0);
  }
}
