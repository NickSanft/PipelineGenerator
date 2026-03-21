import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Returns true if the file exists at the given path */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Returns true if any of the given filenames exist in the directory */
export async function anyFileExists(dir: string, filenames: string[]): Promise<boolean> {
  const checks = filenames.map((f) => fileExists(join(dir, f)));
  const results = await Promise.all(checks);
  return results.some(Boolean);
}

/** Read a JSON file, returning null if it doesn't exist or is invalid */
export async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const contents = await readFile(filePath, 'utf-8');
    return JSON.parse(contents) as T;
  } catch {
    return null;
  }
}

/** Read a text file, returning null if it doesn't exist */
export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}
