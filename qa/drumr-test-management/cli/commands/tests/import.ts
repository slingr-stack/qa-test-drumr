import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ImportOptions {
  targetDir: string;
  presetDir?: string;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function importTestManager(options: ImportOptions): Promise<void> {
  const { targetDir } = options;
  const presetDir = options.presetDir ?? path.resolve(__dirname, '..', '..');
  const presetRoot = path.resolve(presetDir);

  const sourceCommands = path.join(presetRoot, 'commands', 'tests');
  const sourceUtils = path.join(presetRoot, 'utils');
  const sourceTemplates = path.join(presetRoot, 'templates', 'test-ui');

  const destCommands = path.join(targetDir, 'cli', 'src', 'commands', 'tests');
  const destUtils = path.join(targetDir, 'cli', 'src', 'utils');
  const destTemplates = path.join(targetDir, 'cli', 'src', 'templates', 'test-ui');

  // Validate preset directory
  for (const dir of [sourceCommands, sourceUtils, sourceTemplates]) {
    if (!(await pathExists(dir))) {
      console.error(`Preset source not found: ${dir}`);
      process.exit(1);
    }
  }

  // Validate target directory
  const targetPkg = path.join(targetDir, 'package.json');
  if (!(await pathExists(targetPkg))) {
    console.error(`Target does not appear to be a valid project: ${targetDir}`);
    process.exit(1);
  }

  // Copy commands (except import.ts itself)
  await fsp.mkdir(destCommands, { recursive: true });
  const commandFiles = await fsp.readdir(sourceCommands);
  for (const file of commandFiles) {
    if (file === 'import.ts') continue;
    await fsp.cp(path.join(sourceCommands, file), path.join(destCommands, file), { recursive: true, force: true });
    console.log(`  copied  cli/src/commands/tests/${file}`);
  }

  // Copy utils
  await fsp.mkdir(destUtils, { recursive: true });
  const utilFiles = await fsp.readdir(sourceUtils);
  for (const file of utilFiles) {
    await fsp.cp(path.join(sourceUtils, file), path.join(destUtils, file), { recursive: true, force: true });
    console.log(`  copied  cli/src/utils/${file}`);
  }

  // Copy templates
  await fsp.mkdir(destTemplates, { recursive: true });
  await fsp.cp(sourceTemplates, destTemplates, { recursive: true, force: true });
  console.log(`  copied  cli/src/templates/test-ui/`);

  console.log('\nTest-manager preset imported successfully.');
  console.log('Run "drumr tests setup" to scaffold test infrastructure.');
  console.log('Run "drumr tests open" to launch the Test Manager UI.');
}

// Allow running as a standalone script
const isMain = process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1].endsWith('/import.ts') ||
  process.argv[1].endsWith('/import.js')
);

if (isMain) {
  const args = process.argv.slice(2);
  const targetIndex = args.indexOf('--target');
  const presetIndex = args.indexOf('--preset');

  const targetDir = targetIndex !== -1 ? args[targetIndex + 1] : process.cwd();
  const presetDir = presetIndex !== -1 ? args[presetIndex + 1] : undefined;

  if (!targetDir) {
    console.error('Usage: tsx import.ts --target /path/to/target-app [--preset /path/to/preset-root]');
    process.exit(1);
  }

  importTestManager({ targetDir, presetDir }).catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });
}
