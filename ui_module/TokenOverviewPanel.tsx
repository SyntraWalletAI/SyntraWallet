import React, { Suspense, lazy } from "react"

// Lazy‐load watcher components for faster initial render
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
}) => (
  <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen space-y-6">
    <header className="flex items-center justify-between">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
        Sintra Wallet Watch
      </h1>
      {/* Future spot for settings or theme toggle */}
    </header>

    <Suspense fallback={<div className="text-center py-10">Loading widgets…</div>}>
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
))

export default WalletWatchDashboard
