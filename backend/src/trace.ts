import {
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PublicKey,
} from '@solana/web3.js';
import { connection, toPublicKey } from './solana.js';
import { TraceLayer, TraceResult, TransferEdge } from './types.js';

interface TraceOptions {
  depth: number;
  maxAddressesPerLayer: number;
  maxSignaturesPerAddress: number;
}

const DEFAULT_OPTIONS: TraceOptions = {
  depth: 0,
  maxAddressesPerLayer: Number(process.env.MAX_ADDRESSES_PER_LAYER || 5),
  maxSignaturesPerAddress: Number(process.env.MAX_SIGNATURES_PER_ADDRESS || 5),
};

function buildTokenAccountMap(tx: ParsedTransactionWithMeta): Map<string, { mint: string; decimals: number }>{
  const map = new Map<string, { mint: string; decimals: number }>();
  const accountKeys = tx.transaction.message.accountKeys.map((key) =>
    typeof key === 'string' ? key : key.pubkey.toString(),
  );

  const balances = [...(tx.meta?.preTokenBalances || []), ...(tx.meta?.postTokenBalances || [])];
  for (const balance of balances) {
    const account = accountKeys[balance.accountIndex];
    if (!account) continue;
    map.set(account, {
      mint: balance.mint,
      decimals: balance.uiTokenAmount.decimals,
    });
  }

  return map;
}

function normalizeUiAmount(rawAmount: string, decimals: number): string {
  if (!rawAmount) return '0';
  const sign = rawAmount.startsWith('-') ? '-' : '';
  const digits = rawAmount.replace('-', '');
  if (decimals <= 0) return `${sign}${digits}`;

  const padded = digits.padStart(decimals + 1, '0');
  const split = padded.length - decimals;
  const whole = padded.slice(0, split);
  const frac = padded.slice(split).replace(/0+$/, '');
  return frac.length ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
}

function parseParsedInstruction(
  ix: ParsedInstruction,
  signature: string,
  slot: number,
  tokenAccountMap: Map<string, { mint: string; decimals: number }>,
): TransferEdge[] {
  if (!ix.parsed || typeof ix.parsed !== 'object') return [];
  const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> };
  const info = parsed.info || {};
  const type = parsed.type || 'unknown';

  if (ix.program === 'system' && type === 'transfer') {
    const from = String(info.source || '');
    const to = String(info.destination || '');
    const lamports = String(info.lamports || '0');
    return [
      {
        from,
        to,
        mint: 'SOL',
        program: 'system',
        rawAmount: lamports,
        uiAmount: normalizeUiAmount(lamports, 9),
        decimals: 9,
        signature,
        slot,
        instructionType: 'system.transfer',
      },
    ];
  }

  if (ix.program === 'spl-token' && (type === 'transfer' || type === 'transferChecked')) {
    const from = String((info as any).source || '');
    const to = String((info as any).destination || '');
    const rawAmount = String((info as any).amount || (info as any).tokenAmount?.amount || '0');
    const explicitMint = (info as any).mint ? String((info as any).mint) : null;
    const mintInfo = tokenAccountMap.get(from) || tokenAccountMap.get(to);
    const mint = explicitMint || mintInfo?.mint || 'UNKNOWN_MINT';
    const decimals = (info as any).tokenAmount?.decimals ?? mintInfo?.decimals ?? 0;
    const uiAmount = (info as any).tokenAmount?.uiAmountString
      ? String((info as any).tokenAmount.uiAmountString)
      : normalizeUiAmount(rawAmount, decimals);

    return [
      {
        from,
        to,
        mint,
        program: 'spl-token',
        rawAmount,
        uiAmount,
        decimals,
        signature,
        slot,
        instructionType: `spl-token.${type}`,

      },
    ];
  }

  return [];
}

function parseTransfersFromTransaction(tx: ParsedTransactionWithMeta, signature: string): TransferEdge[] {
  const tokenAccountMap = buildTokenAccountMap(tx);
  const slot = tx.slot;

  const transfers: TransferEdge[] = [];
  for (const ix of tx.transaction.message.instructions) {
    if ('parsed' in ix) {
      transfers.push(...parseParsedInstruction(ix as ParsedInstruction, signature, slot, tokenAccountMap));
    }
  }

  const inner = tx.meta?.innerInstructions || [];
  for (const innerBlock of inner) {
    for (const ix of innerBlock.instructions) {
      if ('parsed' in ix) {
        transfers.push(...parseParsedInstruction(ix as ParsedInstruction, signature, slot, tokenAccountMap));
      }
    }
  }

  return transfers;
}

async function fetchParsedTransaction(signature: string): Promise<ParsedTransactionWithMeta | null> {
  return connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  });
}

export async function traceSignature(signature: string, options?: Partial<TraceOptions>): Promise<TraceResult> {
  const merged: TraceOptions = { ...DEFAULT_OPTIONS, ...options };
  const root = await fetchParsedTransaction(signature);
  if (!root) {
    throw new Error('Transaction not found or not yet confirmed.');
  }

  const layers: TraceLayer[] = [];
  const rootTransfers = parseTransfersFromTransaction(root, signature);
  layers.push({ depth: 0, transfers: rootTransfers });

  const seenAddresses = new Set<string>();
  const seenSignatures = new Set<string>([signature]);
  let currentRecipients = Array.from(new Set(rootTransfers.map((t) => t.to)));

  for (let depth = 1; depth <= merged.depth; depth += 1) {
    const nextTransfers: TransferEdge[] = [];
    const limitedRecipients = currentRecipients.slice(0, merged.maxAddressesPerLayer);

    for (const address of limitedRecipients) {
      if (seenAddresses.has(address)) continue;
      seenAddresses.add(address);

      let publicKey: PublicKey;
      try {
        publicKey = toPublicKey(address);
      } catch {
        continue;
      }

      const signatures = await connection.getSignaturesForAddress(publicKey, {
        limit: merged.maxSignaturesPerAddress,
      });

      for (const sigInfo of signatures) {
        if (seenSignatures.has(sigInfo.signature)) continue;
        seenSignatures.add(sigInfo.signature);

        const tx = await fetchParsedTransaction(sigInfo.signature);
        if (!tx) continue;

        const transfers = parseTransfersFromTransaction(tx, sigInfo.signature);
        const outgoing = transfers.filter((t) => t.from === address);
        if (outgoing.length) {
          nextTransfers.push(...outgoing);
        }
      }
    }

    if (!nextTransfers.length) break;
    layers.push({ depth, transfers: nextTransfers });
    currentRecipients = Array.from(new Set(nextTransfers.map((t) => t.to)));
  }

  return {
    signature,
    slot: root.slot,
    blockTime: root.blockTime ?? null,
    layers,
  };
}
