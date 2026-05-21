/* auracle cockpit — shared primitives
   Exports onto window: AuraRing, Sparkline, TopicTag, StatusPill, StatusText,
   Icon, useEventStream, useLastActivity, fmt utilities. */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

const { fmtTime, fmtRel, TOPICS, NOW: NOW_BASE } = window.MOCK;

// ── Aura breathing ring ─────────────────────────────────────────
function AuraRing({ size = 36, tone = 'accent', breathe = true, dim = false }) {
  const stroke = tone === 'accent' ? '#8AB6FF'
    : tone === 'flare' ? '#FFB347'
    : tone === 'ok' ? '#6EE7C1'
    : tone === 'bad' ? '#FF7B6E'
    : '#C9D7E8';
  const heartR = size > 60 ? 6 : size > 40 ? 5 : 4;
  return (
    <svg className="ring" viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx="50" cy="50" r="42" fill="none" stroke="#C9D7E8" strokeWidth="0.42" opacity={dim ? 0.25 : 0.4} />
      <circle cx="50" cy="50" r="34" fill="none" stroke="#C9D7E8" strokeWidth="0.42" opacity={dim ? 0.4 : 0.6} />
      <circle cx="50" cy="50" r="26" fill="none" stroke={stroke} strokeWidth="0.7" opacity={dim ? 0.6 : 1} />
      {breathe
        ? <circle cx="50" cy="50" r={heartR} fill={stroke}>
            <animate attributeName="r" values={`${heartR};${heartR + 3};${heartR}`} dur="4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.65;1" dur="4s" repeatCount="indefinite" />
          </circle>
        : <circle cx="50" cy="50" r={heartR} fill={stroke} opacity={dim ? 0.7 : 1} />}
    </svg>
  );
}

