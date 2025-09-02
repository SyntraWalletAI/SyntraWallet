export interface MetricsEntry {
  key: string
  value: number
  timestamp: number // Unix ms
}

export interface MetricsCacheOptions {
  /** Default retention horizon in ms for all keys (default: 1h) */
  retentionMs?: number
  /** Optional per-key cap; oldest items are evicted when exceeded (default: 5_000) */
  maxPerKey?: number
  /** Inject a clock for tests (default: Date.now) */
  now?: () => number
}

export interface Summary {
  count: number
  sum: number
  avg: number
  min: number
  max: number
  p50: number
  p95: number
  firstTs: number | null
  lastTs: number | null
  last: number | null
  /** events per minute across the window represented in the summary */
  ratePerMin: number
}

/**
 * MetricsCache
 * - Keeps per-key, time-ordered series of MetricsEntry
 * - Fast pruning by time horizon and size cap
 * - Rich summaries & range queries
 * - Deterministic, side-effect free getters
 */
export class MetricsCache {
  private store = new Map<string, MetricsEntry[]>() // ascending by timestamp
  private retentionMs: number
  private maxPerKey: number
  private readonly now: () => number

  constructor(opts: MetricsCacheOptions = {}) {
    this.retentionMs = Math.max(1_000, Math.floor(opts.retentionMs ?? 60 * 60 * 1_000))
    this.maxPerKey = Math.max(1, Math.floor(opts.maxPerKey ?? 5_000))
    this.now = opts.now ?? Date.now
  }

  /** Change global retention policy (affects subsequent add/prune) */
  setRetentionMs(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) throw new RangeError("retentionMs must be > 0")
    this.retentionMs = Math.floor(ms)
  }

  /** Change per-key capacity (oldest entries evicted on next add/prune) */
  setMaxPerKey(n: number): void {
    if (!Number.isInteger(n) || n <= 0) throw new RangeError("maxPerKey must be a positive integer")
    this.maxPerKey = n
  }

  /** Insert one entry (keeps series ordered by timestamp) */
  add(entry: MetricsEntry): void {
    validateEntry(entry)
    const list = this.ensureList(entry.key)
    insertSortedByTs(list, entry)
    this.enforceCaps(list)
    this.pruneKey(entry.key) // time-based prune
  }

  /** Bulk insert (more efficient than calling add() repeatedly) */
  addMany(entries: MetricsEntry[]): void {
    if (!Array.isArray(entries) || entries.length === 0) return
    // group by key for efficient merges
    const byKey = new Map<string, MetricsEntry[]>()
    for (const e of entries) {
      validateEntry(e)
      let g = byKey.get(e.key)
      if (!g) byKey.set(e.key, (g = []))
      g.push(e)
    }
    for (const [key, group] of byKey) {
      const list = this.ensureList(key)
      // fast path: if group is small, insert one by one; else merge-sort
      if (group.length < 16) {
        for (const e of group) insertSortedByTs(list, e)
      } else {
        group.sort((a, b) => a.timestamp - b.timestamp)
        mergeSorted(list, group) // in-place merge into list
      }
      this.enforceCaps(list)
      this.pruneKey(key)
    }
  }

  /** Get entries for a key since a given time (inclusive) */
  getSince(key: string, sinceTs: number): MetricsEntry[] {
    const list = this.store.get(key)
    if (!list?.length) return []
    const i = lowerBoundByTs(list, sinceTs)
    return list.slice(i)
  }

  /** Get entries in [fromTs, toTs] (both inclusive) */
  getRange(key: string, fromTs: number, toTs: number): MetricsEntry[] {
    if (toTs < fromTs) return []
    const list = this.store.get(key)
    if (!list?.length) return []
    const i = lowerBoundByTs(list, fromTs)
    const j = upperBoundByTs(list, toTs)
    return list.slice(i, j)
  }

  /** Snapshot current keys */
  keys(): string[] {
    return Array.from(this.store.keys())
  }

  /** Remove a specific key (returns removed entries) */
  deleteKey(key: string): MetricsEntry[] {
    const list = this.store.get(key) ?? []
    this.store.delete(key)
    return list
  }

  /** Remove all data and return the flushed entries */
  flush(): MetricsEntry[] {
    const all = Array.from(this.store.values()).flat()
    this.store.clear()
    return all
  }

  /** Prune all keys by time horizon & size caps */
  pruneAll(): void {
    for (const key of this.store.keys()) this.pruneKey(key)
  }

  /**
   * Summary for a key over [sinceTs, now].
   * Returns zeros/empties when no data.
   */
  summary(key: string, sinceTs: number): Summary {
    const entries = this.getSince(key, sinceTs)
    const count = entries.length
    if (count === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        firstTs: null,
        lastTs: null,
        last: null,
        ratePerMin: 0,
      }
    }

    let sum = 0
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    const vals = new Array<number>(count)
    for (let i = 0; i < count; i++) {
      const v = entries[i].value
      vals[i] = v
      sum += v
      if (v < min) min = v
      if (v > max) max = v
    }
    vals.sort((a, b) => a - b)
    const p50 = quantileSorted(vals, 0.5)
    const p95 = quantileSorted(vals, 0.95)

    const firstTs = entries[0].timestamp
    const lastTs = entries[count - 1].timestamp
    const windowMin = Math.max(1, (lastTs - firstTs) / 60000) // avoid /0
    const ratePerMin = count / windowMin

    return {
      count,
      sum,
      avg: sum / count,
      min,
      max,
      p50,
      p95,
      firstTs,
      lastTs,
      last: entries[count - 1].value,
      ratePerMin,
    }
  }

  /* ----------------------------- internals ----------------------------- */

  private ensureList(key: string): MetricsEntry[] {
    const existing = this.store.get(key)
    if (existing) return existing
    const list: MetricsEntry[] = []
    this.store.set(key, list)
    return list
  }

  private enforceCaps(list: MetricsEntry[]): void {
    // size cap (drop oldest)
    const excess = list.length - this.maxPerKey
    if (excess > 0) list.splice(0, excess)
  }

  /** Prune a single key by time horizon & size */
  private pruneKey(key: string): void {
    const list = this.store.get(key)
    if (!list?.length) return
    const horizon = this.now() - this.retentionMs
    const i = lowerBoundByTs(list, horizon + 1)
    if (i > 0) list.splice(0, i) // drop strictly older than horizon
    this.enforceCaps(list)
    if (list.length === 0) this.store.delete(key)
  }
}

