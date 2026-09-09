import { execSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import type { Server } from 'node:http';
import path from 'node:path';

import { hasDrumrFramework } from '../../utils/checkFramework.js';
import { findAvailablePort } from '../../utils/portChecker.js';
import { createTestServer } from '../../utils/testServer.js';

const UI_HTML_PATH = path.join(__dirname, '..', '..', 'templates', 'test-ui', 'index.html');
const TEST_PLANS_PATH = path.join('testsManagement', 'test-plans.json');

const DEFAULT_PORT = 4000;

export interface OpenTestsOptions {
  port?: number;
  noOpen?: boolean;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function openTests(
  cwd: string = process.cwd(),
  options: OpenTestsOptions = {},
): Promise<void> {
  const { port: requestedPort = DEFAULT_PORT, noOpen = false } = options;
  const testPlansPath = path.join(cwd, TEST_PLANS_PATH);

  if (!(await hasDrumrFramework(cwd))) {
    console.error(
      'This directory does not contain a Drumr application.\n' +
        "Run this command from your app's root directory.",
    );
    process.exit(1);
  }

  if (!(await pathExists(testPlansPath))) {
    console.error(
      'Required test infrastructure was not found in this application.\n' +
        `Missing file: ${testPlansPath}\n` +
        'Run "drumr tests setup" before using the Test Manager.',
    );
    process.exit(1);
  }

  const port = await findAvailablePort(requestedPort);
  if (port === null) {
    console.error(`Could not find an available port starting from ${requestedPort}. Please specify one with --port.`);
    process.exit(1);
  }

  if (port !== requestedPort) {
    console.warn(`Port ${requestedPort} is in use. Using port ${port} instead.`);
  }

  const url = `http://localhost:${port}`;
  console.log(`Starting Drumr Test Manager at ${url} ...`);

  const server = await createTestServer(cwd, port, UI_HTML_PATH);

  if (!noOpen) {
    openBrowser(url);
  }

  console.log(`Test Manager is running at ${url}`);
  console.log('Press Ctrl+C to stop.\n');

  await waitForShutdown(server);
  console.log('\nTest Manager stopped.');
}

function openBrowser(url: string): void {
  try {
    const platform = process.platform;
    if (platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else if (platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    }
  } catch {
    // Non-fatal
  }
}

function waitForShutdown(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const shutdown = () => {
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);

      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