// ── Sparkline ─────────────────────────────────────────────────
function Sparkline({ points, color = 'var(--aura-accent)', width = 120, height = 28, fill = true, dim = false }) {
  if (!points || points.length === 0) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = (max - min) || 1;
  const stepX = width / (points.length - 1);
  const path = points.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
  }).join(' ');
  const area = path + ` L${width.toFixed(2)},${height} L0,${height} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height} style={{ opacity: dim ? 0.4 : 1 }}>
      {fill && <path d={area} fill={color} opacity="0.10" />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Topic tag ─────────────────────────────────────────────────
function TopicTag({ topic }) {
  const t = TOPICS[topic] || { tone: 'var(--fg-3)', short: topic };
  return (
    <span className="topic-tag" style={{ '--tone': t.tone }}>
      {t.short}
    </span>
  );
}

// ── Status pill (top bar) ─────────────────────────────────────
function StatusPill({ state }) {
  const cls = state === 'live' ? '' : state === 'degraded' ? 'degraded' : 'down';
  return (
    <span className={`status-pill ${cls}`}>
      <span className="dot" />
      {state}
    </span>
  );
}

// ── Status text (table cells, plan steps) ─────────────────────
function StatusText({ s }) {
  const map = {
    success: 'ok',
    ok: 'ok',
    failed: 'bad',
    error: 'bad',
    dead: 'bad',
    partial: 'warn',
    warming: 'warn',
    queued: 'queued',
    running: 'run',
    live: 'ok',
    healthy: 'ok',
    down: 'bad',
  };
  return <span className={`status-text ${map[s] || 'queued'}`}>{s}</span>;
}

// ── Icon (from sprite or inline) ──────────────────────────────
function Icon({ name, size = 16, className = '' }) {
  // Use inline minimal icons to avoid sprite import dance.
  const paths = {
    overview: <path d="M3 13l4-4 4 3 6-7M14 5h6v6" />,
    agents:   <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></>,
    projects: <><rect x="3" y="6" width="7" height="6" rx="1" /><rect x="14" y="6" width="7" height="6" rx="1" /><rect x="3" y="15" width="7" height="6" rx="1" /><rect x="14" y="15" width="7" height="6" rx="1" /></>,
    comms:    <><path d="M21 12c0 4-4 7-9 7a10 10 0 01-3-.5L4 20l1-3a7 7 0 01-2-5c0-4 4-7 9-7s9 3 9 7z"/></>,
    memory:   <><ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/><path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/></>,
    skills:   <><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.7L12 16.4 6.8 19l1-5.7L3.5 9.2l5.9-.9z"/></>,
    retro:    <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    newskills:<><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
    chat:     <><path d="M4 5h16v11H8l-4 4z"/></>,
    search:   <><circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/></>,
    bell:     <><path d="M6 9a6 6 0 1112 0c0 6 2 8 2 8H4s2-2 2-8z"/><path d="M10 20a2 2 0 004 0"/></>,
    chevron:  <path d="M9 6l6 6-6 6" />,
    chevronD: <path d="M6 9l6 6 6-6" />,
    close:    <><path d="M6 6l12 12M18 6L6 18" /></>,
    rail:     <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,
    pin:      <><path d="M12 17v4M9 8h6l-1 5H10z"/><path d="M9 8V5h6v3"/></>,
    deploy:   <><path d="M5 19l14-7L5 5l3 7-3 7z"/></>,
    pr:       <><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5V18M18 15.5V12a4 4 0 00-4-4h-3"/></>,
    file:     <><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/></>,
    filter:   <><path d="M4 5h16l-6 8v6l-4-2v-4z"/></>,
    user:     <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></>,
    gh:       <><path d="M12 2a10 10 0 00-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.5 2.4 1.1 3 .8.1-.7.4-1.1.6-1.4-2.3-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.5-1.3.1-2.7 0 0 .9-.3 2.8 1A9.6 9.6 0 0112 6.8c.9 0 1.8.1 2.6.4 2-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7.7.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7 1 .7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0012 2z"/></>,
    diff:     <><path d="M9 4v6M6 7h6M9 14v6M6 17h6M16 8h5M16 16h5"/></>,
    inspect:  <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M14 3v18M3 14h11"/></>,
    play:     <path d="M7 5l12 7-12 7z" />,
    arrow:    <path d="M5 12h14M13 6l6 6-6 6" />,
  };
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || null}
    </svg>
  );
}

// ── useEventStream — stubbed SSE hook ─────────────────────────
// Emits a fresh event every ~2.5s while subscribers exist.
const __streamState = {
  listeners: new Set(),
  timer: null,
  counter: 0,
  paused: false,
};
function startStream() {
  if (__streamState.timer) return;
  const tick = () => {
    if (__streamState.paused || __streamState.listeners.size === 0) return;
    const i = ++__streamState.counter;
    const SKILL_POOL = ['code.implement','spec.write','verify.shape','deploy.image.build','audit.review','recall.scoped','verify.test','comms.tg.reply','jules.open_session'];
    const TOPIC_POOL = ['factory.task','factory.task','factory.task','factory.deploy','factory.audit','factory.memory','factory.skill','factory.comms'];
    const STATUS_POOL = ['success','success','success','success','running','running','queued','partial','failed'];
    const ev = {
      id: 'evt_live_' + i.toString(36),
      ts: Date.now(),
      topic: TOPIC_POOL[i % TOPIC_POOL.length],
      skill: SKILL_POOL[i % SKILL_POOL.length],
      stepId: 'stp_' + (0xc000 + i * 41).toString(16),
      status: STATUS_POOL[i % STATUS_POOL.length],
    };
    __streamState.listeners.forEach(fn => fn(ev));
  };
  __streamState.timer = setInterval(tick, 2500);
}
function useEventStream(enabled = true) {
  const [lastEvent, setLastEvent] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    const handler = (ev) => setLastEvent(ev);
    __streamState.listeners.add(handler);
    startStream();
    return () => { __streamState.listeners.delete(handler); };
  }, [enabled]);
  return { lastEvent, pauseStream: (p) => { __streamState.paused = !!p; } };
}

// ── useLastActivity — pulses on each new event ────────────────
function useLastActivity() {
  const [ts, setTs] = useState(Date.now());
  const [pulse, setPulse] = useState(false);
  const { lastEvent } = useEventStream(true);
  useEffect(() => {
    if (!lastEvent) return;
    setTs(lastEvent.ts);
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 800);
    return () => clearTimeout(t);
  }, [lastEvent]);

  // tick the relative label every 5s
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force(n => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  return { ts, pulse };
}

// ── Empty / Error / Skeleton primitives ───────────────────────
function Empty({ text = 'nothing here yet.' }) {
  return <div className="empty">{text}</div>;
}
function ErrBox({ head = 'something went wrong', message, stack }) {
  return (
    <div className="err">
      <div className="head">{head}</div>
      <div>{message}</div>
      {stack && (
        <details>
          <summary>stack</summary>
          <pre>{stack}</pre>
        </details>
      )}
    </div>
  );
}
function SkelRows({ n = 6, h = 22 }) {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skel" style={{ height: h, width: (60 + (i * 13) % 35) + '%' }} />
      ))}
    </div>
  );
}

function setStreamPaused(p) { __streamState.paused = !!p; }

Object.assign(window, {
  AuraRing, Sparkline, TopicTag, StatusPill, StatusText, Icon,
  useEventStream, useLastActivity, setStreamPaused,
  Empty, ErrBox, SkelRows,
});
