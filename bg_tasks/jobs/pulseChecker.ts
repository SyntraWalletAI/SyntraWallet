export interface PulseStats {
  pulse: number
  activePeriods: number
  avgPerPeriod: number
  recentEvents: number
}

export class PulseChecker {
  check(
    events: Array<{ timestamp: number; count: number }>,
    window: number
  ): PulseStats {
    const now = Date.now()

    // keep only events within [now - window, now]
    const recent = events.filter(e => now - e.timestamp <= window)

    const pulse = recent.reduce((sum, e) => sum + e.count, 0)

    // bucket by relative window slices
    const activePeriods = new Set(
      recent.map(e => Math.floor((now - e.timestamp) / window))
    ).size

    const avgPerPeriod = activePeriods > 0 ? pulse / activePeriods : 0

    return {
      pulse,
      activePeriods,
      avgPerPeriod,
      recentEvents: recent.length,
    }
  }
}
