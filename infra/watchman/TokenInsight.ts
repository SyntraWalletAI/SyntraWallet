

import type { Transfer } from "./TokenGrouper"
import type { SuspiciousAddress } from "./SuspiciousMonitor"

export interface InsightReport {
  grouped: ReturnType<typeof import("./TokenGrouper").TokenGrouper.group>
  suspicious: SuspiciousAddress[]
}


export class TokenInsight {
  static analyze(
    transfers: Transfer[],
    activities: Parameters<typeof SuspiciousMonitor.detect>[0],
    thresholds: { maxTransfers: number; maxVolume: number; recentWindowMs: number }
  ): InsightReport {
    const grouped = import("./TokenGrouper")
      .then(m => m.TokenGrouper.group(transfers))
    const suspicious = SuspiciousMonitor.detect(
      activities,
      thresholds.maxTransfers,
      thresholds.maxVolume,
      thresholds.recentWindowMs
    )
    // Since group is sync, but here imported dynamically, simplify:
    return {
      grouped: TokenGrouper.group(transfers),
      suspicious,
    }
  }
}
