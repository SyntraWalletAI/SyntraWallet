import { TokenGrouper, type Transfer } from "./TokenGrouper"
import { SuspiciousMonitor, type SuspiciousAddress } from "./SuspiciousMonitor"

export interface InsightReport {
  grouped: ReturnType<typeof TokenGrouper.group>
  suspicious: SuspiciousAddress[]
}

export class TokenInsight {
  static analyze(
    transfers: Transfer[],
    activities: Parameters<typeof SuspiciousMonitor.detect>[0],
    thresholds: { maxTransfers: number; maxVolume: number; recentWindowMs: number }
  ): InsightReport {
    const grouped = TokenGrouper.group(transfers)
    const suspicious = SuspiciousMonitor.detect(
      activities,
      thresholds.maxTransfers,
      thresholds.maxVolume,
      thresholds.recentWindowMs
    )
    return { grouped, suspicious }
  }
}
