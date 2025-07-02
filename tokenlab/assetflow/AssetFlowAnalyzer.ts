

import type { TransferRecord } from "./AssetFlowMonitor"

export interface FlowSummary {
  token: string
  totalIn: number
  totalOut: number
}


export class AssetFlowAnalyzer {
  constructor(private records: TransferRecord[]) {}

  summarize(): FlowSummary[] {
    const map: Record<string, { in: number; out: number }> = {}
    for (const tx of this.records) {
      if (!map[tx.token]) map[tx.token] = { in: 0, out: 0 }
      if (tx.to.toLowerCase() === tx.to) {
        map[tx.token].in += tx.amount
      } else {
        map[tx.token].out += tx.amount
      }
    }
    return Object.entries(map).map(([token, v]) => ({
      token,
      totalIn: v.in,
      totalOut: v.out,
    }))
  }
}
