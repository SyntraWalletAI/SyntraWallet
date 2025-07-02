export class BalanceTransformer {
  /**
   * Convert smallest-unit balance to decimal.
   * @param rawBalance Integer balance (string or number).
   * @param decimals Number of token decimals (e.g., 18).
   */
  static toDecimal(rawBalance: string | number, decimals: number): number {
    const big = typeof rawBalance === "string"
      ? BigInt(rawBalance)
      : BigInt(Math.floor(rawBalance))
    const divisor = 10n ** BigInt(decimals)
    const whole = big / divisor
    const fraction = Number(big % divisor) / Number(divisor)
    return Number(whole) + fraction
  }

  /**
   * Format decimal balance with fixed precision.
   * @param amount Decimal amount.
   * @param precision Number of decimal places.
   */
  static format(amount: number, precision: number = 4): string {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision
    })
  }
}