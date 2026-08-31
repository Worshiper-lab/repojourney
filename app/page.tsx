'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Braces,
  Check,
  ChevronRight,
  CircleDot,
  Code2,
  Copy,
  Database,
  FileCode2,
  GitBranch,
  GitFork,
  Layers3,
  LockKeyhole,
  Play,
  Search,
  ServerCog,
  Sparkles,
  Waypoints,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type FlowKey = 'booking' | 'login' | 'payment';
type FlowNode = {
  id: string;
  eyebrow: string;
  title: string;
  file: string;
  line: number;
  detail: string;
  kind: 'ui' | 'api' | 'logic' | 'data';
};

const flows: Record<
  FlowKey,
  { label: string; prompt: string; nodes: FlowNode[] }
> = {
  booking: {
    label: 'Create booking',
    prompt: 'How does a customer create a service booking?',
    nodes: [
      {
        id: 'screen',
        eyebrow: 'Interface',
        title: 'Booking form',
        file: 'apps/mini/pages/booking/index.tsx',
        line: 42,
        detail:
          'Collects the service, schedule, address, and contact details before validating the form.',
        kind: 'ui',
      },
      {
        id: 'client',
        eyebrow: 'Client action',
        title: 'submitBooking()',
        file: 'apps/mini/services/booking.ts',
        line: 18,
        detail:
          'Normalizes the form payload and sends an authenticated POST request.',
        kind: 'logic',
      },
      {
        id: 'route',
        eyebrow: 'API route',
        title: 'POST /bookings',
        file: 'server/routes/bookings.ts',
        line: 67,
        detail:
          'Checks authorization, parses the request, and delegates the command.',
        kind: 'api',
      },
      {
        id: 'service',
        eyebrow: 'Domain logic',
        title: 'BookingService.create',
        file: 'server/services/booking-service.ts',
        line: 91,
        detail:
          'Applies scheduling rules, calculates the quote, and creates the booking record.',
        kind: 'logic',
      },
      {
        id: 'store',
        eyebrow: 'Database',
        title: 'bookings.insert',
        file: 'server/db/schema/bookings.ts',
        line: 24,
        detail:
          'Persists the booking and returns its generated identifier and status.',
        kind: 'data',
      },
    ],
  },
  login: {
    label: 'User login',
    prompt: 'Trace the login flow from screen to session.',
    nodes: [
      {
        id: 'login-screen',
        eyebrow: 'Interface',
        title: 'Login screen',
        file: 'apps/mini/pages/login/index.tsx',
        line: 28,
        detail:
          'Starts the WeChat login handshake and displays recoverable errors.',
        kind: 'ui',
      },
      {
        id: 'auth-client',
        eyebrow: 'Client action',
        title: 'exchangeCode()',
        file: 'apps/mini/services/auth.ts',
        line: 14,
        detail:
          'Exchanges the temporary platform code for an application session.',
        kind: 'logic',
      },
      {
        id: 'auth-route',
        eyebrow: 'API route',
        title: 'POST /auth/login',
        file: 'server/routes/auth.ts',
        line: 39,
        detail: 'Validates the code and invokes the identity provider adapter.',
        kind: 'api',
      },
      {
        id: 'identity',
        eyebrow: 'Domain logic',
        title: 'AuthService.signIn',
        file: 'server/services/auth-service.ts',
        line: 55,
        detail:
          'Finds or creates the user and issues a short-lived session token.',
        kind: 'logic',
      },
      {
        id: 'users-store',
        eyebrow: 'Database',
        title: 'users.upsert',
        file: 'server/db/schema/users.ts',
        line: 31,
        detail:
          'Updates identity metadata without overwriting existing profile data.',
        kind: 'data',
      },
    ],
  },
  payment: {
    label: 'Payment callback',
    prompt: 'What happens after the payment provider calls back?',
    nodes: [
      {
        id: 'webhook',
        eyebrow: 'External event',
        title: 'Payment webhook',
        file: 'server/routes/payment-webhook.ts',
        line: 22,
        detail:
          'Receives the signed provider callback and preserves the raw request.',
        kind: 'api',
      },
      {
        id: 'signature',
        eyebrow: 'Security',
        title: 'verifySignature()',
        file: 'server/lib/payment-signature.ts',
        line: 41,
        detail:
          'Rejects replayed, expired, or incorrectly signed notifications.',
        kind: 'logic',
      },
      {
        id: 'payment-service',
        eyebrow: 'Domain logic',
        title: 'PaymentService.confirm',
        file: 'server/services/payment-service.ts',
        line: 76,
        detail:
          'Makes confirmation idempotent and advances the booking lifecycle.',
        kind: 'logic',
      },
      {
        id: 'transaction',
        eyebrow: 'Database',
        title: 'transaction()',
        file: 'server/db/transactions/payment.ts',
        line: 18,
        detail:
          'Commits the payment and booking status together as one atomic change.',
        kind: 'data',
      },
      {
        id: 'notification',
        eyebrow: 'Side effect',
        title: 'notifyCustomer()',
        file: 'server/jobs/send-booking-update.ts',
        line: 33,
        detail: 'Queues a confirmation message after the transaction succeeds.',
        kind: 'logic',
      },
    ],
  },
};

