import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, posix, relative } from 'node:path';
import { spawn } from 'node:child_process';

const SOURCE_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.css', '.go', '.html', '.java', '.js', '.jsx',
  '.kt', '.mjs', '.php', '.py', '.rb', '.rs', '.scss', '.sql', '.svelte',
  '.swift', '.ts', '.tsx', '.vue',
]);
const IGNORED_DIRECTORIES = new Set([
  '.git', '.next', '.nuxt', '.output', '.turbo', '.venv', '.vinext', '.wrangler',
  'build', 'coverage', 'dist', 'dist-static', 'node_modules', 'out', 'target', 'vendor',
]);
const MAX_FILES = 700;
const MAX_FILE_BYTES = 220_000;
const MAX_TOTAL_BYTES = 8_000_000;

const kindMeta = {
  ui: { eyebrow: 'Interface', detail: 'User-facing entry point or component.' },
  api: { eyebrow: 'API route', detail: 'Request handler, controller, or transport boundary.' },
  logic: { eyebrow: 'Domain logic', detail: 'Service, workflow, utility, or application behavior.' },
  data: { eyebrow: 'Data layer', detail: 'Schema, model, repository, query, or persistence code.' },
};

export function parseGitHubRepository(input) {
  const candidate = String(input ?? '').trim();
  const normalized = candidate.startsWith('github.com/') ? `https://${candidate}` : candidate;
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('Enter a valid GitHub repository URL.');
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Only public https://github.com repositories are supported.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Use the repository URL without credentials, query parameters, or fragments.');
  }
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length !== 2) throw new Error('Use a repository URL such as https://github.com/owner/repo.');
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  const safePart = /^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/;
  if (!safePart.test(owner) || !safePart.test(repo)) throw new Error('The GitHub owner or repository name is invalid.');
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 45_000);
    child.stdout.on('data', (chunk) => { if (stdout.length < 100_000) stdout += chunk; });
    child.stderr.on('data', (chunk) => { if (stderr.length < 100_000) stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise(stdout.trim());
      else reject(new Error(signal ? 'Repository analysis timed out.' : stderr.trim() || 'Git command failed.'));
    });
  });
}

async function cloneRepository(repositoryUrl, checkout, timeoutMs) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await rm(checkout, { recursive: true, force: true });
    try {
      await run(
        'git',
        ['-c', 'http.version=HTTP/1.1', 'clone', '--depth', '1', '--single-branch', '--no-tags', `${repositoryUrl}.git`, checkout],
        { timeoutMs },
      );
      return;
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error && /not found|authentication failed/i.test(lastError.message)
    ? 'The repository was not found or is not public.'
    : 'GitHub could not be reached or the repository took too long to download.';
  throw new Error(detail);
}

async function collectFiles(root) {
  const files = [];
  let totalBytes = 0;
  async function walk(directory) {
    if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) break;
      if (entry.isSymbolicLink()) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(absolute);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      const info = await stat(absolute);
      if (info.size > MAX_FILE_BYTES || totalBytes + info.size > MAX_TOTAL_BYTES) continue;
      const content = await readFile(absolute, 'utf8').catch(() => null);
      if (content === null || content.includes('\0')) continue;
      totalBytes += info.size;
      files.push({
        path: relative(root, absolute).replaceAll('\\', '/'),
        absolute,
        content,
        size: info.size,
      });
    }
  }
  await walk(root);
  return files;
}

