import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';

const actionFiles = [
  '.github/actions/gate/action.yml',
  '.github/actions/pr-context/action.yml',
  '.github/actions/validate/action.yml',
];

describe('composite actions', () => {
  it('resolves the Horizon CLI from the repository source root', async () => {
    for (const file of actionFiles) {
      const content = await fs.readFile(path.join(process.cwd(), file), 'utf8');
      expect(content).toContain('"$ACTION_PATH/../../../src/cli/index.ts"');
      expect(content).not.toContain('"$ACTION_PATH/src/cli/index.ts"');
    }
  });
});
