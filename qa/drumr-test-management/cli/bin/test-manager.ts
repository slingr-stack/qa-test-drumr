#!/usr/bin/env node
import { openTests } from '../commands/tests/open.js';
import { setupTests } from '../commands/tests/setup.js';

function printHelp(): void {
  console.log(`Drumr Test Manager

Usage:
  drumr-test-manager open    Start the local Test Manager web UI
  drumr-test-manager setup   Scaffold test infrastructure
  drumr-test-manager help    Show this help

Options for open:
  -p, --port <number>   Port for the local server (default: 4000)
      --no-open         Start without opening the browser`);
}

function parseOpenArgs(args: string[]): { port: number; noOpen: boolean } {
  let port = 4000;
  let noOpen = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-p' || arg === '--port') {
      const value = Number(args[i + 1]);
      if (!Number.isNaN(value)) {
        port = value;
        i++;
      }
    } else if (arg === '--no-open') {
      noOpen = true;
    }
  }

  return { port, noOpen };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'help';

  switch (command) {
    case 'open': {
      const { port, noOpen } = parseOpenArgs(args.slice(1));
      await openTests(process.cwd(), { port, noOpen });
      break;
    }
    case 'setup': {
      await setupTests(process.cwd());
      break;
    }
    case 'help':
    case '-h':
    case '--help':
    default:
      printHelp();
      break;
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});