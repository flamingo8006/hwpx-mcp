import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import cors from 'cors';
import { createHash } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export interface HttpServerOptions {
  createServer: () => Server;
  port: number;
  path: string;
  tokens: string[];
  allowedOrigins: string[];
  maxBodyMb: number;
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

export async function startHttpServer(opts: HttpServerOptions): Promise<void> {
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
  // Shared state (openDocuments Map) lives in module scope in index.ts,
  // so doc_id survives across HTTP requests without session tracking.
  const mcpHandler: RequestHandler = async (req, res) => {
    const server = opts.createServer();
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

  await new Promise<void>((resolve) => {
    app.listen(opts.port, () => {
      const originsStr = opts.allowedOrigins.length > 0 ? opts.allowedOrigins.join(',') : '(any)';
      const hashes = opts.tokens.map(shortTokenHash).join(',');
      console.error(
        `[HWPX MCP] HTTP transport listening on :${opts.port}${opts.path}` +
          ` | tokens=[${hashes}] | origins=${originsStr}`
      );
      resolve();
    });
  });
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
