import React, { Suspense, lazy, useState, useEffect } from "react"

const BalanceWatcherComponent     = lazy(() => import("./BalanceWatcherComponent"))
const TransactionWatcherComponent = lazy(() => import("./TransactionWatcherComponent"))

interface WalletWatchDashboardProps {
  rpcEndpoint: string
  apiEndpoint: string
  addresses: string[]
  pollIntervalMs?: number
}

const WidgetContainer: React.FC<{ title: string }> = ({ title, children }) => (
  <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow flex flex-col">
    <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">{title}</h2>
    <div className="flex-1">{children}</div>
  </section>
)

export const WalletWatchDashboard: React.FC<WalletWatchDashboardProps> = React.memo(({
  rpcEndpoint,
  apiEndpoint,
  addresses,
  pollIntervalMs = 10_000,
}) => {
  const [ready, setReady] = useState(false)

  // simulate any initial setup if needed
  useEffect(() => {
    // e.g. validate endpoints or fetch initial data
    setReady(true)
  }, [rpcEndpoint, apiEndpoint])

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-lg text-gray-600 dark:text-gray-400">Initializing dashboard…</span>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Sparklit Wallet Watch
        </h1>
        {/* Placeholder for settings or theme toggle */}
      </header>

      <Suspense fallback={
        <div className="text-center py-10 text-gray-700 dark:text-gray-300">
          Loading widgets…
        </div>
      }>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <WidgetContainer title="Balance Watcher">
            <BalanceWatcherComponent
              rpcEndpoint={rpcEndpoint}
              addresses={addresses}
              pollIntervalMs={pollIntervalMs}
            />
          </WidgetContainer>

          <WidgetContainer title="Transaction Watcher">
            <TransactionWatcherComponent
              apiEndpoint={apiEndpoint}
              addresses={addresses}
              pollIntervalMs={pollIntervalMs}
            />
          </WidgetContainer>
        </div>
      </Suspense>
    </div>
  )
})

WalletWatchDashboard.displayName = "WalletWatchDashboard"

export default WalletWatchDashboard
