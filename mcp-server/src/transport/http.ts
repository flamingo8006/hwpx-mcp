import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import cors from 'cors';
import { createHash } from 'crypto';
import type { Server as HttpServer } from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export interface HttpServerOptions {
  /**
   * Factory invoked once per request to mint a stateless MCP Server.
   * The transport supplies the authenticated caller's ownerKey (a short
   * sha256 prefix of their bearer token) so the server can scope doc_ids
   * to that caller — see docOwners in index.ts.
   */
  createServer: (opts: { ownerKey: string }) => Server;
  port: number;
  path: string;
  tokens: string[];
  allowedOrigins: string[];
  maxBodyMb: number;
}

/** Handle returned by startHttpServer() so callers can shut the listener down cleanly. */
export interface HttpServerHandle {
  /** Underlying http.Server (already listening). */
  server: HttpServer;
  /** Stop accepting new connections and resolve once existing ones close. */
  close(): Promise<void>;
}

function shortTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 8);
}

function buildAuthMiddleware(tokens: string[]): RequestHandler {
  const allowed = new Set(tokens);
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS') return next();
    const header = req.header('authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      res.status(401).json({ error: 'Unauthorized: missing bearer token' });
      return;
    }
    const token = header.slice(7).trim();
    if (!allowed.has(token)) {
      res.status(401).json({ error: 'Unauthorized: invalid token' });
      return;
    }
    (req as any).tokenHash = shortTokenHash(token);
    next();
  };
}

export async function startHttpServer(opts: HttpServerOptions): Promise<HttpServerHandle> {
  if (opts.tokens.length === 0) {
    throw new Error('MCP_TOKEN (or MCP_TOKENS) must be set when MCP_MODE=http');
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: `${opts.maxBodyMb}mb` }));
  app.use(
    cors({
      origin: opts.allowedOrigins.length > 0 ? opts.allowedOrigins : true,
      credentials: false,
      allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Accept'],
      exposedHeaders: ['Mcp-Session-Id'],
      methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
    })
  );

  // Health / readiness (no auth) — useful for docker-compose healthcheck
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', mode: 'http' });
  });

  const authenticate = buildAuthMiddleware(opts.tokens);

  // Stateless MCP: one Server + one Transport per request.
  // Shared state (openDocuments + docOwners Maps) lives in module scope
  // in index.ts, so doc_id survives across HTTP requests without session
  // tracking. ownerKey scopes each doc_id to the bearer token that
  // uploaded it — see docOwners in index.ts.
  const mcpHandler: RequestHandler = async (req, res) => {
    const ownerKey = (req as any).tokenHash ?? 'anon';
    const server = opts.createServer({ ownerKey });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });

    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      const hash = (req as any).tokenHash ?? '-';
      console.error(`[HWPX MCP] transport error (token=${hash}):`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };

  app.post(opts.path, authenticate, mcpHandler);
  app.get(opts.path, authenticate, mcpHandler);
  app.delete(opts.path, authenticate, mcpHandler);

  const server = await new Promise<HttpServer>((resolve) => {
    const s = app.listen(opts.port, () => {
      const originsStr = opts.allowedOrigins.length > 0 ? opts.allowedOrigins.join(',') : '(any)';
      const hashes = opts.tokens.map(shortTokenHash).join(',');
      console.error(
        `[HWPX MCP] HTTP transport listening on :${opts.port}${opts.path}` +
          ` | tokens=[${hashes}] | origins=${originsStr}`
      );
      resolve(s);
    });
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        // closeAllConnections drops any sockets that are merely keep-alive
        // idle; without it, server.close() can hang for the OS keep-alive
        // timeout (default 5s on Node 20). Tests need close() to be quick.
        if (typeof (server as any).closeAllConnections === 'function') {
          (server as any).closeAllConnections();
        }
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function parseTokens(): string[] {
  const multi = process.env.MCP_TOKENS;
  if (multi) {
    return multi
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const single = process.env.MCP_TOKEN;
  return single ? [single.trim()] : [];
}

export function parseAllowedOrigins(): string[] {
  const raw = process.env.MCP_ALLOWED_ORIGINS;
  if (!raw) {
    // Defaults: Claude.ai and ChatGPT web MCP clients
    return ['https://claude.ai', 'https://chatgpt.com'];
  }
  if (raw.trim() === '*') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
