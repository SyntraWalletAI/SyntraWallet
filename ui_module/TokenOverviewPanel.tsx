import React, { Suspense, lazy, useEffect, useMemo, useState } from "react"

/** --------- utils --------- */
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** Lazy loader with automatic retry on transient chunk errors */
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  { retries = 2, delayMs = 500 } = {}
) {
  let attempt = 0
  const load = (): Promise<{ default: T }> =>
    factory().catch((err) => {
      if (attempt++ < retries) {
        return new Promise<{ default: T }>((res, rej) =>
          setTimeout(() => load().then(res, rej), delayMs * attempt)
        )
      }
      throw err
    })
  return lazy(load)
}

/** Simple error boundary per widget */
class WidgetErrorBoundary extends React.Component<{ title: string }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <section className="bg-white dark:bg-gray-800 border border-red-300 dark:border-red-700 rounded-2xl p-4 shadow">
          <h2 className="text-xl font-semibold mb-2 text-red-700 dark:text-red-300">
            {this.props.title} failed to load
          </h2>
          <pre className="text-sm text-red-600 dark:text-red-400 overflow-auto">
            {this.state.error.message}
          </pre>
        </section>
      )
    }
    return this.props.children as React.ReactElement
  }
}

/** --------- lazy widgets (with retry) --------- */
const BalanceWatcherComponent = lazyWithRetry(() => import("./BalanceWatcherComponent"))
const TransactionWatcherComponent = lazyWithRetry(() => import("./TransactionWatcherComponent"))

/** --------- props --------- */
interface WalletWatchDashboardProps {
  rpcEndpoint: string
  apiEndpoint: string
  addresses: string[]
  /** Poll interval in ms (min 1000ms, default 10_000) */
  pollIntervalMs?: number
}

/** --------- layout helpers --------- */
const WidgetContainer: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle, children }) => (
  <section
    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow flex flex-col"
    role="region"
    aria-label={title}
  >
    <header className="mb-2">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
      {subtitle ? <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
    </header>
    <div className="flex-1 min-h-24">{children}</div>
  </section>
)

/** --------- skeletons --------- */
const WidgetSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-3">
    <div className="h-5 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
    <div className="h-40 w-full bg-gray-200 dark:bg-gray-700 rounded" />
  </div>
)

/** --------- main component --------- */
export const WalletWatchDashboard: React.FC<WalletWatchDashboardProps> = React.memo(
  ({ rpcEndpoint, apiEndpoint, addresses, pollIntervalMs = 10_000 }) => {
    const [ready, setReady] = useState(false)

    // Validate and normalize props once
    const { validRpc, validApi, uniqueAddresses, interval } = useMemo(() => {
      const isUrl = (u: string) => {
        try {
          new URL(u)
          return true
        } catch {
          return false
        }
      }
      const uniq = Array.from(new Set((addresses || []).map((a) => a.trim()).filter(Boolean)))
      return {
        validRpc: isUrl(rpcEndpoint),
        validApi: isUrl(apiEndpoint),
        uniqueAddresses: uniq,
        interval: clamp(Math.floor(pollIntervalMs), 1000, 5 * 60 * 1000), // 1s .. 5m
      }
    }, [rpcEndpoint, apiEndpoint, addresses, pollIntervalMs])

    useEffect(() => {
      // Simulate/perform any lightweight readiness logic
      setReady(true)
    }, [validRpc, validApi])

    if (!ready) {
      return (
        <div className="flex items-center justify-center h-full" aria-live="polite">
          <span className="text-lg text-gray-600 dark:text-gray-400">Initializing dashboard…</span>
        </div>
      )
    }

    if (!validRpc || !validApi) {
      return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
          <div className="max-w-xl mx-auto bg-white dark:bg-gray-800 border border-red-300 dark:border-red-700 rounded-2xl p-4">
            <h1 className="text-2xl font-bold text-red-700 dark:text-red-300 mb-2">Configuration Error</h1>
            {!validRpc && <p className="text-gray-700 dark:text-gray-300">Invalid RPC endpoint URL.</p>}
            {!validApi && <p className="text-gray-700 dark:text-gray-300">Invalid API endpoint URL.</p>}
          </div>
        </div>
      )
    }

    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Sparklit Wallet Watch</h1>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {uniqueAddresses.length} address{uniqueAddresses.length === 1 ? "" : "es"} • every {Math.round(interval / 1000)}s
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <WidgetErrorBoundary title="Balance Watcher">
            <WidgetContainer title="Balance Watcher" subtitle="Track SOL/SPL balances across wallets">
              <Suspense fallback={<WidgetSkeleton />}>
                <BalanceWatcherComponent
                  rpcEndpoint={rpcEndpoint}
                  addresses={uniqueAddresses}
                  pollIntervalMs={interval}
                />
              </Suspense>
            </WidgetContainer>
          </WidgetErrorBoundary>

          <WidgetErrorBoundary title="Transaction Watcher">
            <WidgetContainer title="Transaction Watcher" subtitle="Monitor incoming/outgoing transactions">
              <Suspense fallback={<WidgetSkeleton />}>
                <TransactionWatcherComponent
                  apiEndpoint={apiEndpoint}
                  addresses={uniqueAddresses}
                  pollIntervalMs={interval}
                />
              </Suspense>
            </WidgetContainer>
          </WidgetErrorBoundary>
        </div>
      </div>
    )
  }
)

WalletWatchDashboard.displayName = "WalletWatchDashboard"

export default WalletWatchDashboard
