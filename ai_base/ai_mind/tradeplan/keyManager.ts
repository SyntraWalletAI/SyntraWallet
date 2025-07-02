import { Keypair } from '@solana/web3.js'
import * as nacl from 'tweetnacl'
import * as bs58 from 'bs58'

export interface EncryptedKey {
  publicKey: string
  encryptedSecret: string
  nonce: string
}

export class KeyManager {
  private masterKey: Uint8Array

  constructor(masterSeed: Uint8Array) {
    this.masterKey = masterSeed
  }

  generate(): Keypair {
    return Keypair.generate()
  }

  encrypt(keypair: Keypair): EncryptedKey {
    const secret = keypair.secretKey
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
    const box = nacl.secretbox(secret, nonce, this.masterKey)
    return {
      publicKey: keypair.publicKey.toBase58(),
      encryptedSecret: bs58.encode(box),
      nonce: bs58.encode(nonce)
    }
  }

  decrypt(data: EncryptedKey): Keypair {
    const nonce = bs58.decode(data.nonce)
    const box = bs58.decode(data.encryptedSecret)
    const secret = nacl.secretbox.open(box, nonce, this.masterKey)
    if (!secret) throw new Error('decryption failed')
    return Keypair.fromSecretKey(Uint8Array.from(secret))
  }

  rotateMasterKey(newSeed: Uint8Array): void {
    this.masterKey = newSeed
  }

  exportEncryptedKey(data: EncryptedKey): string {
    return JSON.stringify(data)
  }

  importEncryptedKey(json: string): EncryptedKey {
    return JSON.parse(json)
  }

  deriveSubKey(path: string): Uint8Array {
    const encoder = new TextEncoder()
    const info = encoder.encode(path)
    return nacl.hash(new Uint8Array([...this.masterKey, ...info])).slice(0, nacl.secretbox.keyLength)
  }
}
