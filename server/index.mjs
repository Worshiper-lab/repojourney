import { createServer } from 'node:http';
import { analyzeRepository } from './analyzer.mjs';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3101);
const limits = new Map();
let activeAnalysis = false;

function json(response, status, value, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  response.end(JSON.stringify(value));
}

function clientAddress(request) {
  return String(request.headers['x-real-ip'] || request.socket.remoteAddress || 'unknown');
}

function rateLimited(request) {
  const key = clientAddress(request);
  const now = Date.now();
  const recent = (limits.get(key) ?? []).filter((time) => now - time < 10 * 60_000);
  recent.push(now);
  limits.set(key, recent);
  return recent.length > 5;
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 8_192) throw new Error('Request body is too large.');
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    return json(response, 200, { ok: true, activeAnalysis });
  }
  if (request.method !== 'POST' || requestUrl.pathname !== '/api/analyze') {
    return json(response, 404, { error: 'Not found.' });
  }
  if (rateLimited(request)) return json(response, 429, { error: 'Too many analyses. Try again in a few minutes.' });
  if (activeAnalysis) return json(response, 429, { error: 'Another repository is being analyzed. Try again shortly.' }, { 'Retry-After': '10' });
  activeAnalysis = true;
  try {
    const body = await readJson(request);
    const result = await analyzeRepository(body.repositoryUrl);
    return json(response, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Repository analysis failed.';
    const status = /valid|Only public|Use a repository URL|invalid|supported source/.test(message) ? 400 : 502;
    return json(response, status, { error: message });
  } finally {
    activeAnalysis = false;
  }
});

server.requestTimeout = 65_000;
server.headersTimeout = 70_000;
server.listen(port, host, () => console.log(`RepoJourney API listening on http://${host}:${port}`));
