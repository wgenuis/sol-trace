export type TokenProgram = 'system' | 'spl-token' | 'unknown';

export interface TransferEdge {
  from: string;
  to: string;
  mint: string;
  program: TokenProgram;
  rawAmount: string;
  uiAmount: string;
  decimals: number;
  signature: string;
  slot: number;
  instructionType: string;
}

export interface TraceLayer {
  depth: number;
  transfers: TransferEdge[];
}

export interface TraceResult {
  signature: string;
  slot: number;
  blockTime: number | null;
  layers: TraceLayer[];
}
