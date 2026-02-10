import { useEffect, useMemo, useState } from 'react';
import mermaid from 'mermaid';
import { TraceResult, traceSignature } from './api';

const truncate = (value: string, head = 4, tail = 4) =>
  value.length > head + tail ? `${value.slice(0, head)}...${value.slice(-tail)}` : value;

function buildMermaid(result: TraceResult): { code: string; nodeLabels: Map<string, string> } {
  const nodeLabels = new Map<string, string>();
  const nodeIds = new Map<string, string>();
  let counter = 0;

  const getNodeId = (address: string) => {
    if (!nodeIds.has(address)) {
      nodeIds.set(address, `N${counter++}`);
      nodeLabels.set(address, truncate(address, 6, 6));
    }
    return nodeIds.get(address)!;
  };

  const lines: string[] = ['graph LR'];
  for (const layer of result.layers) {
    for (const transfer of layer.transfers) {
      const fromId = getNodeId(transfer.from);
      const toId = getNodeId(transfer.to);
      const tokenLabel = transfer.mint === 'SOL' ? 'SOL' : truncate(transfer.mint, 4, 4);
      const label = `${transfer.uiAmount} ${tokenLabel}`;
      lines.push(`${fromId} -->|${label}| ${toId}`);
    }
  }

  for (const [address, id] of nodeIds.entries()) {
    const label = nodeLabels.get(address) || truncate(address, 6, 6);
    lines.push(`${id}[${label}]`);
  }

  return { code: lines.join('\n'), nodeLabels };
}

export default function App() {
 const [signature, setSignature] = useState('');
 const [depth, setDepth] = useState(0);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [result, setResult] = useState<TraceResult | null>(null);
 const [graphSvg, setGraphSvg] = useState<string | null>(null);

 const mermaidCode = useMemo(() => (result ? buildMermaid(result).code : ''), [result]);

 useEffect(() => {
 mermaid.initialize({
 startOnLoad: false,
 theme: 'base',
 themeVariables: {
 primaryColor: '#e3f5ff',
 primaryBorderColor: '#0f172a',
 primaryTextColor: '#0f172a',
 lineColor: '#0f172a',
 fontFamily: 'Space Grotesk, sans-serif',
 },
 });
 }, []);

 useEffect(() => {
 if (!mermaidCode) {
 setGraphSvg(null);
 return;
 }

 const render = async () => {
 try {
 const { svg } = await mermaid.render('graph-svg', mermaidCode);
 setGraphSvg(svg);
 } catch {
 setGraphSvg(null);
 }
 };

 render();
 }, [mermaidCode]);

 const onSubmit = async () => {
 if (!signature.trim()) return;
 setLoading(true);
 setError(null);
 setResult(null);

 try {
 const data = await traceSignature(signature.trim(), depth);
 setResult(data);
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Trace failed');
 } finally {
 setLoading(false);
 }
 };

 return (
 <div className=page>
 <header className=hero>
 <div>
 <p className=eyebrow>Solana Transaction Tracing</p>
 <h1>sol-trace</h1>
 <p className=subtitle>
 Trace SOL and SPL Token transfers from any transaction signature. Explore multi-hop flows with a
 depth-limited sweep.
 </p>
 </div>
 <div className=stat-grid>
 <div>
 <span>Input</span>
 <strong>Tx Signature</strong>
 </div>
 <div>
 <span>Output</span>
 <strong>Flow Graph + JSON</strong>
 </div>
 <div>
 <span>Depth</span>
 <strong>0-3 hops</strong>
 </div>
 </div>
 </header>

 <section className=panel>
 <div className=field>
 <label htmlFor=signature>Transaction Signature</label>
 <input
 id=signature
 value={signature}
 onChange={(event) => setSignature(event.target.value)}
 placeholder=e.g. 4xKu...aBcD
 />
 </div>
 <div className=field>
 <label htmlFor=depth>Trace Depth</label>
 <select id=depth value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
 <option value={0}>0 (single tx)</option>
 <option value={1}>1 hop</option>
 <option value={2}>2 hops</option>
 <option value={3}>3 hops</option>
 </select>
 </div>
 <button className=primary onClick={onSubmit} disabled={loading}>
 {loading ? 'Tracing...' : 'Trace'}
 </button>
 </section>

 {error && <div className=error>{error}</div>}

 {result && (
 <section className=grid>
 <div className=card>
 <h2>Trace Summary</h2>
 <div className=meta>
 <span>Signature</span>
 <strong>{result.signature}</strong>
 </div>
 <div className=meta>
 <span>Slot</span>
 <strong>{result.slot}</strong>
 </div>
 <div className=meta>
 <span>Block Time</span>
 <strong>{result.blockTime ? new Date(result.blockTime * 1000).toLocaleString() : 'n/a'}</strong>
 </div>
 </div>

 <div className=card>
 <h2>Mermaid Flow</h2>
 <div className=graph dangerouslySetInnerHTML={graphSvg ? { __html: graphSvg } : undefined} />
 {!graphSvg && <p className=muted>Graph rendering failed. Use the Mermaid code below.</p>}
 </div>

 <div className=card>
 <h2>Mermaid Code</h2>
 <textarea readOnly value={mermaidCode} />
 </div>

 <div className=card>
 <h2>Transfers by Layer</h2>
 {result.layers.map((layer) => (
 <div key={layer.depth} className=layer>
 <h3>Layer {layer.depth}</h3>
 {layer.transfers.length === 0 && <p className=muted>No transfers parsed.</p>}
 {layer.transfers.map((transfer, index) => (
 <div key={${transfer.signature}-} className=transfer>
 <div>
 <span>From</span>
 <strong>{transfer.from}</strong>
 </div>
 <div>
 <span>To</span>
 <strong>{transfer.to}</strong>
 </div>
 <div>
 <span>Amount</span>
 <strong>
 {transfer.uiAmount} {transfer.mint === 'SOL' ? 'SOL' : transfer.mint}
 </strong>
 </div>
 <div>
 <span>Instruction</span>
 <strong>{transfer.instructionType}</strong>
 </div>
 </div>
 ))}
 </div>
 ))}
 </div>

 <div className=card>
 <h2>Raw JSON</h2>
 <textarea readOnly value={JSON.stringify(result, null, 2)} />
 </div>
 </section>
 )}
 </div>
 );
}
