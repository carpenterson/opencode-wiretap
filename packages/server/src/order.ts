/** Minimal shape needed to put captured requests in display order. */
export interface OrderableRequest {
  file: string;
  seq: number;
}

/**
 * Put requests in chronological order and renumber them from 1.
 *
 * Filenames are timestamp-prefixed, so lexicographic order is chronological.
 * The `seq` embedded in each filename came from a process-global counter that
 * reset whenever the capture plugin reloaded. After a reload the counter could
 * collide with files already in the session directory, leaving duplicate
 * numbers that interleave two different runs when sorted by `seq`. Display
 * numbering should follow the actual files, not that counter.
 */
export function orderRequests<T extends OrderableRequest>(rows: T[]): T[] {
  return [...rows]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map((row, index) => ({ ...row, seq: index + 1 }));
}
