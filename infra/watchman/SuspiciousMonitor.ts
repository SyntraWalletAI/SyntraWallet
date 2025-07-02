
export interface Activity {
  address: string
  transfersIn: number
  transfersOut: number
  volumeIn: number
  volumeOut: number
  lastSeen: number
}
export interface SuspiciousAddress {
  address: string
  score: number
  reasons: string[]
}


export class SuspiciousMonitor {
  static detect(
    activities: Activity[],
    maxTransfers: number,
    maxVolume: number,
    recentWindowMs: number
  ): SuspiciousAddress[] {
    const now = Date.now()
    return activities
      .map(a => {
        let score = 0
        const reasons: string[] = []
        const totalTransfers = a.transfersIn + a.transfersOut
        const totalVolume = a.volumeIn + a.volumeOut

        if (totalTransfers >= maxTransfers) {
          score += 1
          reasons.push("high transfer count")
        }
        if (totalVolume >= maxVolume) {
          score += 1
          reasons.push("high volume")
        }
        if (now - a.lastSeen <= recentWindowMs) {
          score += 1
          reasons.push("recent activity")
        }

        return score > 0 ? { address: a.address, score, reasons } : null
      })
      .filter((x): x is SuspiciousAddress => x !== null)
      .sort((a, b) => b.score - a.score)
  }
}