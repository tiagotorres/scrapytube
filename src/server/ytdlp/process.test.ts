import { describe, expect, it } from 'vitest';

import { runCommand } from './process.ts';

const node = process.execPath;

describe('running a command', () => {
  it('keeps a whole answer larger than the default limit when asked', async () => {
    const script = `process.stdout.write(JSON.stringify({ big: 'x'.repeat(700_000) }))`;
    const result = await runCommand(node, ['-e', script], { maxOutput: 5_000_000 });
    expect(result.code).toBe(0);
    expect((JSON.parse(result.stdout) as { big: string }).big).toHaveLength(700_000);
  });

  it('keeps only the end of a long output otherwise', async () => {
    const result = await runCommand(node, ['-e', `process.stdout.write('a'.repeat(300_000) + 'END')`]);
    expect(result.stdout).toHaveLength(200_000);
    expect(result.stdout.endsWith('END')).toBe(true);
  });
});
