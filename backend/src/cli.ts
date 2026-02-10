#!/usr/bin/env node
import { traceSignature } from './trace.js';
import fs from 'fs/promises';

function printHelp() {
  console.log('');
  console.log('Usage: sol-trace <transaction-signature> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --depth <number>   Trace depth (default: 0)');
  console.log('  --json             Output as JSON');
  console.log('  --output <file>    Output JSON to specified file');
  console.log('  --help, -h         Show this help message');
  console.log('');
  console.log('Example:');
  console.log('  sol-trace 4xKu...aBcD --depth 2');
  console.log('  sol-trace 4xKu...aBcD --json --output trace.json');
  console.log('');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const signatureIndex = args.findIndex(arg => !arg.startsWith('--'));
  
  if (signatureIndex === -1 || args[signatureIndex] === '--help' || args[signatureIndex] === '-h') {
    printHelp();
    process.exit(0);
  }

  const signature = args[signatureIndex];
  const depthArg = args.find(arg => arg.startsWith('--depth='));
  const depth = depthArg ? parseInt(depthArg.split('=')[1], 10) : 0;
  const outputJson = args.includes('--json');
  
  const outputArgIndex = args.findIndex(arg => arg.startsWith('--output='));
  const outputFile = outputArgIndex !== -1 ? args[outputArgIndex].split('=')[1] : null;

  return { signature, depth, outputJson, outputFile };
}

function printTree(result: any) {
  console.log('');
  console.log('🔍 Tracing transaction:', result.signature);
  console.log('');

  for (const layer of result.layers) {
    console.log(`Layer ${layer.depth}:`);
    console.log('');
    
    if (layer.transfers.length === 0) {
      console.log('  No transfers found.');
      console.log('');
      continue;
    }

    for (const transfer of layer.transfers) {
      const from = transfer.from.length > 20 ? `${transfer.from.slice(0, 4)}...${transfer.from.slice(-4)}` : transfer.from;
      const to = transfer.to.length > 20 ? `${transfer.to.slice(0, 4)}...${transfer.to.slice(-4)}` : transfer.to;
      const mint = transfer.mint === 'SOL' ? 'SOL' : `${transfer.mint.slice(0, 4)}...${transfer.mint.slice(-4)}`;
      
      console.log(`  → From: ${from}`);
      console.log(`  → To:   ${to}`);
      console.log(`  → Token: ${mint}`);
      console.log(`  → Amount: ${transfer.uiAmount}`);
      console.log('');
    }
  }

  console.log('✅ Trace complete.');
  console.log('');
}

async function main() {
  try {
    const { signature, depth, outputJson, outputFile } = parseArgs();
    const result = await traceSignature(signature, { depth });

    if (outputFile) {
      // Write to file regardless of --json flag
      await fs.writeFile(outputFile, JSON.stringify(result, null, 2));
      console.log(`✅ Trace result written to: ${outputFile}`);
    } else if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printTree(result);
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();
