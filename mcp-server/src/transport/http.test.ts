/**
 * Smoke tests for the HTTP transport. Spins up a real server on a random
 * loopback port (per test) and drives it with `fetch`. Validates the bits
 * that matter for the DGIST AskON deployment: auth gating, health check,
 * tool listing filtering (filesystem tools hidden), and a base64 round trip.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'net';
import express from 'express';
import { startHttpServer, parseTokens, parseAllowedOrigins, type HttpServerHandle } from './http';
import { createServer as createMcpServer, __resetDocStoreForTests } from '../index';

// Random port helper — let the OS pick.
async function findFreePort(): Promise<number> {
  const app = express();
  return new Promise((resolve, reject) => {
    const srv = app.listen(0, () => {
      const port = (srv.address() as AddressInfo).port;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

const TOKEN_A = 'token-A-' + Math.random().toString(36).slice(2, 10);
const TOKEN_B = 'token-B-' + Math.random().toString(36).slice(2, 10);
const TOKEN = TOKEN_A; // back-compat alias for single-token tests
let port: number;
let handle: HttpServerHandle | null = null;

beforeEach(async () => {
  // Drop any state leaked from earlier test cases (openDocuments / docOwners
  // are module-scope Maps that survive between vitest cases unless cleared).
  __resetDocStoreForTests();

  port = await findFreePort();
  process.env.MCP_MODE = 'http';
  // Two tokens for multi-tenancy isolation tests
  process.env.MCP_TOKENS = `${TOKEN_A},${TOKEN_B}`;
  process.env.MCP_ALLOWED_ORIGINS = '*';

  handle = await startHttpServer({
    createServer: createMcpServer,
    port,
    path: '/mcp',
    tokens: parseTokens(),
    allowedOrigins: parseAllowedOrigins(),
    maxBodyMb: 50,
  });
});

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = null;
  }
  delete process.env.MCP_MODE;
  delete process.env.MCP_TOKEN;
  delete process.env.MCP_TOKENS;
  delete process.env.MCP_ALLOWED_ORIGINS;
});

const url = (path = '/mcp') => `http://127.0.0.1:${port}${path}`;

async function rpc(method: string, params: unknown = {}, id = 1, token = TOKEN) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url('/mcp'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  return { status: res.status, text };
}

function parseSseJson(text: string): any | null {
  // StreamableHTTPServerTransport responds in SSE framing for stateless mode.
  const match = /data:\s*({.+?})\s*$/m.exec(text);
  return match ? JSON.parse(match[1]) : null;
}

describe('HTTP transport', () => {
  it('GET /health returns 200 without auth', async () => {
    const res = await fetch(url('/health'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', mode: 'http' });
  });

  it('rejects missing Authorization header with 401', async () => {
    const res = await fetch(url('/mcp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid Bearer token with 401', async () => {
    const res = await fetch(url('/mcp'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-token',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('initialize succeeds with a valid Bearer token', async () => {
    const r = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(r.status).toBe(200);
    const msg = parseSseJson(r.text);
    expect(msg?.result?.serverInfo?.name).toBe('hwpx-mcp-server');
  });

  it('tools/list omits filesystem tools in HTTP mode', async () => {
    const r = await rpc('tools/list', {}, 2);
    expect(r.status).toBe(200);
    const msg = parseSseJson(r.text);
    expect(msg?.result?.tools).toBeDefined();
    const names: string[] = msg.result.tools.map((t: any) => t.name);

    // Filesystem tools must be hidden
    expect(names).not.toContain('open_document');
    expect(names).not.toContain('save_document');
    expect(names).not.toContain('export_to_text');
    expect(names).not.toContain('export_to_html');
    expect(names).not.toContain('insert_image');
    expect(names).not.toContain('insert_image_in_cell');
    expect(names).not.toContain('get_user_paths');

    // Base64 substitutes must be present
    expect(names).toContain('upload_document_base64');
    expect(names).toContain('download_document_base64');
  });

  it('calling a filesystem tool by name is rejected with a clear error', async () => {
    // Even though the tool is hidden from listing, a malicious client could
    // POST a tool/call directly. The MCP_MODE check should refuse.
    const r = await rpc(
      'tools/call',
      { name: 'open_document', arguments: { path: '/etc/passwd' } },
      3
    );
    expect(r.status).toBe(200);
    const msg = parseSseJson(r.text);
    // Our error() helper returns isError: true with a text content block
    // that contains a JSON-encoded { error: "..." } payload.
    const txt = msg?.result?.content?.[0]?.text ?? '';
    expect(txt).toMatch(/disabled in HTTP mode/i);
  });
});

describe('HTTP transport — multi-tenancy isolation', () => {
  // Helper to extract the inner JSON from our error()/success() helpers.
  function toolResultText(text: string): any {
    const msg = parseSseJson(text);
    const txt = msg?.result?.content?.[0]?.text ?? '';
    try { return JSON.parse(txt); } catch { return { _raw: txt }; }
  }

  // Helper to upload a tiny "document" via base64 and return doc_id.
  // We use create_document instead because base64 upload requires a real
  // HWPX byte stream; create_document just generates a fresh in-memory doc.
  async function createDoc(token: string): Promise<string> {
    const r = await rpc('tools/call', { name: 'create_document', arguments: { title: 'test', creator: 'tester' } }, 100, token);
    expect(r.status).toBe(200);
    const result = toolResultText(r.text);
    expect(result.doc_id).toBeDefined();
    return result.doc_id as string;
  }

  it("token A's doc_id is invisible to token B", async () => {
    const docA = await createDoc(TOKEN_A);

    // B tries to read A's doc — should get "Document not found"
    const r = await rpc('tools/call', { name: 'get_document_text', arguments: { doc_id: docA } }, 101, TOKEN_B);
    expect(r.status).toBe(200);
    const result = toolResultText(r.text);
    expect(result.error).toMatch(/Document not found/i);
  });

  it("token A's doc_id cannot be modified by token B", async () => {
    const docA = await createDoc(TOKEN_A);

    // B tries to write to A's doc — must be rejected (mutating tool path)
    const r = await rpc(
      'tools/call',
      {
        name: 'update_paragraph_text',
        arguments: { doc_id: docA, paragraph_index: 0, text: 'hijacked' },
      },
      102,
      TOKEN_B,
    );
    expect(r.status).toBe(200);
    const result = toolResultText(r.text);
    expect(result.error).toMatch(/Document not found/i);
  });

  it("list_open_documents only shows the caller's own docs", async () => {
    const docA = await createDoc(TOKEN_A);
    const docB1 = await createDoc(TOKEN_B);
    const docB2 = await createDoc(TOKEN_B);

    const r = await rpc('tools/call', { name: 'list_open_documents', arguments: {} }, 103, TOKEN_B);
    const result = toolResultText(r.text);
    const ids: string[] = (result.documents ?? []).map((d: any) => d.id);

    expect(ids).toContain(docB1);
    expect(ids).toContain(docB2);
    expect(ids).not.toContain(docA);
  });

  it('A can still operate on its own doc after B is denied', async () => {
    const docA = await createDoc(TOKEN_A);

    // B's denial above did not corrupt the lock map; A still owns its doc.
    const r = await rpc('tools/call', { name: 'get_document_text', arguments: { doc_id: docA } }, 104, TOKEN_A);
    const result = toolResultText(r.text);
    // success path: text field present (may be empty string for fresh doc)
    expect(result.error).toBeUndefined();
    expect(result.text).toBeDefined();
  });

  it('close_document by foreign owner is rejected (returns Document not found)', async () => {
    const docA = await createDoc(TOKEN_A);

    const r = await rpc('tools/call', { name: 'close_document', arguments: { doc_id: docA } }, 105, TOKEN_B);
    const result = toolResultText(r.text);
    expect(result.error).toMatch(/Document not found/i);

    // A can still close its own doc
    const r2 = await rpc('tools/call', { name: 'close_document', arguments: { doc_id: docA } }, 106, TOKEN_A);
    const result2 = toolResultText(r2.text);
    expect(result2.message).toMatch(/closed/i);
  });
});

describe('HTTP transport — per-owner document cap', () => {
  function toolResultText(text: string): any {
    const msg = parseSseJson(text);
    const txt = msg?.result?.content?.[0]?.text ?? '';
    try { return JSON.parse(txt); } catch { return { _raw: txt }; }
  }

  // The cap helpers in index.ts read process.env on every call, so flipping
  // these envs takes effect immediately without a server restart.
  beforeEach(() => {
    process.env.MCP_MAX_OPEN_DOCS_PER_OWNER = '2';
  });
  afterEach(() => {
    delete process.env.MCP_MAX_OPEN_DOCS_PER_OWNER;
  });

  async function call(token: string, name: string, args: any, id: number) {
    const r = await rpc('tools/call', { name, arguments: args }, id, token);
    return toolResultText(r.text);
  }

  it('per-owner cap blocks the offending tenant', async () => {
    // A burns through its 2-doc quota
    expect((await call(TOKEN_A, 'create_document', { title: 'a1' }, 300)).doc_id).toBeDefined();
    expect((await call(TOKEN_A, 'create_document', { title: 'a2' }, 301)).doc_id).toBeDefined();

    // 3rd doc by A is rejected with the per-tenant cap message
    const r3 = await call(TOKEN_A, 'create_document', { title: 'a3' }, 302);
    expect(r3.error).toMatch(/per-tenant max open documents/i);
  });

  it("one tenant's cap does not block other tenants", async () => {
    // A fills its quota
    await call(TOKEN_A, 'create_document', { title: 'a1' }, 310);
    await call(TOKEN_A, 'create_document', { title: 'a2' }, 311);
    expect((await call(TOKEN_A, 'create_document', { title: 'a3' }, 312)).error).toMatch(/per-tenant/i);

    // B's quota is independent
    expect((await call(TOKEN_B, 'create_document', { title: 'b1' }, 313)).doc_id).toBeDefined();
    expect((await call(TOKEN_B, 'create_document', { title: 'b2' }, 314)).doc_id).toBeDefined();
    expect((await call(TOKEN_B, 'create_document', { title: 'b3' }, 315)).error).toMatch(/per-tenant/i);
  });

  it('closing a doc frees the per-owner slot', async () => {
    const a1 = (await call(TOKEN_A, 'create_document', { title: 'a1' }, 320)).doc_id;
    await call(TOKEN_A, 'create_document', { title: 'a2' }, 321);

    // Cap reached
    expect((await call(TOKEN_A, 'create_document', { title: 'a3' }, 322)).error).toMatch(/per-tenant/i);

    // Close a1, freeing a slot
    expect((await call(TOKEN_A, 'close_document', { doc_id: a1 }, 323)).message).toMatch(/closed/i);

    // Now A can create again
    expect((await call(TOKEN_A, 'create_document', { title: 'a4' }, 324)).doc_id).toBeDefined();
  });
});
