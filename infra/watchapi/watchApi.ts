
import { Connection, PublicKey, Commitment, AccountInfo } from '@solana/web3.js'

export interface AccountChangeCallback {
    (accountInfo: AccountInfo<Buffer>, context: { slot: number }): void
}

export class WatchApi {
    private connection: Connection
    private commitment: Commitment

    constructor(rpcUrl: string, commitment: Commitment = 'confirmed') {
        this.connection = new Connection(rpcUrl, commitment)
        this.commitment = commitment
    }

    /**
     * Subscribe to account data changes for the given publicKey
     * @param publicKeyString Base58 encoded public key string
     * @param callback Function to call when account data changes
     * @returns subscriptionId which can be used to unsubscribe
     */
    subscribeAccount(
        publicKeyString: string,
        callback: AccountChangeCallback
    ): number {
        const publicKey = new PublicKey(publicKeyString)
        const subscriptionId = this.connection.onAccountChange(
            publicKey,
            callback,
            this.commitment
        )
        return subscriptionId
    }

    /**
     * Unsubscribe from account data changes
     * @param subscriptionId ID returned by subscribeAccount
     */
    unsubscribeAccount(subscriptionId: number): void {
        this.connection.removeAccountChangeListener(subscriptionId)
    }

    /**
     * Fetch current account balance in lamports
     * @param publicKeyString Base58 encoded public key string
     */
    async getBalance(publicKeyString: string): Promise<number> {
        const publicKey = new PublicKey(publicKeyString)
        const balance = await this.connection.getBalance(publicKey, this.commitment)
        return balance
    }

    /**
     * Fetch recent transaction signatures for the given publicKey
     * @param publicKeyString Base58 encoded public key string
     * @param limit Number of signatures to fetch
     */
    async getRecentSignatures(publicKeyString: string, limit: number = 20): Promise<string[]> {
        const publicKey = new PublicKey(publicKeyString)
        const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit })
        return signatures.map(sigInfo => sigInfo.signature)
    }

    /**
     * Fetch parsed transaction data by signature
     * @param signature Transaction signature
     */
    async getParsedTransaction(signature: string) {
        const transaction = await this.connection.getParsedTransaction(signature, this.commitment)
        return transaction
    }
}
