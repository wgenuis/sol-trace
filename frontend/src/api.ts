export interface TransferEdge {
  from: string;
  to: string;
  mint: string;
  program: string;
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

export async function traceSignature(signature: string, depth: number): Promise<TraceResult> {
  const response = await fetch('http://localhost:8787/api/trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature, depth }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'Trace failed');
  }

  return payload as TraceResult;
}
