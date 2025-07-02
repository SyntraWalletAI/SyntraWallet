export class PulseChecker {
  check(events: Array<{ timestamp: number; count: number }>, window: number): { pulse: number; activePeriods: number } {
    const now = Date.now()
    const recent = events.filter(e => now - e.timestamp <= window)
    const pulse = recent.reduce((sum, e) => sum + e.count, 0)
    const activePeriods = new Set(recent.map(e => Math.floor(e.timestamp / window))).size
    return { pulse, activePeriods }
  }
}
