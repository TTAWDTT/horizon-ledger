import { describe, expect, it } from 'bun:test';
import { createLedgerServer } from '../src/web/server';

describe('web server', () => {
  it('serves the index page and API', async () => {
    const server = createLedgerServer(process.cwd());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const index = await fetch(`http://127.0.0.1:${port}/`);
    expect(index.ok).toBe(true);
    const api = await fetch(`http://127.0.0.1:${port}/api/ledger`);
    expect(api.ok).toBe(true);
    server.close();
  });
});
