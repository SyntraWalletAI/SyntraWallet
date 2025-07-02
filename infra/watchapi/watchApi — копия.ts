
import { WatchApi } from './watchApi'
import { AccountChangeCallback } from './watchApi'

export class WatchService {
    private api: WatchApi
    private subscriptions: Map<string, number> = new Map()

    constructor(rpcUrl: string) {
        this.api = new WatchApi(rpcUrl)
    }

    /**
     * Start watching an array of wallet addresses
     * @param addresses Array of base58 encoded public keys
     * @param onChange Function to handle account changes
     */
    startWatching(addresses: string[], onChange: AccountChangeCallback): void {
        addresses.forEach(addr => {
            if (!this.subscriptions.has(addr)) {
                const subId = this.api.subscribeAccount(addr, onChange)
                this.subscriptions.set(addr, subId)
            }
        })
    }

    /**
     * Stop watching the given addresses
     * @param addresses Array of addresses to stop watching
     */
    stopWatching(addresses: string[]): void {
        addresses.forEach(addr => {
            const subId = this.subscriptions.get(addr)
            if (subId !== undefined) {
                this.api.unsubscribeAccount(subId)
                this.subscriptions.delete(addr)
            }
        })
    }

    /**
     * Poll balances for watched addresses
     */
    async pollBalances(): Promise<Map<string, number>> {
        const results = new Map<string, number>()
        for (const addr of this.subscriptions.keys()) {
            const balance = await this.api.getBalance(addr)
            results.set(addr, balance)
        }
        return results
    }

    /**
     * Fetch and log recent transaction history for watched addresses
     * @param limit Number of recent transactions per address
     */
    async logRecentTransactions(limit: number = 10): Promise<void> {
        for (const addr of this.subscriptions.keys()) {
            const sigs = await this.api.getRecentSignatures(addr, limit)
            console.log(`Recent transactions for ${addr}:`, sigs)
        }
    }
}
