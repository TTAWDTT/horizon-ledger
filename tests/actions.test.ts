import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';

const actionFiles = [
  '.github/actions/gate/action.yml',
  '.github/actions/pr-context/action.yml',
  '.github/actions/validate/action.yml',
  '.github/actions/evidence/action.yml',
];

describe('composite actions', () => {
  it('resolves the Horizon CLI from the repository source root', async () => {
    for (const file of actionFiles) {
      const content = await fs.readFile(path.join(process.cwd(), file), 'utf8');
      expect(content).toContain('"$ACTION_PATH/../../../src/cli/index.ts"');
      expect(content).not.toContain('"$ACTION_PATH/src/cli/index.ts"');
    }
  });

  it('supports evidence package artifact upload', async () => {
    const content = await fs.readFile(path.join(process.cwd(), '.github/actions/evidence/action.yml'), 'utf8');
    expect(content).toContain('workspace evidence export');
    expect(content).toContain('evidence-pack-id');
    expect(content).toContain('gate-verdict');
    expect(content).toContain('actions/upload-artifact@v4');
  });
  it('supports hash-bound gate reports and artifact upload', async () => {
    const content = await fs.readFile(path.join(process.cwd(), '.github/actions/gate/action.yml'), 'utf8');
    expect(content).toContain('--report');
    expect(content).toContain('report-id');
    expect(content).toContain('actions/upload-artifact@v4');
  });
});
