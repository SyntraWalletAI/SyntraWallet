import React, { useEffect, useMemo, useRef, useState } from "react"
import { BalanceWatcher, BalanceChange } from "./BalanceWatcher"

interface BalanceWatcherComponentProps {
  rpcEndpoint: string
  addresses: string[]
  pollIntervalMs?: number
  concurrency?: number
  method?: string
  timeoutMs?: number
  retries?: number
  backoffMs?: number
  runImmediate?: boolean
  /** Keep at most this many recent change records in memory */
  maxRecords?: number
}

/**
 * React component that renders live balance changes for a set of addresses
 * Uses the BalanceWatcher service with typed events and safe lifecycle handling
 */
export const BalanceWatcherComponent: React.FC<BalanceWatcherComponentProps> = ({
  rpcEndpoint,
  addresses,
  pollIntervalMs = 15_000,
  concurrency = 5,
  method = "getBalance",
  timeoutMs = 10_000,
  retries = 2,
  backoffMs = 300,
  runImmediate = true,
  maxRecords = 30,
}) => {
  const [changes, setChanges] = useState<BalanceChange[]>([])
  const [running, setRunning] = useState(false)
  const [lastTick, setLastTick] = useState<number | null>(null)
  const [errors, setErrors] = useState<Array<{ walletAddress: string; error: string }>>([])

  const watcherRef = useRef<BalanceWatcher | null>(null)

  // Avoid re-subscribing when addresses array identity changes but contents are the same
  const dedupedAddresses = useMemo(() => Array.from(new Set(addresses)).filter(Boolean), [addresses])

  useEffect(() => {
    if (!rpcEndpoint || dedupedAddresses.length === 0) {
      setRunning(false)
      return
    }

    const watcher = new BalanceWatcher(rpcEndpoint, {
      pollIntervalMs,
      concurrency,
      method,
      timeoutMs,
      retries,
      backoffMs,
      runImmediate,
    })

    watcherRef.current = watcher
    watcher.setAddresses(dedupedAddresses)

    const onStart = (list: string[]) => {
      setRunning(true)
      // prime UI for a fresh run
      setErrors([])
      // do not clear changes to keep history visible across restarts
    }

    const onStop = () => {
      setRunning(false)
    }

    const onTick = (ts: number) => {
      setLastTick(ts)
    }

    const onChange = (change: BalanceChange) => {
      setChanges((prev) => [change, ...prev].slice(0, Math.max(1, maxRecords)))
    }

    const onError = (e: { walletAddress: string; error: string }) => {
      setErrors((prev) => [e, ...prev].slice(0, 20))
    }

    watcher.on("start", onStart)
    watcher.on("stop", onStop)
    watcher.on("tick", onTick)
    watcher.on("change", onChange)
    watcher.on("error", onError)

    watcher.start()

    return () => {
      watcher.off("start", onStart)
      watcher.off("stop", onStop)
      watcher.off("tick", onTick)
      watcher.off("change", onChange)
      watcher.off("error", onError)
      watcher.stop()
      watcherRef.current = null
    }
  }, [
    rpcEndpoint,
    dedupedAddresses,
    pollIntervalMs,
    concurrency,
    method,
    timeoutMs,
    retries,
    backoffMs,
    runImmediate,
    maxRecords,
  ])

  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold">Balance Changes</h2>
        <div className="text-sm text-gray-600">
          {running ? "watching" : "stopped"} • {dedupedAddresses.length} addresses
          {lastTick ? ` • last tick ${new Date(lastTick).toLocaleTimeString()}` : ""}
        </div>
      </div>

      {changes.length === 0 ? (
        <p className="text-sm text-gray-600">No changes yet</p>
      ) : (
        <ul className="list-disc list-inside space-y-1">
          {changes.map((c, i) => (
            <li key={`${c.walletAddress}-${c.timestamp}-${i}`} className="text-sm">
              <span className="font-mono font-semibold">{c.walletAddress}</span>:{" "}
              <span className="font-mono">{c.oldBalance}</span> →{" "}
              <span className="font-mono">{c.newBalance}</span> at{" "}
              <span className="font-mono">{new Date(c.timestamp).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-red-600">Recent errors</h3>
          <ul className="mt-1 space-y-1">
            {errors.map((e, idx) => (
              <li key={`${e.walletAddress}-${idx}`} className="text-xs text-red-600">
                {e.walletAddress}: {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default BalanceWatcherComponent

/*
filename options
- balance_watcher_component.tsx
- wallet_balance_feed.tsx
- live_balance_changes.tsx
*/
