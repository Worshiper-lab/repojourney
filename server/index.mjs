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

function html(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

const resultStyles = `
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#090b12;color:#f4f7fb}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 18% 0%,#14243b 0,transparent 36%),#090b12;color:#f4f7fb}
a{color:inherit}.shell{width:min(1180px,calc(100% - 32px));margin:auto;padding:34px 0 64px}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:28px}
.brand{font-weight:750;letter-spacing:-.03em}.back{border:1px solid #ffffff1c;border-radius:10px;padding:9px 13px;text-decoration:none;color:#b8c0cf}.back:hover{border-color:#67e8f955;color:#cffafe}
.hero{border:1px solid #ffffff16;border-radius:22px;background:#101522dd;padding:24px;box-shadow:0 30px 90px #0006}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#67e8f9}.hero h1{margin:8px 0 5px;font-size:clamp(26px,5vw,46px);letter-spacing:-.045em}.muted{color:#929caf}.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.pill{border:1px solid #ffffff17;border-radius:999px;padding:7px 10px;font:12px ui-monospace,SFMono-Regular,monospace;color:#cbd5e1;background:#ffffff08}
.journeys{display:grid;gap:18px;margin-top:20px}.journey{border:1px solid #ffffff16;border-radius:20px;background:#101522;padding:20px}.journey-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.journey h2{margin:4px 0;font-size:21px}.question{margin:0;color:#a78bfa;font-size:12px}.confidence{white-space:nowrap;color:#a7f3d0;font-size:12px;border:1px solid #6ee7b733;padding:6px 9px;border-radius:999px}.summary{color:#9ca6b8;line-height:1.6;margin:10px 0 18px}
.nodes{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.node{display:block;min-width:0;border:1px solid #ffffff16;border-radius:14px;background:#090d17;padding:14px;text-decoration:none;transition:.18s}.node:hover{transform:translateY(-2px);border-color:#67e8f966}.kind{font-size:9px;text-transform:uppercase;letter-spacing:.16em;color:#67e8f9}.node h3{font-size:14px;margin:10px 0 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.file{font:10px/1.5 ui-monospace,SFMono-Regular,monospace;color:#8993a5;overflow-wrap:anywhere}.detail{font-size:11px;line-height:1.5;color:#8e98a9;margin:10px 0 0}
.error{max-width:720px;margin:100px auto;border:1px solid #fca5a533;border-radius:20px;background:#211116;padding:28px}.error h1{margin-top:0}.error p{color:#fecaca;line-height:1.6}
@media(max-width:900px){.nodes{grid-template-columns:1fr 1fr}.journey-head{display:block}.confidence{display:inline-block;margin-top:8px}}@media(max-width:560px){.nodes{grid-template-columns:1fr}.shell{width:min(100% - 20px,1180px);padding-top:18px}.hero,.journey{padding:16px}}
`;

function renderAnalysisPage(result) {
  const repository = result.repository;
  const journeys = result.flows.map((flow) => `
    <section class="journey">
      <div class="journey-head">
        <div><p class="question">${escapeHtml(flow.prompt)}</p><h2>${escapeHtml(flow.label)}</h2></div>
        <span class="confidence">${escapeHtml(flow.confidence)}% evidence coverage</span>
      </div>
      <p class="summary">${escapeHtml(flow.summary)}</p>
      <div class="nodes">${flow.nodes.map((node) => `
        <a class="node" href="${escapeHtml(node.sourceUrl)}" target="_blank" rel="noopener noreferrer">
          <span class="kind">${escapeHtml(node.eyebrow)}</span>
          <h3>${escapeHtml(node.title)}</h3>
          <div class="file">${escapeHtml(node.file)}:${escapeHtml(node.line)}</div>
          <p class="detail">${escapeHtml(node.detail)}</p>
        </a>`).join('')}</div>
    </section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(repository.name)} analysis — RepoJourney</title><style>${resultStyles}</style></head><body><main class="shell">
    <div class="top"><div class="brand">RepoJourney</div><a class="back" href="/">Analyze another repository</a></div>
    <header class="hero"><div class="eyebrow">Live repository analysis</div><h1>${escapeHtml(repository.owner)}/${escapeHtml(repository.name)}</h1><p class="muted">Real evidence extracted from the public repository.</p><div class="meta"><span class="pill">${escapeHtml(repository.branch)}</span><span class="pill">${escapeHtml(repository.fileCount)} source files</span><span class="pill">${escapeHtml(repository.language)} ${escapeHtml(repository.languagePercentage)}%</span><span class="pill">${escapeHtml(result.flows.length)} journeys</span></div></header>
    <div class="journeys">${journeys}</div>
  </main></body></html>`;
}

function renderErrorPage(message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Analysis failed — RepoJourney</title><style>${resultStyles}</style></head><body><main class="error"><div class="eyebrow">Analysis failed</div><h1>RepoJourney could not map this repository.</h1><p>${escapeHtml(message)}</p><a class="back" href="/">Return and try another URL</a></main></body></html>`;
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
  if (request.method === 'GET' && requestUrl.pathname === '/analyze') {
    if (rateLimited(request)) return html(response, 429, renderErrorPage('Too many analyses. Try again in a few minutes.'));
    if (activeAnalysis) return html(response, 429, renderErrorPage('Another repository is being analyzed. Try again shortly.'));
    activeAnalysis = true;
    try {
      const result = await analyzeRepository(requestUrl.searchParams.get('repositoryUrl'));
      return html(response, 200, renderAnalysisPage(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Repository analysis failed.';
      const status = /valid|Only public|Use a repository URL|invalid|supported source/.test(message) ? 400 : 502;
      return html(response, status, renderErrorPage(message));
    } finally {
      activeAnalysis = false;
    }
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