function classify(file) {
  const value = `${file.path}\n${file.content.slice(0, 12_000)}`.toLowerCase();
  const path = file.path.toLowerCase();
  if (/\b(schema|schemas|model|models|database|db|migrations|repositories)\b/.test(path)) return 'data';
  if (/\b(api|routes|controllers|webhooks)\b/.test(path) || (path.startsWith('server/index.') && /createServer|\/api\//.test(file.content))) return 'api';
  if (path.startsWith('server/') || /\b(services|domain|usecases|workflows)\b/.test(path)) return 'logic';
  if (/\.(tsx|jsx|vue|svelte)$/.test(path) || path.startsWith('components/')) return 'ui';
  const scores = {
    ui: score(value, [
      [/\.(tsx|jsx|vue|svelte)\b/g, 4], [/\b(component|page|screen|view|widget|template)\b/g, 2],
      [/<[a-z][^>]*>/g, 2], [/\b(useState|useEffect|render|createRoot)\b/g, 2],
    ]),
    api: score(value, [
      [/\b(api|route|router|controller|handler|endpoint|webhook)\b/g, 3],
      [/\b(get|post|put|patch|delete)\s*\(/g, 2], [/\b(request|response|req|res)\b/g, 1],
    ]),
    data: score(value, [
      [/\b(schema|model|entity|repository|database|migration|prisma|sequelize|mongoose)\b/g, 3],
      [/\b(select|insert|update|delete from|create table|transaction)\b/g, 2],
    ]),
    logic: score(value, [
      [/\b(service|usecase|workflow|domain|command|processor|manager|util|lib)\b/g, 2],
      [/\b(export|function|class|async)\b/g, 1],
    ]),
  };
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

function routeTokens(file) {
  const tokens = new Set();
  for (const match of file.content.matchAll(/['"`]((?:\/api\/)[A-Za-z0-9_./:-]+)['"`]/g)) {
    tokens.add(match[1].replace(/\/+$/, ''));
  }
  return tokens;
}

function connectSharedRoutes(files, graph) {
  const routes = new Map(files.map((file) => [file.path, routeTokens(file)]));
  for (let index = 0; index < files.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < files.length; otherIndex += 1) {
      const left = files[index];
      const right = files[otherIndex];
      const shared = [...routes.get(left.path)].some((route) => routes.get(right.path).has(route));
      if (!shared) continue;
      graph.get(left.path).push(right.path);
      graph.get(right.path).push(left.path);
    }
  }
}

function score(value, rules) {
  return rules.reduce((total, [pattern, weight]) => total + Math.min(6, value.match(pattern)?.length ?? 0) * weight, 0);
}

function importsFor(file, knownPaths) {
  const imports = new Set();
  const matcher = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of file.content.matchAll(matcher)) {
    const specifier = match[1] || match[2] || match[3];
    if (!specifier?.startsWith('.')) continue;
    const base = posix.normalize(posix.join(posix.dirname(file.path), specifier));
    const candidates = [base, ...SOURCE_EXTENSIONS].flatMap((value) =>
      typeof value === 'string' && value.startsWith('.') ? [] : [value],
    );
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${base}${extension}`, `${base}/index${extension}`);
    const resolved = candidates.find((candidate) => knownPaths.has(candidate));
    if (resolved) imports.add(resolved);
  }
  return [...imports];
}

function tokenize(path) {
  return new Set(path.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2 && !['index', 'src', 'app', 'apps'].includes(part)));
}

function relatedScore(seed, candidate, depthByPath) {
  const seedTokens = tokenize(seed.path);
  const candidateTokens = tokenize(candidate.path);
  let shared = 0;
  for (const token of seedTokens) if (candidateTokens.has(token)) shared += 4;
  const sameDirectory = dirname(seed.path) === dirname(candidate.path) ? 3 : 0;
  const depth = depthByPath.get(candidate.path);
  const imported = depth === undefined ? 0 : Math.max(2, 12 - depth * 2);
  return shared + sameDirectory + imported - candidate.path.split('/').length * 0.05;
}

function findEvidenceLine(file, kind) {
  const patterns = {
    ui: /\b(export default|function|const|class|render|return\s*\()/,
    api: /\b(GET|POST|PUT|PATCH|DELETE|router\.|app\.|handler|controller|request)\b/i,
    logic: /\b(export|async|function|class|service|usecase|workflow)\b/i,
    data: /\b(schema|model|entity|repository|select|insert|create table|prisma)\b/i,
  };
  const lines = file.content.split(/\r?\n/);
  const index = lines.findIndex((line) => patterns[kind].test(line));
  return Math.max(1, index + 1);
}

function titleFor(file, line) {
  const source = file.content.split(/\r?\n/)[line - 1] ?? '';
  const named = source.match(/(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/);
  if (named) return named[1];
  return basename(file.path, extname(file.path)).replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function flowLabel(file) {
  const path = file.path.toLowerCase();
  if (/^(app|src\/app)\/page\./.test(path)) return 'Repository analyzer UI';
  if (path.startsWith('server/index.')) return 'Analysis API';
  if (/^server\/analy[sz]er\./.test(path)) return 'Source graph engine';
  if (/(^|\/)main\.(tsx?|jsx?)$/.test(path)) return 'Application bootstrap';
  if (/(^|\/)layout\.(tsx?|jsx?)$/.test(path)) return 'Application shell';
  return titleFor(file, findEvidenceLine(file, file.kind));
}

function buildFlow(seed, index, files, graph, repository, branch) {
  const depthByPath = new Map([[seed.path, 0]]);
  const queue = [seed.path];
  while (queue.length) {
    const current = queue.shift();
    const depth = depthByPath.get(current);
    if (depth >= 4) continue;
    for (const next of graph.get(current) ?? []) {
      if (!depthByPath.has(next)) {
        depthByPath.set(next, depth + 1);
        queue.push(next);
      }
    }
  }
  const ranked = [...files].sort((a, b) => relatedScore(seed, b, depthByPath) - relatedScore(seed, a, depthByPath));
  const chosen = [seed];
  for (const kind of ['api', 'logic', 'data', 'ui']) {
    const candidate = ranked.find((file) => file.kind === kind && !chosen.includes(file));
    if (candidate && chosen.length < 5) chosen.push(candidate);
  }
  for (const candidate of ranked) {
    if (chosen.length >= 5) break;
    if (!chosen.includes(candidate)) chosen.push(candidate);
  }
  const nodes = chosen.map((file, nodeIndex) => {
    const line = findEvidenceLine(file, file.kind);
    const pathUrl = file.path.split('/').map(encodeURIComponent).join('/');
    return {
      id: `flow-${index}-node-${nodeIndex}`,
      eyebrow: kindMeta[file.kind].eyebrow,
      title: titleFor(file, line),
      file: file.path,
      line,
      detail: `${kindMeta[file.kind].detail} Ranked from repository structure, source signals, and local import relationships.`,
      kind: file.kind,
      sourceUrl: `${repository.url}/blob/${encodeURIComponent(branch)}/${pathUrl}#L${line}`,
    };
  });
  const label = flowLabel(seed);
  const promptByKind = {
    ui: `How does ${label} connect to the repository?`,
    api: `What happens when ${label} handles a request?`,
    logic: `Which code supports ${label}?`,
    data: `How is data handled around ${label}?`,
  };
  const connected = nodes.filter((node) => depthByPath.has(node.file)).length;
  return {
    id: `journey-${index + 1}`,
    label,
    prompt: promptByKind[seed.kind],
    summary: `${nodes.length} evidence locations were selected from ${files.length} indexed source files. ${connected} are connected through local imports; the remainder use path and naming signals.`,
    confidence: Math.min(96, 58 + connected * 8),
    nodes,
  };
}

function languageSummary(files) {
  const names = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
    '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin',
    '.php': 'PHP', '.rb': 'Ruby', '.cs': 'C#', '.vue': 'Vue', '.svelte': 'Svelte',
  };
  const totals = new Map();
  let all = 0;
  for (const file of files) {
    const name = names[extname(file.path).toLowerCase()] ?? 'Other';
    totals.set(name, (totals.get(name) ?? 0) + file.size);
    all += file.size;
  }
  const [language, bytes] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['Unknown', 0];
  return { language, percentage: all ? Math.round((bytes / all) * 100) : 0 };
}

export async function analyzeRepository(input, options = {}) {
  const repository = parseGitHubRepository(input);
  const workRoot = await mkdtemp(join(tmpdir(), 'repojourney-'));
  const checkout = join(workRoot, 'repository');
  try {
    await cloneRepository(repository.url, checkout, options.timeoutMs ?? 50_000);
    const branch = await run('git', ['branch', '--show-current'], { cwd: checkout, timeoutMs: 5_000 }) || 'main';
    const files = await collectFiles(checkout);
    if (!files.length) throw new Error('No supported source files were found in this repository.');
    for (const file of files) file.kind = classify(file);
    const knownPaths = new Set(files.map((file) => file.path));
    const graph = new Map(files.map((file) => [file.path, importsFor(file, knownPaths)]));
    connectSharedRoutes(files, graph);
    const seedCandidates = [...files].sort((a, b) => {
      const seedScore = (file) => {
        const path = file.path.toLowerCase();
        const primary = /^(app|src\/app)\/page\./.test(path) ? 24
          : path.startsWith('server/index.') ? 22
            : /^server\/analy[sz]er\./.test(path) ? 20
              : file.kind === 'api' ? 12
                : file.kind === 'ui' ? 10
                  : 6;
        const genericPenalty = path.startsWith('components/ui/') || /(^|\/)(layout|main|index)\.(tsx?|jsx?)$/.test(path) ? 9 : 0;
        return primary + (graph.get(file.path)?.length ?? 0) - genericPenalty - file.path.split('/').length * 0.2;
      };
      return seedScore(b) - seedScore(a);
    });
    const seeds = [];
    for (const candidate of seedCandidates) {
      if (seeds.length >= 3) break;
      const label = flowLabel(candidate);
      if (!seeds.some((seed) => flowLabel(seed) === label)) seeds.push(candidate);
    }
    const language = languageSummary(files);
    return {
      repository: {
        owner: repository.owner,
        name: repository.repo,
        url: repository.url,
        branch,
        fileCount: files.length,
        language: language.language,
        languagePercentage: language.percentage,
        indexedAt: new Date().toISOString(),
        truncated: files.length >= MAX_FILES,
      },
      flows: seeds.map((seed, index) => buildFlow(seed, index, files, graph, repository, branch)),
    };
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}
