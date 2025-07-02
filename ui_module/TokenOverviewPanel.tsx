
import React from "react"
import BalanceWatcherComponent from "./BalanceWatcherComponent"
import TransactionWatcherComponent from "./TransactionWatcherComponent"

interface WalletWatchDashboardProps {
  rpcEndpoint: string
  apiEndpoint: string
  addresses: string[]
}

export const WalletWatchDashboard: React.FC<WalletWatchDashboardProps> = ({
  rpcEndpoint,
  apiEndpoint,
  addresses,
}) => {
  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6">
      <h1 className="text-3xl font-bold">Sintra Wallet Watch</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BalanceWatcherComponent
          rpcEndpoint={rpcEndpoint}
          addresses={addresses}
          pollIntervalMs={10000}
        />
        <TransactionWatcherComponent
          apiEndpoint={apiEndpoint}
          addresses={addresses}
          pollIntervalMs={10000}
        />
      </div>
    </div>
  )
}

export default WalletWatchDashboard