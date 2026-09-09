import { spawn } from 'node:child_process';
import path from 'node:path';
import fs, { type WriteStream } from 'node:fs';
import fsp from 'node:fs/promises';
import { readJestCaseStatus, readPlaywrightCaseStatus } from './testResultParser';
import { updateRunCase, updateRunLifecycle, type TestExecutionStatus } from './testRunState';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

interface BackgroundTestCommand {
  label: string;
  caseId?: string;
  specFile?: string;
  testName?: string;
  fullName?: string;
  cwd: string;
  executable: string;
  args: string[];
  env?: Record<string, string>;
  resultFilePath: string;
  parser: 'jest' | 'playwright';
}

interface BackgroundRunnerPayload {
  appRoot: string;
  runId: string;
  label: string;
  logFilePath: string;
  logFileRelativePath: string;
  commands: BackgroundTestCommand[];
}

function buildCaseMatcher(command: BackgroundTestCommand): { caseId?: string; specFile?: string; testName?: string; fullName?: string } {
  return Object.fromEntries(
    Object.entries({
      caseId: command.caseId,
      specFile: command.specFile,
      testName: command.testName,
      fullName: command.fullName,
    }).filter(([, value]) => value !== undefined),
  );
}

function buildCasePatch(patch: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}

function buildResultMatcher(command: BackgroundTestCommand) {
  return Object.fromEntries(
    Object.entries({
      fullName: command.fullName,
      testName: command.testName,
    }).filter(([, value]) => value !== undefined),
  );
}

function formatCommand(command: BackgroundTestCommand): string {
  return [command.executable, ...command.args].join(' ');
}

async function executeCommand(
  payload: BackgroundRunnerPayload,
  command: BackgroundTestCommand,
  stream: WriteStream,
): Promise<{ exitCode: number; status: TestExecutionStatus }> {
  const startedAt = new Date().toISOString();
  await updateRunCase(
    payload.appRoot,
    payload.runId,
    buildCaseMatcher(command),
    buildCasePatch({ startedAt }),
  );

  stream.write(`\n[case] ${command.label}\n`);
  stream.write(`[cwd] ${command.cwd}\n`);
  stream.write(`$ ${formatCommand(command)}\n`);
  await fsp.rm(command.resultFilePath, { recursive: true, force: true });

  return new Promise(resolve => {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      env: { ...process.env, ...(command.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    child.stdout?.on('data', chunk => stream.write(chunk));
    child.stderr?.on('data', chunk => stream.write(chunk));

    child.once('error', async error => {
      stream.write(`\n[error] ${error.message}\n`);
      await updateRunCase(
        payload.appRoot,
        payload.runId,
        buildCaseMatcher(command),
        {
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: error.message,
        },
      );
      resolve({ exitCode: 1, status: 'failed' });
    });

    child.once('close', async code => {
      const exitCode = code ?? 1;
      stream.write(`\n[exit] ${exitCode}\n`);

      let status: TestExecutionStatus | null = null;
      if (command.parser === 'jest') {
        status = await readJestCaseStatus(command.resultFilePath, buildResultMatcher(command));
      } else {
        status = await readPlaywrightCaseStatus(command.resultFilePath, buildResultMatcher(command));
      }

      const finalStatus = status ?? (exitCode === 0 ? 'passed' : 'failed');
      await updateRunCase(
        payload.appRoot,
        payload.runId,
        buildCaseMatcher(command),
        buildCasePatch({
          status: finalStatus,
          finishedAt: new Date().toISOString(),
          error: exitCode === 0 ? undefined : `Command exited with code ${exitCode}`,
        }),
      );
      resolve({ exitCode, status: finalStatus });
    });
  });
}

async function run(): Promise<void> {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    throw new Error('Missing background test runner payload path.');
  }

  const payloadContent = await fsp.readFile(payloadPath, 'utf-8');
  const payload = JSON.parse(payloadContent) as BackgroundRunnerPayload;
  await fsp.mkdir(path.dirname(payload.logFilePath), { recursive: true });
  const stream = fs.createWriteStream(payload.logFilePath, { flags: 'a' });

  let exitCode = 0;
  await updateRunLifecycle(payload.appRoot, payload.runId, 'running', { startedAt: new Date().toISOString() });
  stream.write(`[run] ${payload.label}\n`);
  stream.write(`[id] ${payload.runId}\n`);
  stream.write(`[startedAt] ${new Date().toISOString()}\n`);

  for (const command of payload.commands) {
    const commandResult = await executeCommand(payload, command, stream);
    if (commandResult.exitCode !== 0) {
      exitCode = commandResult.exitCode;
    }
  }

  stream.write(`\n[finishedAt] ${new Date().toISOString()}\n`);
  stream.write(`[result] ${exitCode === 0 ? 'success' : 'failed'}\n`);
  await updateRunLifecycle(
    payload.appRoot,
    payload.runId,
    exitCode === 0 ? 'completed' : 'failed',
    { finishedAt: new Date().toISOString() },
  );

  await new Promise<void>(resolve => stream.end(resolve));
  await fsp.rm(payloadPath, { recursive: true, force: true });
  process.exit(exitCode);
}

void run().catch(async error => {
  const payloadPath = process.argv[2];
  if (payloadPath && (await pathExists(payloadPath))) {
    const payloadContent = await fsp.readFile(payloadPath, 'utf-8');
    const payload = JSON.parse(payloadContent) as BackgroundRunnerPayload;
    await fsp.mkdir(path.dirname(payload.logFilePath), { recursive: true });
    await fsp.appendFile(
      payload.logFilePath,
      `[fatal] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    await updateRunLifecycle(payload.appRoot, payload.runId, 'failed', {
      finishedAt: new Date().toISOString(),
    });
    await fsp.rm(payloadPath, { recursive: true, force: true });
  }

  process.exit(1);
});
