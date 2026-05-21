/* auracle cockpit — mock data layer
   Everything is attached to window.MOCK and consumed by the React app.
   useEventStream() is a stubbed SSE hook that emits one new event per tick. */

(function () {
  // ────────────────────────────────────────────────────────────────
  // time helpers (relative to "now")
  const NOW = Date.now();
  const SEC = 1000, MIN = 60 * SEC, HR = 60 * MIN, DAY = 24 * HR;
  const fmtTime = (ts) => {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return hh + ':' + mm + ':' + ss;
  };
  const fmtRel = (ts) => {
    const d = NOW - ts;
    if (d < 60 * SEC) return Math.max(1, Math.round(d / SEC)) + 's ago';
    if (d < 60 * MIN) return Math.round(d / MIN) + 'm ago';
    if (d < 24 * HR)  return Math.round(d / HR) + 'h ago';
    return Math.round(d / DAY) + 'd ago';
  };

  // ────────────────────────────────────────────────────────────────
  // topics — palette tone per topic
  const TOPICS = {
    'factory.task':     { tone: 'var(--t-task)',     short: 'task'     },
    'factory.deploy':   { tone: 'var(--t-deploy)',   short: 'deploy'   },
    'factory.skill':    { tone: 'var(--t-skill)',    short: 'skill'    },
    'factory.audit':    { tone: 'var(--t-audit)',    short: 'audit'    },
    'factory.incident': { tone: 'var(--t-incident)', short: 'incident' },
    'factory.retro':    { tone: 'var(--t-retro)',    short: 'retro'    },
    'factory.comms':    { tone: 'var(--t-comms)',    short: 'comms'    },
    'factory.memory':   { tone: 'var(--t-memory)',   short: 'memory'   },
  };

  // ────────────────────────────────────────────────────────────────
  // agents — 11 atomic agents
  const AGENT_DEFS = [
    { id: 'sol',           role: 'intake classifier',  desc: '*sol* is the front door. she reads every intent, classifies intake, and replies with the Aura voice. she never deploys.', model: 'claude-haiku-4-5', tier: 'fast' },
    { id: 'orchestrator',  role: 'plan compiler',      desc: 'compiles an intent into a DAG of steps. owns retries and step-budget enforcement.', model: 'claude-sonnet-4-5', tier: 'plan' },
    { id: 'worker',        role: 'step executor',      desc: 'the muscle of the floor. consumes <code>factory.tasks</code>, invokes the named skill, publishes the result.', model: 'claude-sonnet-4-5', tier: 'core' },
    { id: 'listener',      role: 'event router',       desc: 'subscribes to every <code>factory.*</code> topic and fans out to interested agents. no business logic.', model: 'cpu-only', tier: 'infra' },
    { id: 'audit',         role: 'security review',    desc: 'reads every deploy plan before it ships. flags secrets, reverse-shell shapes, package risk.', model: 'claude-sonnet-4-5', tier: 'governance' },
    { id: 'incident',      role: 'p0 handler',         desc: 'wakes on <code>factory.incident</code>. opens a triage doc, gathers context, drafts the rollback.', model: 'claude-sonnet-4-5', tier: 'governance' },
    { id: 'retro',         role: 'weekly historian',   desc: 'wakes Sundays 18:00 ET. summarises the week from the event log into wins, losses, lessons.', model: 'claude-sonnet-4-5', tier: 'background' },
    { id: 'verifier',      role: 'output critic',      desc: 'reads every step output before it lands in memory. blocks shape mismatches. never modifies.', model: 'claude-haiku-4-5', tier: 'fast' },
    { id: 'skill_editor',  role: 'skill smith',        desc: 'reads retro lessons, drafts new skills, posts to <code>new-skills</code> queue for review.', model: 'claude-sonnet-4-5', tier: 'background' },
    { id: 'jules_client',  role: 'jules bridge',       desc: 'talks to Google Jules. opens sessions, drafts PRs, watches CI back.', model: 'tool-only', tier: 'tool' },
    { id: 'memory_bank',   role: 'memory store',       desc: 'the floor\'s long memory. semantic + scoped recall over project / agent / user / skill namespaces.', model: 'embed-3-large', tier: 'infra' },
  ];

  const healthRoll = (i) => i === 4 ? 'warming' : (i === 9 ? 'warming' : 'healthy');
  const opsRoll = (seed) => {
    // deterministic-looking ops/min sparkline (24 points)
    const out = [];
    let v = 5 + (seed * 3) % 8;
    for (let i = 0; i < 24; i++) {
      v += ((Math.sin(seed + i * 0.7) + Math.cos(i * 0.43 + seed)) * 2);
      v = Math.max(0.5, v + (i === 18 ? 6 : 0));
      out.push(v);
    }
    return out;
  };
  const AGENTS = AGENT_DEFS.map((a, i) => ({
    ...a,
    name: a.id,
    health: healthRoll(i),
    lastActive: NOW - (15 + i * 9) * SEC,
    opsPerMin: opsRoll(i),
    config: {
      model: a.model,
      promptSha: '0x' + (0x4a2b9c00 + i * 0xa31).toString(16).padStart(8, '0'),
      version: 'v' + (1 + i % 3) + '.' + (i * 2 + 7),
      tools: i === 2 ? ['shell', 'http', 'fs', 'kubectl'] : i === 9 ? ['jules-api', 'gh-api'] : i === 10 ? ['pgvector', 'pg', 's3'] : ['http'],
    },
    invocations: Array.from({ length: 20 }, (_, k) => ({
      ts: NOW - (k + 1) * (35 + (i * 11) % 90) * SEC,
      stepId: 'stp_' + (0x9100 + i * 73 + k * 11).toString(16),
      skill: ['spec.write', 'code.scaffold', 'deploy.cloud_run', 'audit.review', 'recall.scoped', 'verify.shape', 'plan.compile'][k % 7],
      durationMs: 240 + (i * 30 + k * 70) % 4800,
      status: (k === 3 || (i === 4 && k === 1)) ? 'failed' : (k === 7 ? 'partial' : 'success'),
    })),
  }));

  // ────────────────────────────────────────────────────────────────
  // projects
  const PROJECTS = [
    { slug: 'posy',       title: 'a houseplant memory keeper',     repo: 'saitejaa/posy',       url: 'https://posy-app.run',           status: 'live',    intents: 47, lastIntent: NOW - 18 * MIN,  hasPR: true,  hasJules: true,  hasImage: true,  errored: false, digest: 'sha256:9a31…f2c1' },
    { slug: 'tideline',   title: 'menstrual moon-tide tracker',    repo: 'saitejaa/tideline',   url: 'https://tideline.run',           status: 'live',    intents: 32, lastIntent: NOW - 42 * MIN,  hasPR: true,  hasJules: false, hasImage: true,  errored: false, digest: 'sha256:c2d1…aa07' },
    { slug: 'orchard',    title: 'shared-laundry queue',           repo: 'saitejaa/orchard',    url: 'https://orchard.run',            status: 'partial', intents: 18, lastIntent: NOW - 4  * HR,   hasPR: true,  hasJules: true,  hasImage: false, errored: true,  digest: 'sha256:11ff…0a32' },
    { slug: 'tide',       title: 'ocean swim conditions',          repo: 'saitejaa/tide',       url: 'https://tide.run',               status: 'live',    intents: 22, lastIntent: NOW - 2  * HR,   hasPR: false, hasJules: false, hasImage: true,  errored: false, digest: 'sha256:7780…1a99' },
    { slug: 'umber',      title: 'pour-over recipe coach',         repo: 'saitejaa/umber',      url: 'https://umber-app.run',          status: 'live',    intents: 14, lastIntent: NOW - 6  * HR,   hasPR: true,  hasJules: false, hasImage: true,  errored: false, digest: 'sha256:0420…fe14' },
    { slug: 'glasshouse', title: 'a planetarium for your week',    repo: 'saitejaa/glasshouse', url: 'https://glasshouse.run',         status: 'live',    intents: 11, lastIntent: NOW - 9  * HR,   hasPR: true,  hasJules: true,  hasImage: true,  errored: false, digest: 'sha256:90c4…b711' },
    { slug: 'auracle',    title: 'this dashboard',                 repo: 'saitejaa/auracle',    url: 'https://auracle.saiteja.ai',     status: 'live',    intents: 8,  lastIntent: NOW - 11 * HR,   hasPR: true,  hasJules: false, hasImage: false, errored: false, digest: 'sha256:f01a…7c20' },
    { slug: 'fledge',     title: 'first-flight learn-to-code',     repo: 'saitejaa/fledge',     url: 'https://fledge.run',             status: 'partial', intents: 6,  lastIntent: NOW - 1  * DAY,  hasPR: false, hasJules: true,  hasImage: false, errored: false, digest: 'sha256:8821…3320' },
    { slug: 'kestrel',    title: 'tiny screenshot OCR',            repo: 'saitejaa/kestrel',    url: '',                               status: 'dead',    intents: 3,  lastIntent: NOW - 4  * DAY,  hasPR: false, hasJules: false, hasImage: false, errored: true,  digest: '' },
    { slug: 'lattice',    title: 'recipe ingredient graph',        repo: 'saitejaa/lattice',    url: 'https://lattice.run',            status: 'live',    intents: 9,  lastIntent: NOW - 14 * HR,   hasPR: true,  hasJules: false, hasImage: true,  errored: false, digest: 'sha256:1aab…ccd0' },
  ];

  // ────────────────────────────────────────────────────────────────
  // skills — grouped by category
  const SKILLS = [
    // execution
    { id: 'code.scaffold',       cat: 'execution',    desc: 'scaffold a next.js+ts repo from a brief', invocations: 412, pSuccess: 0.94, kind: 'tool', model: 'sonnet', reversible: true,  tools: ['fs','shell','npm'] },
    { id: 'code.implement',      cat: 'execution',    desc: 'implement a single file from a spec',     invocations: 1247, pSuccess: 0.91, kind: 'tool', model: 'sonnet', reversible: true,  tools: ['fs'] },
    { id: 'deploy.cloud_run',    cat: 'execution',    desc: 'build container, push, ship to cloud run',invocations: 188, pSuccess: 0.87, kind: 'tool', model: 'sonnet', reversible: false, tools: ['docker','gcloud'] },
    { id: 'deploy.image.build',  cat: 'execution',    desc: 'build a Dockerfile from a tree',          invocations: 196, pSuccess: 0.92, kind: 'tool', model: 'haiku',  reversible: true,  tools: ['docker'] },
    { id: 'spec.write',          cat: 'execution',    desc: 'turn an intent into a one-pager spec',    invocations: 240, pSuccess: 0.96, kind: 'thought', model: 'sonnet', reversible: true, tools: [] },
    { id: 'jules.open_session',  cat: 'execution',    desc: 'open a jules session against a repo',     invocations: 73, pSuccess: 0.84, kind: 'tool', model: 'sonnet', reversible: true, tools: ['jules-api'] },
    // verification
    { id: 'verify.shape',        cat: 'verification', desc: 'JSON-schema match the step output',       invocations: 1502, pSuccess: 0.97, kind: 'thought', model: 'haiku', reversible: true, tools: [] },
    { id: 'verify.test',         cat: 'verification', desc: 'run unit + e2e tests, report failures',   invocations: 388, pSuccess: 0.79, kind: 'tool', model: 'haiku', reversible: true, tools: ['shell'] },
    { id: 'verify.a11y',         cat: 'verification', desc: 'axe + custom rules; min AA',              invocations: 124, pSuccess: 0.81, kind: 'tool', model: 'haiku', reversible: true, tools: ['browser'] },
    // business
    { id: 'business.naming',     cat: 'business',     desc: 'name a product in the Aura voice',        invocations: 41,  pSuccess: 0.92, kind: 'thought', model: 'sonnet', reversible: true, tools: [] },
    { id: 'business.pricing',    cat: 'business',     desc: 'draft a 3-tier pricing page',             invocations: 17,  pSuccess: 0.88, kind: 'thought', model: 'sonnet', reversible: true, tools: [] },
    // comms
    { id: 'comms.tg.reply',      cat: 'comms',        desc: 'reply to a telegram intent',              invocations: 92,  pSuccess: 0.97, kind: 'tool', model: 'haiku', reversible: true, tools: ['tg-bot'] },
    { id: 'comms.email.draft',   cat: 'comms',        desc: 'draft an outbound email',                 invocations: 22,  pSuccess: 0.95, kind: 'thought', model: 'haiku', reversible: true, tools: [] },
    // governance
    { id: 'audit.review',        cat: 'governance',   desc: 'review a deploy plan for risk',           invocations: 188, pSuccess: 0.93, kind: 'thought', model: 'sonnet', reversible: true, tools: [] },
    { id: 'audit.secrets_scan',  cat: 'governance',   desc: 'scan a tree for leaked secrets',          invocations: 188, pSuccess: 0.99, kind: 'tool', model: 'haiku', reversible: true, tools: ['rg'] },
    // incident
    { id: 'incident.triage',     cat: 'incident',     desc: 'open a triage doc, gather context',       invocations: 11,  pSuccess: 0.91, kind: 'thought', model: 'sonnet', reversible: true, tools: [] },
    { id: 'incident.rollback',   cat: 'incident',     desc: 'roll back to a prior cloud-run revision', invocations: 6,   pSuccess: 0.83, kind: 'tool', model: 'sonnet', reversible: true, tools: ['gcloud'] },
  ];

  // ────────────────────────────────────────────────────────────────
  // event stream — last 50 (rendered in overview)
  const EVT_TEMPLATES = [
    { topic: 'factory.task',     skill: 'spec.write',         status: 'success' },
    { topic: 'factory.task',     skill: 'code.scaffold',      status: 'success' },
    { topic: 'factory.task',     skill: 'code.implement',     status: 'running' },
    { topic: 'factory.task',     skill: 'verify.shape',       status: 'success' },
    { topic: 'factory.deploy',   skill: 'deploy.image.build', status: 'success' },
    { topic: 'factory.deploy',   skill: 'deploy.cloud_run',   status: 'running' },
    { topic: 'factory.audit',    skill: 'audit.review',       status: 'success' },
    { topic: 'factory.audit',    skill: 'audit.secrets_scan', status: 'success' },
    { topic: 'factory.skill',    skill: 'skill.compact',      status: 'success' },
    { topic: 'factory.skill',    skill: 'skill.propose',      status: 'success' },
    { topic: 'factory.comms',    skill: 'comms.tg.reply',     status: 'success' },
    { topic: 'factory.memory',   skill: 'recall.scoped',      status: 'success' },
    { topic: 'factory.memory',   skill: 'memory.write',       status: 'success' },
    { topic: 'factory.retro',    skill: 'retro.summarize',    status: 'queued' },
    { topic: 'factory.task',     skill: 'verify.test',        status: 'failed' },
    { topic: 'factory.incident', skill: 'incident.triage',    status: 'success' },
  ];
  const makeEvent = (i) => {
    const t = EVT_TEMPLATES[i % EVT_TEMPLATES.length];
    return {
      id: 'evt_' + (NOW - i * 1234).toString(36),
      ts: NOW - i * (12 + (i * 7) % 40) * SEC,
      topic: t.topic,
      skill: t.skill,
      stepId: 'stp_' + (0xb000 + i * 41).toString(16),
      status: t.status,
    };
  };
  const EVENTS = Array.from({ length: 50 }, (_, i) => makeEvent(i));

  // in-flight (no eval yet)
  const INFLIGHT = [
    { stepId: 'stp_b400',  skill: 'code.implement',    elapsedMs: 4_800,  agent: 'worker',       project: 'posy'       },
    { stepId: 'stp_b431',  skill: 'deploy.cloud_run',  elapsedMs: 31_200, agent: 'worker',       project: 'orchard'    },
    { stepId: 'stp_b44a',  skill: 'verify.test',       elapsedMs: 7_400,  agent: 'verifier',     project: 'tideline'   },
    { stepId: 'stp_b4b1',  skill: 'audit.review',      elapsedMs: 1_900,  agent: 'audit',        project: 'glasshouse' },
    { stepId: 'stp_b4cc',  skill: 'jules.open_session', elapsedMs: 14_800, agent: 'jules_client', project: 'fledge'     },
  ];

  // ────────────────────────────────────────────────────────────────
  // comms — threads
  const THREADS = [
    {
      id: 'th_1',
      chain: ['orchestrator', 'worker', 'verifier'],
      kind: 'plan.dispatch',
      project: 'posy',
      lastMs: NOW - 42 * SEC,
      messages: [
        { from: 'orchestrator', to: 'worker',   skill: 'plan.compile',
          payload: `{
  "intent": "add an empty-state for the posy /water page",
  "steps": [
    { "id": "stp_b400", "skill": "code.implement", "file": "app/water/page.tsx" },
    { "id": "stp_b401", "skill": "verify.test",    "scope": "water" }
  ],
  "budget_steps": 8,
  "budget_ms": 240000
}`,
          ts: NOW - 62 * SEC,
        },
        { from: 'worker', to: 'verifier', skill: 'verify.shape',
          payload: `{
  "step": "stp_b400",
  "output": { "files_changed": ["app/water/page.tsx"], "lines": 38 },
  "expected_shape": "code.implement.result.v2"
}`,
          ts: NOW - 48 * SEC,
        },
        { from: 'verifier', to: 'orchestrator', skill: 'plan.advance',
          payload: `{ "step": "stp_b400", "status": "success", "next": "stp_b401" }`,
          ts: NOW - 42 * SEC,
        },
      ],
    },
    {
      id: 'th_2',
      chain: ['sol', 'orchestrator'],
      kind: 'intent.intake',
      project: 'tideline',
      lastMs: NOW - 3 * MIN,
      messages: [
        { from: 'sol', to: 'orchestrator', skill: 'intent.classify',
          payload: `{
  "from": "tg://saiteja",
  "raw": "tideline is showing UTC dates again",
  "classified": "bug.regression",
  "project": "tideline",
  "severity": "p2"
}`,
          ts: NOW - 3 * MIN - 4 * SEC,
        },
        { from: 'orchestrator', to: 'sol', skill: 'intake.ack',
          payload: `{ "ack": "received", "queued_as": "stp_b3e0", "eta_ms": 90000 }`,
          ts: NOW - 3 * MIN,
        },
      ],
    },
    {
      id: 'th_3',
      chain: ['worker', 'audit', 'incident'],
      kind: 'deploy.escalation',
      project: 'orchard',
      lastMs: NOW - 11 * MIN,
      messages: [
        { from: 'worker', to: 'audit', skill: 'audit.review',
          payload: `{
  "service": "orchard-api",
  "diff": "+adds outbound webhook to 167.99.x.y",
  "risk": "outbound.unknown_host"
}`, ts: NOW - 12 * MIN,
        },
        { from: 'audit', to: 'incident', skill: 'audit.flag',
          payload: `{ "verdict": "block", "reason": "outbound.host not on allow-list", "step": "stp_b212" }`,
          ts: NOW - 11 * MIN - 30 * SEC,
        },
        { from: 'incident', to: 'worker', skill: 'plan.halt',
          payload: `{ "halt": true, "rollback": "rev-orchard-api-00029-zzx" }`,
          ts: NOW - 11 * MIN,
        },
      ],
    },
    {
      id: 'th_4',
      chain: ['memory_bank', 'worker'],
      kind: 'recall',
      project: 'umber',
      lastMs: NOW - 22 * MIN,
      messages: [
        { from: 'worker', to: 'memory_bank', skill: 'recall.scoped',
          payload: `{ "scope": "project:umber", "query": "how did we handle the burr-mill measurement bug?", "top_k": 5 }`,
          ts: NOW - 22 * MIN - 8 * SEC,
        },
        { from: 'memory_bank', to: 'worker', skill: 'recall.return',
          payload: `{ "hits": 4, "top_id": "mem_07f3a1", "score": 0.91 }`,
          ts: NOW - 22 * MIN,
        },
      ],
    },
    {
      id: 'th_5',
      chain: ['retro', 'skill_editor'],
      kind: 'lesson.compact',
      project: '—',
      lastMs: NOW - 2 * HR,
      messages: [
        { from: 'retro', to: 'skill_editor', skill: 'lesson.emit',
          payload: `{
  "week": "2026-W19",
  "lesson_id": "lsn_028",
  "title": "always verify cloud-run revision URL before posting",
  "evidence_steps": ["stp_a112", "stp_a14e"]
}`, ts: NOW - 2 * HR,
        },
      ],
    },
  ];

  // ────────────────────────────────────────────────────────────────
  // memory
  const MEMORY = {
    'project': [
      { name: 'project:posy',       hits: 412, entries: 12 },
      { name: 'project:tideline',   hits: 304, entries: 9 },
      { name: 'project:orchard',    hits: 188, entries: 14 },
      { name: 'project:umber',      hits: 96,  entries: 6 },
      { name: 'project:glasshouse', hits: 71,  entries: 5 },
      { name: 'project:auracle',    hits: 48,  entries: 4 },
      { name: 'project:tide',       hits: 33,  entries: 3 },
    ],
    'agent': [
      { name: 'agent:orchestrator', hits: 1284, entries: 22 },
      { name: 'agent:worker',       hits: 2103, entries: 41 },
      { name: 'agent:audit',        hits: 422,  entries: 14 },
      { name: 'agent:verifier',     hits: 1108, entries: 16 },
      { name: 'agent:sol',          hits: 318,  entries: 9 },
    ],
    'user': [
      { name: 'user:saiteja',       hits: 1024, entries: 38 },
      { name: 'user:tg:saiteja',    hits: 412,  entries: 22 },
    ],
    'skill': [
      { name: 'skill:code.implement',   hits: 1247, entries: 28 },
      { name: 'skill:verify.shape',     hits: 1502, entries: 17 },
      { name: 'skill:deploy.cloud_run', hits: 188,  entries: 11 },
      { name: 'skill:audit.review',     hits: 188,  entries: 9 },
      { name: 'skill:spec.write',       hits: 240,  entries: 12 },
    ],
  };
  const MEMORY_ENTRIES = {
    'project:posy': [
      { id: 'mem_07a1', preview: 'water-cycle uses local time of the device, never UTC. cron is fine with UTC because the alarm only fires on day boundaries.', lastRecalledAt: NOW - 3 * MIN, score: 0.94 },
      { id: 'mem_07a2', preview: 'plant species → watering interval lookup lives in <code>data/species.json</code>; never compute it on the fly.', lastRecalledAt: NOW - 22 * MIN, score: 0.92 },
      { id: 'mem_07a3', preview: 'when a plant is repotted, do not reset its memory log; mark a "repotted_at" timestamp instead.', lastRecalledAt: NOW - 1 * HR, score: 0.88 },
      { id: 'mem_07a4', preview: 'photos resize to 1080 long-edge, jpeg q82, in worker not on main thread.', lastRecalledAt: NOW - 3 * HR, score: 0.81 },
      { id: 'mem_07a5', preview: 'the empty-state copy on /water is "no thirsty plants today. quiet good news." — keep it.', lastRecalledAt: NOW - 8 * HR, score: 0.79 },
    ],
    'project:tideline': [
      { id: 'mem_08b1', preview: 'render dates in the user\'s tz; only persist UTC. the dates regression of 2026-W17 was caused by the calendar grid component.', lastRecalledAt: NOW - 5 * MIN, score: 0.93 },
      { id: 'mem_08b2', preview: 'the moon-tide animation only runs when prefers-reduced-motion is no-preference.', lastRecalledAt: NOW - 2 * HR, score: 0.84 },
    ],
    'agent:worker': [
      { id: 'mem_w101', preview: 'on cloud-run deploy, after revision is created, poll /readyz for up to 90s before declaring success.', lastRecalledAt: NOW - 9 * MIN, score: 0.95 },
      { id: 'mem_w102', preview: 'never write to fs outside the workspace dir. workspace is rotated per step.', lastRecalledAt: NOW - 1 * HR, score: 0.93 },
      { id: 'mem_w103', preview: 'jules sessions are billed; only open one when the diff is > 60 lines.', lastRecalledAt: NOW - 3 * HR, score: 0.89 },
    ],
    'user:saiteja': [
      { id: 'mem_u01', preview: 'prefers lowercase in product names. dislikes em-dashes in the brand voice; ok in code.', lastRecalledAt: NOW - 30 * MIN, score: 0.91 },
      { id: 'mem_u02', preview: 'when shipping a new app, always print the cloud-run url in the telegram reply.', lastRecalledAt: NOW - 4 * HR, score: 0.90 },
    ],
    'skill:code.implement': [
      { id: 'mem_s01', preview: 'on next.js app router, never write a "use client" without a clear reason; default is server.', lastRecalledAt: NOW - 20 * MIN, score: 0.96 },
      { id: 'mem_s02', preview: 'prefer tailwind utilities over css modules unless the file already uses modules.', lastRecalledAt: NOW - 2 * HR, score: 0.84 },
    ],
  };

  // ────────────────────────────────────────────────────────────────
  // retros
  const RETROS = [
    {
      week: '2026-W19', range: 'May 10 – May 16',
      wins: [
        'shipped <strong>auracle</strong> end-to-end in 9 minutes from intent.',
        'three jules sessions merged without human review — voice held.',
        '<code>verify.shape</code> caught two malformed cloud-run plans before deploy.',
      ],
      losses: [
        'orchard cloud-run revision wedged on cold start for 4 minutes.',
        '<code>code.implement</code> regressed on next.js 15 server actions twice.',
        'jules took 11 minutes on a 40-line PR.',
      ],
      lessons: 5, skillsCompacted: 2, intents: 47, deploys: 18, p0: 1,
    },
    {
      week: '2026-W18', range: 'May 3 – May 9',
      wins: [
        'tideline back to live after a clean rollback in 38 seconds.',
        'first week with no human-written code shipped to prod.',
        'orchestrator step budget dropped to a median of 6.',
      ],
      losses: [
        'two false-positive audit blocks on outbound webhook hosts.',
        '<strong>kestrel</strong> stayed dead all week — nobody picked it up.',
      ],
      lessons: 3, skillsCompacted: 1, intents: 38, deploys: 14, p0: 0,
    },
    {
      week: '2026-W17', range: 'Apr 26 – May 2',
      wins: [
        'memory recall latency below 80ms at p95 for the first time.',
        '<code>spec.write</code> output stopped using corporate phrasing entirely.',
      ],
      losses: [
        'tideline showed UTC dates in user-tz views; rolled out 2 days late.',
        'three p2 incidents in one day on orchard.',
      ],
      lessons: 4, skillsCompacted: 0, intents: 41, deploys: 12, p0: 2,
    },
  ];

  // ────────────────────────────────────────────────────────────────
  // new skills queue
  const NEW_SKILLS = [
    { id: 'ns_01', name: 'deploy.cloud_run.warmup',  desc: 'pre-warm a cloud-run revision before flipping traffic', sources: ['lsn_028 — orchard cold-start, 2026-W19', 'lsn_011 — tideline rollback, 2026-W18'], critic: 'approve',    human: 'pending' },
    { id: 'ns_02', name: 'verify.next15.server_actions', desc: 'shape-check the new server-action payload', sources: ['lsn_031 — next 15 regression, 2026-W19'], critic: 'approve', human: 'approved' },
    { id: 'ns_03', name: 'audit.allowlist.update',   desc: 'safely add a host to the outbound allowlist', sources: ['lsn_029 — orchard webhook, 2026-W19', 'lsn_025 — tide CDN, 2026-W18'], critic: 'revise', human: 'pending' },
    { id: 'ns_04', name: 'incident.user_notify',     desc: 'draft a brief, calm telegram update when a user-facing service is degraded', sources: ['lsn_021 — orchard, 2026-W18'], critic: 'approve', human: 'pending' },
    { id: 'ns_05', name: 'comms.tg.summary',         desc: 'roll up the day\'s ships into one telegram message at 22:00', sources: ['lsn_033 — too many small messages, 2026-W19'], critic: 'revise', human: 'rejected' },
    { id: 'ns_06', name: 'business.testimonial.gather', desc: 'fan out a one-line "how is it going" message to past intents', sources: ['lsn_018 — silent users, 2026-W17'], critic: 'reject', human: 'pending' },
  ];

  // ────────────────────────────────────────────────────────────────
  // chat (current chat-view content)
  const CHAT = [
    {
      kind: 'user',
      when: '14:48',
      text: 'build a tiny lap-swim pace counter app. tap once per length, it tracks splits and shows pace. mobile-first.',
    },
    {
      kind: 'sol',
      when: '14:48',
      text: '*holding that.* a tap-per-length lap counter, splits, pace. mobile-first. i\'ll publish it to the floor.',
    },
    {
      kind: 'plan',
      when: '14:48',
      title: 'orchestrator plan',
      project: 'lap-counter',
      steps: [
        { n: 1, skill: 'spec.write',         desc: 'one-page spec for lap counter',          stepId: 'stp_b500', status: 'success' },
        { n: 2, skill: 'business.naming',    desc: 'name the product in the Aura voice',    stepId: 'stp_b501', status: 'success' },
        { n: 3, skill: 'code.scaffold',      desc: 'scaffold next.js + ts + tailwind',      stepId: 'stp_b502', status: 'success' },
        { n: 4, skill: 'code.implement',     desc: 'implement /counter, /splits, /history', stepId: 'stp_b503', status: 'running' },
        { n: 5, skill: 'verify.test',        desc: 'unit + e2e for tap → split logic',      stepId: 'stp_b504', status: 'queued' },
        { n: 6, skill: 'audit.review',       desc: 'review the deploy plan',                stepId: 'stp_b505', status: 'queued' },
        { n: 7, skill: 'deploy.image.build', desc: 'build container',                       stepId: 'stp_b506', status: 'queued' },
        { n: 8, skill: 'deploy.cloud_run',   desc: 'ship to cloud run',                     stepId: 'stp_b507', status: 'queued' },
      ],
    },
    {
      kind: 'sol',
      when: '14:50',
      text: 'naming returned <em>laplight</em>. the floor liked it.',
    },
    {
      kind: 'artifact-jules',
      when: '14:51',
      title: 'jules opened a PR — implement core tap-and-split logic',
      meta: '+184 / -0 · 7 files · saitejaa/laplight#3',
    },
  ];

  // ────────────────────────────────────────────────────────────────
  // sparkline data — random walks
  function spark(seed, n, base, range, peakAt) {
    const out = []; let v = base;
    for (let i = 0; i < n; i++) {
      v += (Math.sin(seed + i * 0.6) + Math.cos(i * 0.31 + seed)) * range * 0.18;
      if (peakAt != null && i === peakAt) v += range * 0.6;
      out.push(Math.max(0, v));
    }
    return out;
  }
  const KPIS = {
    services_up:    { val: 8,  total: 10, delta: '+1 since 06:00', spark: spark(1, 24, 8, 2)             },
    intents_24h:    { val: 47,            delta: '+12 vs prior day', spark: spark(2, 24, 1.5, 5, 14)     },
    deploys_24h:    { val: 18,            delta: '+5 vs prior day',  spark: spark(3, 24, 0.5, 3, 16)     },
    p0_incidents_24h:{ val: 1, alert: true, delta: '+1 in last 4h', spark: spark(4, 24, 0, 1, 19)        },
  };

  // ────────────────────────────────────────────────────────────────
  // global search items
  const SEARCH_ITEMS = [
    ...AGENTS.map(a => ({ kind: 'agent',   label: a.id,                   meta: a.role,                 nav: { view: 'agents', id: a.id }   })),
    ...PROJECTS.map(p => ({ kind: 'project', label: p.slug,               meta: p.title,                nav: { view: 'projects', id: p.slug } })),
    ...SKILLS.map(s => ({ kind: 'skill',   label: s.id,                   meta: s.desc,                 nav: { view: 'skills', id: s.id }   })),
    { kind: 'view', label: 'overview',      meta: 'kpis · live feed · in-flight',     nav: { view: 'overview' } },
    { kind: 'view', label: 'agents',        meta: '11 atomic agents',                 nav: { view: 'agents' } },
    { kind: 'view', label: 'projects',      meta: 'products auracle has built',       nav: { view: 'projects' } },
    { kind: 'view', label: 'comms',         meta: 'agent-to-agent threads',           nav: { view: 'comms' } },
    { kind: 'view', label: 'memory',        meta: 'scoped recall',                    nav: { view: 'memory' } },
    { kind: 'view', label: 'skills',        meta: 'treemap of skill use',             nav: { view: 'skills' } },
    { kind: 'view', label: 'retro',         meta: 'weekly retrospectives',            nav: { view: 'retro' } },
    { kind: 'view', label: 'new skills',    meta: 'proposed by skill_editor',         nav: { view: 'newskills' } },
    { kind: 'view', label: 'chat',          meta: 'publish an intent to the floor',   nav: { view: 'chat' } },
    { kind: 'event', label: 'p0 incident · orchard cold-start', meta: '14 min ago',  nav: { view: 'overview' } },
    { kind: 'event', label: 'deploy.cloud_run · stp_b431',      meta: 'running',     nav: { view: 'overview' } },
  ];

  // ────────────────────────────────────────────────────────────────
  // expose
  window.MOCK = {
    NOW, SEC, MIN, HR, DAY,
    fmtTime, fmtRel,
    TOPICS,
    AGENTS, AGENT_DEFS,
    PROJECTS,
    SKILLS,
    EVENTS, makeEvent,
    INFLIGHT,
    THREADS,
    MEMORY, MEMORY_ENTRIES,
    RETROS,
    NEW_SKILLS,
    CHAT,
    KPIS,
    SEARCH_ITEMS,
  };
})();
