import fsp from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import type { StorageAdapter } from './storageAdapter.js';

/**
 * Stores Test Manager state as files under the Test Manager root.
 *
 * This is the default adapter and preserves the historical on-disk layout
 * (`testsManagement/test-plans.json`, `logs/test-manager/...`), so existing
 * projects keep working without any migration.
 */
export class LocalStorageAdapter implements StorageAdapter {
  public readonly kind = 'local' as const;

  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    const segments = key.split('/').filter(Boolean);
    return path.join(this.rootDir, ...segments);
  }

  public async readText(key: string): Promise<string | null> {
    try {
      return await fsp.readFile(this.resolve(key), 'utf-8');
    } catch {
      return null;
    }
  }

  public async writeText(key: string, content: string): Promise<void> {
    const filePath = this.resolve(key);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, content, 'utf-8');
  }

  public async appendText(key: string, content: string): Promise<void> {
    const filePath = this.resolve(key);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.appendFile(filePath, content, 'utf-8');
  }

  public async deleteKey(key: string): Promise<void> {
    await fsp.rm(this.resolve(key), { recursive: true, force: true });
  }

  public async exists(key: string): Promise<boolean> {
    try {
      await fsp.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  public async list(prefix: string): Promise<string[]> {
    const base = this.resolve(prefix);
    const keys: string[] = [];

    const walk = async (dir: string, relative: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(path.join(dir, entry.name), nextRelative);
        } else {
          keys.push(nextRelative);
        }
      }
    };

    await walk(base, '');
    return keys.map(key => (prefix ? `${prefix}/${key}` : key));
  }

  public async close(): Promise<void> {
    // Nothing to flush: every write is committed to disk immediately.
  }
}
