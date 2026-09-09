import fsp from 'node:fs/promises';
import type { TestExecutionStatus } from './testRunState';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

interface ResultMatcher {
  fullName?: string;
  testName?: string;
}

export interface TestCaseResultSummary {
  status: TestExecutionStatus;
  title?: string;
  details?: string;
}

function withOptionalProps<T extends object>(base: T, optional: Record<string, unknown>): T {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
  };
}

function mapJestStatus(status: string | undefined): TestExecutionStatus {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'pending':
      return 'pending';
    case 'skipped':
    case 'todo':
      return 'skipped';
    default:
      return 'failed';
  }
}

function mapPlaywrightStatus(status: string | undefined): TestExecutionStatus {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'skipped':
      return 'skipped';
    case 'interrupted':
    case 'timedOut':
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

function collectPlaywrightTests(node: unknown, tests: Array<{ title?: string; results?: Array<{ status?: string }>; status?: string }>): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray((node as { tests?: unknown[] }).tests)) {
    tests.push(...((node as { tests?: Array<{ title?: string; results?: Array<{ status?: string }>; status?: string }> }).tests ?? []));
  }

  for (const key of ['suites', 'specs']) {
    const children = (node as Record<string, unknown>)[key];
    if (Array.isArray(children)) {
      for (const child of children) {
        collectPlaywrightTests(child, tests);
      }
    }
  }
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function trimRelevantLines(value: string, maxLines = 12): string {
  const lines = stripAnsi(value)
    .split(/\r?\n/)
    .map(line => line.replace(/\s+$/g, ''))
    .filter((line, index, all) => line.trim() || (index > 0 && index < all.length - 1));

  return lines.slice(0, maxLines).join('\n').trim();
}

function pickMatcherTitle(matcher: ResultMatcher): string | undefined {
  return matcher.fullName || matcher.testName;
}

async function readJestCaseResultSummary(resultFilePath: string, matcher: ResultMatcher = {}): Promise<TestCaseResultSummary | null> {
  if (!(await pathExists(resultFilePath))) {
    return null;
  }

  const content = await fsp.readFile(resultFilePath, 'utf-8');
  const data = JSON.parse(content) as {
    numFailedTests?: number;
    numPassedTests?: number;
    numPendingTests?: number;
    numTodoTests?: number;
    numTotalTests?: number;
    testResults?: Array<{
      status?: string;
      message?: string;
      assertionResults?: Array<{
        status?: string;
        title?: string;
        fullName?: string;
        failureMessages?: string[];
      }>;
    }>;
  };

  const totalTests = Number(data.numTotalTests ?? 0);
  const pendingTests = Number(data.numPendingTests ?? 0) + Number(data.numTodoTests ?? 0);
  const assertions = data.testResults?.flatMap(item => item.assertionResults ?? []) ?? [];
  const matchedAssertion = assertions.find(assertion =>
    (matcher.fullName && assertion.fullName === matcher.fullName) ||
    (matcher.testName && assertion.title === matcher.testName),
  );

  if (matchedAssertion) {
    return withOptionalProps({
      status: mapJestStatus(matchedAssertion.status),
    }, {
      title: matchedAssertion.fullName || matchedAssertion.title || pickMatcherTitle(matcher),
      details: matchedAssertion.status === 'failed'
        ? trimRelevantLines((matchedAssertion.failureMessages ?? []).join('\n\n')) || undefined
        : undefined,
    });
  }

  if (assertions.length > 0 && assertions.every(item => item.status === 'pending' || item.status === 'todo' || item.status === 'skipped')) {
    return withOptionalProps({
      status: 'skipped' as const,
    }, {
      title: pickMatcherTitle(matcher),
    });
  }

  const firstAssertion = assertions[0];
  if (firstAssertion) {
    return withOptionalProps({
      status: mapJestStatus(firstAssertion.status),
    }, {
      title: firstAssertion.fullName || firstAssertion.title || pickMatcherTitle(matcher),
      details: firstAssertion.status === 'failed'
        ? trimRelevantLines((firstAssertion.failureMessages ?? []).join('\n\n')) || undefined
        : undefined,
    });
  }

  const suite = data.testResults?.find(item => item.status || item.message);
  const suiteStatus = suite?.status;
  if (suiteStatus === 'skipped' || suiteStatus === 'pending' || (totalTests > 0 && pendingTests >= totalTests)) {
    return withOptionalProps({
      status: 'skipped' as const,
    }, {
      title: pickMatcherTitle(matcher),
    });
  }

  if (suiteStatus === 'failed') {
    return withOptionalProps({
      status: 'failed' as const,
    }, {
      title: pickMatcherTitle(matcher),
      details: trimRelevantLines(suite?.message ?? '') || undefined,
    });
  }

  return null;
}

