/**
 * Play-log marks (spec §8.8), buffered: kit `mark()` rewrites the whole session log synchronously
 * and caps a session at 200 events, so a level only accumulates counters and the buffer is written
 * at the level's end or when the page hides — never per push.
 */
import type { Session } from '@kit/log';

export class MarkBuffer {
  private pending: [string, Record<string, unknown>][] = [];
  /** marks written so far (dev/test view) */
  readonly written: [string, Record<string, unknown>][] = [];

  constructor(private readonly session: Session | null) {}

  add(name: string, data: Record<string, unknown>): void {
    this.pending.push([name, data]);
  }

  flush(): void {
    const items = this.pending;
    this.pending = [];
    for (const [name, data] of items) {
      try {
        this.session?.mark(name, data);
      } catch {
        /* storage full: the log is best effort */
      }
      this.written.push([name, data]);
    }
  }
}
