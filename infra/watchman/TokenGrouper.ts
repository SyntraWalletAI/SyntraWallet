export interface Transfer {
  token: string
  from: string
  to: string
  amount: number
}

export interface GroupedToken {
  token: string
  totalAmount: number
  uniqueSenders: number
  uniqueReceivers: number
  transfers: number
  avgAmount: number
}

export type SortMode = "amountDesc" | "tokenAsc" | "none"

export interface GroupOptions {
  /**
   * Normalize token keys.
   * - true  -> trim + lowercase
   * - false -> use as-is
   * - fn    -> custom mapper
   * default: true
   */
  normalizeToken?: boolean | ((t: string) => string)
  /** Sum absolute values of amounts (useful for mixed in/out). default: false */
  sumAbs?: boolean
  /** Drop groups whose |totalAmount| is below this threshold. default: 0 */
  minAmount?: number
  /** Dedupe identical rows (token|from|to|amount). default: true */
  dedupe?: boolean
  /** Sorting strategy for result. default: "amountDesc" */
  sortBy?: SortMode
  /** Return only the top N groups after sorting. default: unlimited */
  topN?: number
  /** Round amounts and averages to this many fraction digits. default: 2 */
  roundDigits?: number
}

export class TokenGrouper {
  /**
   * Group transfers by token with flexible options and sensible defaults.
   * Backward compatible fields are preserved; extras: transfers, avgAmount.
   */
  static group(transfers: Transfer[], options: GroupOptions = {}): GroupedToken[] {
    const {
      normalizeToken = true,
      sumAbs = false,
      minAmount = 0,
      dedupe = true,
      sortBy = "amountDesc",
      topN,
      roundDigits = 2,
    } = options

    const tok = makeNormalizer(normalizeToken)
    const groups = new Map<
      string,
      { amount: number; senders: Set<string>; receivers: Set<string>; transfers: number }
    >()

    const seen = dedupe ? new Set<string>() : null

    for (const t of transfers) {
      if (!isValid(t)) continue

      if (seen) {
        const k = `${t.token}|${t.from}|${t.to}|${t.amount}`
        if (seen.has(k)) continue
        seen.add(k)
      }

      const key = tok(t.token)
      const g = groups.get(key) ?? { amount: 0, senders: new Set(), receivers: new Set(), transfers: 0 }
      g.amount += sumAbs ? Math.abs(t.amount) : t.amount
      g.senders.add(t.from)
      g.receivers.add(t.to)
      g.transfers += 1
      groups.set(key, g)
    }

    // project to array + filters
    let out: GroupedToken[] = Array.from(groups.entries()).map(([token, g]) => ({
      token,
      totalAmount: round(g.amount, roundDigits),
      uniqueSenders: g.senders.size,
      uniqueReceivers: g.receivers.size,
      transfers: g.transfers,
      avgAmount: round(g.transfers ? g.amount / g.transfers : 0, roundDigits),
    }))

    if (minAmount > 0) {
      out = out.filter(x => Math.abs(x.totalAmount) >= minAmount)
    }

    // sort
    switch (sortBy) {
      case "amountDesc":
        out.sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount) || a.token.localeCompare(b.token))
        break
      case "tokenAsc":
        out.sort((a, b) => a.token.localeCompare(b.token))
        break
      case "none":
      default:
        // keep insertion order
        break
    }

    if (Number.isInteger(topN) && topN! > 0) out = out.slice(0, topN)

    return out
  }
}

/* ------------------------------- helpers ------------------------------- */

function isValid(t: Transfer): boolean {
  if (!t || typeof t !== "object") return false
  if (typeof t.token !== "string" || t.token.trim().length === 0) return false
  if (typeof t.from !== "string" || t.from.trim().length === 0) return false
  if (typeof t.to !== "string" || t.to.trim().length === 0) return false
  return Number.isFinite(t.amount)
}

function makeNormalizer(n: boolean | ((t: string) => string)): (t: string) => string {
  if (typeof n === "function") return (t: string) => n(t)
  if (n === false) return (t: string) => t
  return (t: string) => t.trim().toLowerCase()
}

function round(x: number, digits: number): number {
  const f = Math.pow(10, Math.max(0, digits | 0))
  return Math.round(x * f) / f
}