/* ------------------------------- utilities ------------------------------- */

function validateEntry(e: MetricsEntry): void {
  if (!e || typeof e.key !== "string" || !e.key) throw new TypeError("entry.key must be a non-empty string")
  if (!Number.isFinite(e.value)) throw new TypeError("entry.value must be a finite number")
  if (!Number.isFinite(e.timestamp)) throw new TypeError("entry.timestamp must be a finite number (ms)")
}

/** Insert entry into sorted array by timestamp (ascending) */
function insertSortedByTs(arr: MetricsEntry[], e: MetricsEntry): void {
  if (arr.length === 0 || e.timestamp >= arr[arr.length - 1].timestamp) {
    arr.push(e)
    return
  }
  const i = lowerBoundByTs(arr, e.timestamp)
  arr.splice(i, 0, e)
}

/** Merge two ascending-by-ts arrays into the first one (in-place) */
function mergeSorted(dst: MetricsEntry[], src: MetricsEntry[]): void {
  // fast path: if src entirely after dst
  if (!dst.length || src[0].timestamp >= dst[dst.length - 1].timestamp) {
    for (const e of src) dst.push(e)
    return
  }
  const result: MetricsEntry[] = []
  let i = 0, j = 0
  while (i < dst.length && j < src.length) {
    if (dst[i].timestamp <= src[j].timestamp) result.push(dst[i++])
    else result.push(src[j++])
  }
  while (i < dst.length) result.push(dst[i++])
  while (j < src.length) result.push(src[j++])
  dst.length = 0
  Array.prototype.push.apply(dst, result)
}

/** First index with ts >= target */
function lowerBoundByTs(arr: MetricsEntry[], targetTs: number): number {
  let lo = 0, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid].timestamp < targetTs) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** First index with ts > target */
function upperBoundByTs(arr: MetricsEntry[], targetTs: number): number {
  let lo = 0, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid].timestamp <= targetTs) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Quantile for sorted numeric array (clamped linear interpolation) */
function quantileSorted(sorted: number[], q: number): number {
  if (!sorted.length) return 0
  const qq = Math.min(1, Math.max(0, q))
  const pos = (sorted.length - 1) * qq
  const i = Math.floor(pos)
  const f = pos - i
  if (i + 1 >= sorted.length) return sorted[i]
  return sorted[i] * (1 - f) + sorted[i + 1] * f
}
