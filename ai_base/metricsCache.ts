
export interface MetricsEntry {
  key: string
  value: number
  timestamp: number
}

export class MetricsCache {
  private store = new Map<string, MetricsEntry[]>()
  private retentionMs = 1000 * 60 * 60 // 1h

  add(entry: MetricsEntry): void {
    const list = this.store.get(entry.key) || []
    list.push(entry)
    this.store.set(entry.key, list.filter(e => e.timestamp + this.retentionMs > Date.now()))
  }

  get(key: string, since: number): MetricsEntry[] {
    return (this.store.get(key) || []).filter(e => e.timestamp >= since)
  }

  flush(): MetricsEntry[] {
    const all = Array.from(this.store.values()).flat()
    this.store.clear()
    return all
  }

  summary(key: string, since: number): { count: number; avg: number; max: number } {
    const entries = this.get(key, since)
    const values = entries.map(e => e.value)
    const count = values.length
    const avg = count ? values.reduce((a, b) => a + b, 0) / count : 0
    const max = count ? Math.max(...values) : 0
    return { count, avg, max }
  }
}
