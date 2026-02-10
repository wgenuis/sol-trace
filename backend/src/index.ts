import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { traceSignature } from './trace.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const TraceRequest = z.object({
  signature: z.string().min(10),
  depth: z.number().int().min(0).max(3).optional(),
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/trace', async (req, res) => {
  const parsed = TraceRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  try {
    const result = await traceSignature(parsed.data.signature, {
      depth: parsed.data.depth ?? 0,
    });
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`sol-trace backend listening on http://localhost:${port}`);
});
