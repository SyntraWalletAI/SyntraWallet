export class SurgeTracer {
  private history: Array<{ timestamp: number; price: number }> = []

  record(point: { timestamp: number; price: number }): void {
    this.history.push(point)
    if (this.history.length > 100) {
      this.history.shift()
    }
  }

  detect(threshold: number): Array<{ timestamp: number; change: number }> {
    const results: Array<{ timestamp: number; change: number }> = []
    for (let i = 1; i < this.history.length; i++) {
      const delta = (this.history[i].price - this.history[i - 1].price) / this.history[i - 1].price
      if (delta >= threshold) {
        results.push({ timestamp: this.history[i].timestamp, change: delta })
      }
    }
    return results
  }
}