const kindIcon = { ui: Layers3, api: ServerCog, logic: Braces, data: Database };

export default function Home() {
  const [repoUrl, setRepoUrl] = useState(
    'https://github.com/Worshiper-lab/xingyue-housekeeping-platform',
  );
  const [activeFlow, setActiveFlow] = useState<FlowKey>('booking');
  const [selectedNode, setSelectedNode] = useState('service');
  const [copied, setCopied] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const flow = flows[activeFlow];
  const node = useMemo(
    () => flow.nodes.find((item) => item.id === selectedNode) ?? flow.nodes[0],
    [flow, selectedNode],
  );
  const selectFlow = (key: FlowKey) => {
    setActiveFlow(key);
    setSelectedNode(flows[key].nodes[0].id);
  };
  const analyze = () => {
    setAnalyzing(true);
    window.setTimeout(() => setAnalyzing(false), 900);
  };
  const copyContext = async () => {
    const mermaid = `flowchart LR\n${flow.nodes.map((item, index) => `${String.fromCharCode(65 + index)}["${item.title}"]${index < flow.nodes.length - 1 ? ` --> ${String.fromCharCode(66 + index)}` : ''}`).join('\n')}`;
    await navigator.clipboard?.writeText(mermaid);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-background/82 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-7">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-300 shadow-[0_0_28px_rgba(34,211,238,0.12)]">
              <Waypoints className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-[-0.025em]">
                  RepoJourney
                </span>
                <Badge className="h-4 border-violet-300/20 bg-violet-300/10 px-1.5 text-[9px] uppercase tracking-widest text-violet-200">
                  alpha
                </Badge>
              </div>
              <p className="hidden text-[10px] tracking-wide text-muted-foreground sm:block">
                From click to database
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={() =>
                window.open(
                  'https://github.com/Worshiper-lab',
                  '_blank',
                  'noopener,noreferrer',
                )
              }
            >
              <GitFork data-icon="inline-start" /> GitHub
            </Button>
            <Button
              className="bg-white text-zinc-950 hover:bg-cyan-100"
              onClick={copyContext}
            >
              {copied ? (
                <Check data-icon="inline-start" />
              ) : (
                <Copy data-icon="inline-start" />
              )}
              {copied ? 'Copied' : 'Export context'}
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-4 py-5 sm:px-7 sm:py-7">
        <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              <CircleDot className="size-3.5" /> Repository intelligence
            </div>
            <h1 className="max-w-3xl text-2xl font-semibold tracking-[-0.045em] sm:text-4xl">
              See how a feature actually works.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Follow a real user journey across screens, APIs, domain logic, and
              data — with evidence from the source.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-300/20 bg-amber-300/5 text-amber-200"
            >
              Interactive sample
            </Badge>
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/6 px-3 py-2 text-xs text-emerald-200">
              <LockKeyhole className="size-3.5" /> Read-only analysis · source
              stays private
            </div>
          </div>
        </div>
        <div className="mb-5 flex flex-col gap-2 rounded-2xl border border-white/9 bg-card p-2 shadow-2xl shadow-black/15 sm:flex-row">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
            <GitFork className="size-4 shrink-0 text-muted-foreground" />
            <Input
              aria-label="GitHub repository URL"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              className="h-10 border-0 bg-transparent px-1 font-mono text-xs shadow-none focus-visible:ring-0 sm:text-sm"
            />
          </div>
          <Button
            size="lg"
            onClick={analyze}
            disabled={analyzing || !repoUrl}
            className="h-10 bg-cyan-300 px-4 text-slate-950 hover:bg-cyan-200"
          >
            {analyzing ? (
              <Sparkles className="animate-pulse" data-icon="inline-start" />
            ) : (
              <Play data-icon="inline-start" />
            )}
            {analyzing ? 'Mapping repository…' : 'Analyze repository'}
          </Button>
        </div>

        <div className="grid overflow-hidden rounded-2xl border border-white/9 bg-card shadow-[0_30px_90px_rgba(0,0,0,0.24)] lg:grid-cols-[248px_minmax(0,1fr)_310px]">
          <aside className="border-b border-white/8 p-4 lg:border-b-0 lg:border-r">
            <div className="mb-4 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Detected journeys
              </span>
              <Badge
                variant="outline"
                className="border-white/10 text-muted-foreground"
              >
                3
              </Badge>
            </div>
            <div className="grid gap-1 sm:grid-cols-3 lg:grid-cols-1">
              {(Object.keys(flows) as FlowKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectFlow(key)}
                  className={`group rounded-xl border px-3 py-3 text-left transition ${activeFlow === key ? 'border-cyan-300/25 bg-cyan-300/9' : 'border-transparent hover:border-white/8 hover:bg-white/[0.025]'}`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-medium">
                    {flows[key].label}
                    <ChevronRight
                      className={`size-4 transition ${activeFlow === key ? 'text-cyan-300' : 'text-muted-foreground group-hover:translate-x-0.5'}`}
                    />
                  </span>
                  <span className="mt-1.5 block truncate text-[11px] text-muted-foreground">
                    {flows[key].nodes.length} evidence nodes
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-5 border-t border-white/8 pt-4">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Repository
              </p>
              <div className="space-y-2 px-1 text-xs text-muted-foreground">
                <p className="flex items-center gap-2">
                  <GitBranch className="size-3.5" /> main · 128 files
                </p>
                <p className="flex items-center gap-2">
                  <Code2 className="size-3.5" /> TypeScript · 84%
                </p>
                <p className="flex items-center gap-2">
                  <Check className="size-3.5 text-emerald-300" /> Indexed 18s
                  ago
                </p>
              </div>
            </div>
          </aside>

          <section className="min-w-0 p-4 sm:p-6">
            <div className="flex flex-col justify-between gap-3 border-b border-white/8 pb-5 sm:flex-row sm:items-start">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300">
                  Question
                </p>
                <h2 className="mt-1 text-lg font-medium tracking-tight sm:text-xl">
                  {flow.prompt}
                </h2>
              </div>
              <Badge className="border-emerald-300/20 bg-emerald-300/8 text-emerald-200">
                <Check /> 92% evidence coverage
              </Badge>
            </div>
            <div className="relative py-8">
              <div className="grid gap-3 xl:grid-cols-[repeat(5,minmax(118px,1fr))]">
                {flow.nodes.map((item, index) => {
                  const Icon = kindIcon[item.kind];
                  const active = item.id === node.id;
                  return (
                    <div
                      key={item.id}
                      className="relative flex min-w-0 items-stretch"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedNode(item.id)}
                        className={`group w-full rounded-xl border p-3 text-left transition duration-200 ${active ? 'border-cyan-300/45 bg-cyan-300/10 shadow-[0_0_30px_rgba(34,211,238,0.08)]' : 'border-white/9 bg-background/55 hover:-translate-y-0.5 hover:border-violet-300/30'}`}
                      >
                        <div
                          className={`mb-5 grid size-8 place-items-center rounded-lg ${active ? 'bg-cyan-300 text-slate-950' : 'bg-white/[0.055] text-violet-300'}`}
                        >
                          <Icon className="size-4" />
                        </div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
                          {item.eyebrow}
                        </p>
                        <h3 className="mt-1 truncate text-sm font-medium">
                          {item.title}
                        </h3>
                        <p className="mt-2 flex items-center gap-1 truncate font-mono text-[9px] text-muted-foreground">
                          <FileCode2 className="size-3 shrink-0" />{' '}
                          {item.file.split('/').at(-1)}:{item.line}
                        </p>
                      </button>
                      {index < flow.nodes.length - 1 && (
                        <ArrowRight className="absolute -right-5 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-cyan-300/60 xl:block" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-xl border border-white/8 bg-background/50 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-violet-300/10 text-violet-300">
                  <Sparkles className="size-3.5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-violet-200">
                    Journey summary
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    The request crosses {flow.nodes.length} verified code
                    locations. Validation happens before domain rules, and
                    persistence is isolated behind a dedicated data layer.
                    Select any node to inspect its evidence.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <aside className="border-t border-white/8 bg-background/30 p-5 lg:border-l lg:border-t-0">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Source evidence
              </span>
              <Badge
                variant="outline"
                className="border-cyan-300/20 text-cyan-200"
              >
                verified
              </Badge>
            </div>
            <div className="mb-5 grid size-10 place-items-center rounded-xl border border-violet-300/20 bg-violet-300/8 text-violet-300">
              {(() => {
                const Icon = kindIcon[node.kind];
                return <Icon className="size-5" />;
              })()}
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {node.eyebrow}
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">
              {node.title}
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {node.detail}
            </p>
            <button
              type="button"
              className="mt-5 w-full rounded-xl border border-white/8 bg-card p-3 text-left transition hover:border-cyan-300/25"
            >
              <p className="break-all font-mono text-[11px] leading-5 text-cyan-200">
                {node.file}
              </p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                Line {node.line} · View source
              </p>
            </button>
            <div className="mt-6 border-t border-white/8 pt-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Why it matters
              </p>
              <div className="space-y-3 text-xs leading-5 text-muted-foreground">
                <p className="flex gap-2">
                  <Search className="mt-0.5 size-3.5 shrink-0 text-violet-300" />{' '}
                  Cited directly from the indexed source tree.
                </p>
                <p className="flex gap-2">
                  <GitBranch className="mt-0.5 size-3.5 shrink-0 text-violet-300" />{' '}
                  Connected by imports, calls, and route bindings.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
