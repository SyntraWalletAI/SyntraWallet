import type { TransferRecord } from "./AssetFlowMonitor"


export interface FlowSummary {
  /** Token symbol or mint */
  token: string
  /** Sum of all amounts sent to the monitored address */
  totalIn: number
  /** Sum of all amounts sent from the monitored address */
  totalOut: number
  /** Net flow (totalIn − totalOut) */
  netFlow: number
}

export interface FlowAnalyzerOptions {
  /** Address to treat as “self” for in/out classification (default: first record’s `to`) */
  selfAddress?: string
  /** Whether to include tokens with zero net flow (default: false) */
  includeZeroNet?: boolean
}


export class AssetFlowAnalyzer {
  private readonly records: readonly TransferRecord[]
  private readonly selfAddress: string

  /**
   * @param records        List of transfer records
   * @param options.selfAddress  Address to consider as “self” (case-insensitive). Defaults to first record’s `to` field.
   */
  constructor(
    records: TransferRecord[],
    options: FlowAnalyzerOptions = {}
  ) {
    if (!Array.isArray(records)) {
      throw new TypeError("records must be an array of TransferRecord")
    }
    this.records = records
    this.selfAddress =
      options.selfAddress?.toLowerCase() ??
      (records[0]?.to.toLowerCase() ?? "")
    if (!this.selfAddress) {
      throw new Error("Unable to determine selfAddress for flow analysis")
    }
  }

  public summarize(
    options: FlowAnalyzerOptions = {}
  ): FlowSummary[] {
    const includeZero = options.includeZeroNet ?? false
    const flowMap = new Map<
      string,
      { totalIn: number; totalOut: number }
    >()

    for (const tx of this.records) {
      const token = tx.token
      const amount = tx.amount
      if (typeof amount !== "number" || amount <= 0) continue

      const rec = flowMap.get(token) ?? { totalIn: 0, totalOut: 0 }
      if (tx.to.toLowerCase() === this.selfAddress) {
        rec.totalIn += amount
      } else if (tx.from.toLowerCase() === this.selfAddress) {
        rec.totalOut += amount
      }
      flowMap.set(token, rec)
    }

    const summaries: FlowSummary[] = []
    for (const [token, { totalIn, totalOut }] of flowMap) {
      const netFlow = totalIn - totalOut
      if (!includeZero && netFlow === 0) continue
      summaries.push({ token, totalIn, totalOut, netFlow })
    }

    // Sort by absolute net flow descending
    return summaries.sort(
      (a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow)
    )
  }
}
