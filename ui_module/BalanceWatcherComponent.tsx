import React, { useEffect, useState } from "react"
import { BalanceWatcher, BalanceChange } from "./BalanceWatcher"

interface BalanceWatcherComponentProps {
  rpcEndpoint: string
  addresses: string[]
  pollIntervalMs?: number
}

export const BalanceWatcherComponent: React.FC<BalanceWatcherComponentProps> = ({
  rpcEndpoint,
  addresses,
  pollIntervalMs = 15000,
}) => {
  const [changes, setChanges] = useState<BalanceChange[]>([])

  useEffect(() => {
    const watcher = new BalanceWatcher(rpcEndpoint, pollIntervalMs)
    watcher.start(addresses, change => {
      setChanges(prev => [change, ...prev].slice(0, 20))
    })
    return () => {
      watcher.stop()
    }
  }, [rpcEndpoint, addresses, pollIntervalMs])

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-xl font-semibold mb-2">Balance Changes</h2>
      {changes.length === 0 ? (
        <p>No changes yet.</p>
      ) : (
        <ul className="list-disc list-inside space-y-1">
          {changes.map((c, i) => (
            <li key={i}>
              <strong>{c.walletAddress}</strong>: {c.oldBalance} → {c.newBalance} at{" "}
              {new Date(c.timestamp).toLocaleTimeString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default BalanceWatcherComponent