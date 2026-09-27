import { tool } from 'ai';
import { observe } from '@lmnr-ai/lmnr';
import { z } from 'zod';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const SANDBOX = path.resolve(process.cwd(), 'sandbox');

/** Inner work unit. Shows up in the trace as a plain DEFAULT span. */
const step = <T>(name: string, fn: () => Promise<T>): Promise<T> =>
  observe({ name, spanType: 'DEFAULT' }, fn);

const resolveInSandbox = (p: string) => {
  const full = path.resolve(SANDBOX, p);
  if (!full.startsWith(SANDBOX)) throw new Error(`path escapes sandbox: ${p}`);
  return full;
};

const readCache = new Map<string, string>();

export const list_files = tool({
  description: 'List files under a directory in the project, recursively.',
  inputSchema: z.object({
    dir: z.string().describe('Directory relative to the project root, e.g. "src"'),
  }),
  execute: async ({ dir }) => {
    const entries = await step('fs.readdir', async () => {
      const out: string[] = [];
      const walk = async (rel: string) => {
        for (const e of await readdir(resolveInSandbox(rel), { withFileTypes: true })) {
          const child = path.join(rel, e.name);
          if (e.isDirectory()) await walk(child);
          else out.push(child);
        }
      };
      await walk(dir);
      return out;
    });
    return { files: entries };
  },
});

export const read_file = tool({
  description: 'Read the full contents of a file in the project.',
  inputSchema: z.object({
    path: z.string().describe('File path relative to the project root'),
  }),
  execute: async ({ path: p }) => {
    const contents = await step('fs.readFile', async () => {
      const cached = readCache.get(p);
      if (cached) return cached;
      const body = await readFile(resolveInSandbox(p), 'utf8');
      readCache.set(p, body);
      return body;
    });
    return { path: p, contents };
  },
});

export const grep = tool({
  description: 'Search the project for a regex pattern. Returns matching lines with file and line number.',
  inputSchema: z.object({
    pattern: z.string().describe('Regex to search for'),
  }),
  execute: async ({ pattern }) => {
    const matches = await step('ripgrep.exec', async () => {
      const re = new RegExp(pattern);
      const found: { file: string; line: number; text: string }[] = [];
      const walk = async (rel: string) => {
        for (const e of await readdir(resolveInSandbox(rel), { withFileTypes: true })) {
          const child = path.join(rel, e.name);
          if (e.isDirectory()) { await walk(child); continue; }
          const body = await readFile(resolveInSandbox(child), 'utf8');
          body.split('\n').forEach((text, i) => {
            if (re.test(text)) found.push({ file: child, line: i + 1, text: text.trim() });
          });
        }
      };
      await walk('.');
      return found;
    });
    return { matches };
  },
});

export const edit_file = tool({
  description: 'Overwrite a file with new contents. Always read the file first.',
  inputSchema: z.object({
    path: z.string().describe('File path relative to the project root'),
    contents: z.string().describe('The complete new contents of the file'),
  }),
  execute: async ({ path: p, contents }) => {
    await step('fs.writeFile', async () => {
      await writeFile(resolveInSandbox(p), contents, 'utf8');
      readCache.set(p, contents);
    });
    return { path: p, bytesWritten: Buffer.byteLength(contents) };
  },
});

export const run_tests = tool({
  description: 'Run the project test suite and return the result.',
  inputSchema: z.object({}),
  execute: async () =>
    step('shell.exec', () =>
      new Promise<{ passed: boolean; output: string }>((resolve) => {
        const proc = spawn('pnpm', ['exec', 'vitest', 'run', '--root', SANDBOX], {
          cwd: process.cwd(),
          env: process.env,
        });
        let out = '';
        proc.stdout.on('data', (d) => (out += d));
        proc.stderr.on('data', (d) => (out += d));
        proc.on('close', (code) =>
          resolve({ passed: code === 0, output: out.slice(-4000) }),
        );
      }),
    ),
});
