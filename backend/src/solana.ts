import { Connection, PublicKey } from '@solana/web3.js';

const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export const connection = new Connection(rpcUrl, 'confirmed');

export function toPublicKey(address: string): PublicKey {
  return new PublicKey(address);
}