async function readPlaywrightCaseResultSummary(resultFilePath: string, matcher: ResultMatcher = {}): Promise<TestCaseResultSummary | null> {
  if (!(await pathExists(resultFilePath))) {
    return null;
  }

  const content = await fsp.readFile(resultFilePath, 'utf-8');
  const data = JSON.parse(content) as Record<string, unknown> & {
    errors?: Array<{ message?: string; stack?: string; snippet?: string }>;
  };
  const tests: Array<{
    title?: string;
    results?: Array<{ status?: string; error?: { message?: string; value?: string }; errors?: Array<{ message?: string; value?: string }> }>;
    status?: string;
  }> = [];
  collectPlaywrightTests(data, tests as Array<{ title?: string; results?: Array<{ status?: string }>; status?: string }>);
  const matchedTest = tests.find(test =>
    (matcher.fullName && test.title === matcher.fullName) ||
    (matcher.testName && test.title === matcher.testName),
  ) ?? tests[0];
  if (!matchedTest) {
    const topLevelDetails = trimRelevantLines(
      (data.errors ?? [])
        .flatMap(error => [error.message, error.stack, error.snippet])
        .filter(Boolean)
        .join('\n\n'),
    ) || undefined;

    return topLevelDetails
      ? withOptionalProps({
          status: 'failed' as const,
        }, {
          title: pickMatcherTitle(matcher),
          details: topLevelDetails,
        })
      : null;
  }

  const latestResult = matchedTest.results?.at(-1);
  const details = latestResult
    ? trimRelevantLines(
        [
          latestResult.error?.message,
          latestResult.error?.value,
          ...(latestResult.errors ?? []).flatMap(error => [error.message, error.value]),
        ].filter(Boolean).join('\n\n'),
      ) || undefined
    : undefined;

  const topLevelDetails = trimRelevantLines(
    (data.errors ?? [])
      .flatMap(error => [error.message, error.stack, error.snippet])
      .filter(Boolean)
      .join('\n\n'),
  ) || undefined;

  return withOptionalProps({
    status: mapPlaywrightStatus(latestResult?.status ?? matchedTest.status),
  }, {
    title: matchedTest.title || pickMatcherTitle(matcher),
    details: details || topLevelDetails,
  });
}

export async function readJestCaseStatus(resultFilePath: string, matcher: ResultMatcher = {}): Promise<TestExecutionStatus | null> {
  const summary = await readJestCaseResultSummary(resultFilePath, matcher);
  return summary?.status ?? null;
}

export async function readPlaywrightCaseStatus(resultFilePath: string, matcher: ResultMatcher = {}): Promise<TestExecutionStatus | null> {
  const summary = await readPlaywrightCaseResultSummary(resultFilePath, matcher);
  return summary?.status ?? null;
}

export async function readJestCaseSummary(resultFilePath: string, matcher: ResultMatcher = {}): Promise<TestCaseResultSummary | null> {
  return readJestCaseResultSummary(resultFilePath, matcher);
}

export async function readPlaywrightCaseSummary(resultFilePath: string, matcher: ResultMatcher = {}): Promise<TestCaseResultSummary | null> {
  return readPlaywrightCaseResultSummary(resultFilePath, matcher);
}
