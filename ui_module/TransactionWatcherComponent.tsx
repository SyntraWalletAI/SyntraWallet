import React, { useEffect, useState } from "react"
import { TransactionWatcher, TransactionEvent } from "./TransactionWatcher"

interface TransactionWatcherComponentProps {
  apiEndpoint: string
  addresses: string[]
  pollIntervalMs?: number
}

export const TransactionWatcherComponent: React.FC<TransactionWatcherComponentProps> = ({
  apiEndpoint,
  addresses,
  pollIntervalMs = 15000,
}) => {
  const [events, setEvents] = useState<TransactionEvent[]>([])

  useEffect(() => {
    const watcher = new TransactionWatcher(apiEndpoint, pollIntervalMs)
    watcher.start(addresses, evt => {
      setEvents(prev => [evt, ...prev].slice(0, 20))
    })
    return () => {
      watcher.stop()
    }
  }, [apiEndpoint, addresses, pollIntervalMs])

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-xl font-semibold mb-2">Recent Transactions</h2>
      {events.length === 0 ? (
        <p>No transactions yet.</p>
      ) : (
        <ul className="list-decimal list-inside space-y-1 font-mono text-sm">
          {events.map((e, i) => (
            <li key={i}>
              <span className="text-blue-600">{e.txHash}</span> in block {e.blockNumber} at{" "}
              {new Date(e.timestamp).toLocaleTimeString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default TransactionWatcherComponent