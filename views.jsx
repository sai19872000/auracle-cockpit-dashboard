/* auracle cockpit — all 9 views.
   Each view is a self-contained React component. */

const { useState: __us, useEffect: __ue, useRef: __ur, useMemo: __um } = React;

// ─────────────────────────────────────────────────────────────────
// 1) OVERVIEW
// ─────────────────────────────────────────────────────────────────
function OverviewView({ inspect, listIdx, listLen, setListIdx, setListLen, listFocusOpen, setListFocusOpen }) {
  const { KPIS, EVENTS, INFLIGHT, fmtTime } = window.MOCK;
  const [events, setEvents] = __us(EVENTS);
  const [pinned, setPinned] = __us(false);
  const { lastEvent } = useEventStream(!pinned);
  const [freshIds, setFreshIds] = __us(new Set());

  __ue(() => {
    if (!lastEvent || pinned) return;
    setEvents((prev) => [lastEvent, ...prev].slice(0, 50));
    setFreshIds((prev) => new Set(prev).add(lastEvent.id));
    const t = setTimeout(() => {
      setFreshIds((prev) => {const s = new Set(prev);s.delete(lastEvent.id);return s;});
    }, 800);
    return () => clearTimeout(t);
  }, [lastEvent, pinned]);

  __ue(() => {setListLen(events.length);}, [events.length, setListLen]);

  // open inspector with Enter on the selected feed row
  __ue(() => {
    if (listFocusOpen && events[listIdx]) {
      inspect({ kind: 'event', id: events[listIdx].id, event: events[listIdx] });
      setListFocusOpen(false);
    }
  }, [listFocusOpen]);

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="stamp">overview</div>
          <h1>the floor at a glance.</h1>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="services up" val={KPIS.services_up.val} total={KPIS.services_up.total} delta={KPIS.services_up.delta} spark={KPIS.services_up.spark} tone="ok" />
        <Kpi label="intents · 24h" val={KPIS.intents_24h.val} delta={KPIS.intents_24h.delta} spark={KPIS.intents_24h.spark} tone="accent" />
        <Kpi label="deploys · 24h" val={KPIS.deploys_24h.val} delta={KPIS.deploys_24h.delta} spark={KPIS.deploys_24h.spark} tone="ok" />
        <Kpi label="p0 incidents · 24h" val={KPIS.p0_incidents_24h.val} alert delta={KPIS.p0_incidents_24h.delta} spark={KPIS.p0_incidents_24h.spark} tone="bad" deltaBad />
      </div>

      <div className="split-3-1">
        <div className="panel">
          <div className="panel-h">
            <div className="lbl">◐ live feed</div>
            <div className="row-flex">
              <span className="meta">factory.* · last 50</span>
              <button className={`feed-pin ${pinned ? 'active' : ''}`} onClick={() => setPinned((p) => !p)}>{pinned ? '◉ pinned' : '◯ pin'}</button>
            </div>
          </div>
          <div className="feed" role="listbox" aria-label="live feed">
            {events.map((e, i) =>
            <button
              key={e.id}
              className={`feed-row ${freshIds.has(e.id) ? 'fresh' : ''} ${i === listIdx ? 'selected' : ''}`}
              style={{ borderLeft: '2px solid', borderLeftColor: window.MOCK.TOPICS[e.topic] ? window.MOCK.TOPICS[e.topic].tone : 'transparent' }}
              onClick={() => {setListIdx(i);inspect({ kind: 'event', id: e.id, event: e });}}>
              
                <span className="ts">{fmtTime(e.ts).slice(0, 5)}</span>
                <TopicTag topic={e.topic} />
                <span className="skill">{e.skill}</span>
                <span className="step-id">{e.stepId}</span>
                <span className="status"><StatusText s={e.status} /></span>
              </button>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <div className="lbl">◐ in-flight</div>
            <div className="meta">{INFLIGHT.length} running · no eval yet</div>
          </div>
          <div className="inflight">
            {INFLIGHT.map((f) =>
            <div className="inflight-row" key={f.stepId}>
                <div className="skill">{f.skill}</div>
                <div className="elapsed"><Ticker startedAt={Date.now() - f.elapsedMs} /></div>
                <div className="step"><span className="dim">{f.stepId}</span> · {f.agent} · {f.project}</div>
                <div className="bar" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>);

}

function Kpi({ label, val, total, delta, spark, tone = 'accent', alert = false, deltaBad = false }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'bad' ? 'var(--bad)' : 'var(--aura-accent)';
  return (
    <div className={`kpi ${alert ? 'alert' : ''}`}>
      <div className="k-lbl">{label}</div>
      <div className="k-row">
        <div className="k-val">{val}</div>
        {total != null && <div className="k-total">/ {total}</div>}
      </div>
      <div className={`k-delta ${deltaBad ? 'bad' : ''}`}>{delta}</div>
      <Sparkline points={spark} color={color} />
    </div>);

}

function Ticker({ startedAt }) {
  const [now, setNow] = __us(Date.now());
  __ue(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, now - startedAt);
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return <span>{m > 0 ? `${m}m ${s % 60}s` : `${s}s`}</span>;
}

// ─────────────────────────────────────────────────────────────────
// 2) AGENTS
// ─────────────────────────────────────────────────────────────────
function AgentsView({ inspect, focusedId, listIdx, setListIdx, setListLen, listFocusOpen, setListFocusOpen }) {
  const { AGENTS, fmtRel } = window.MOCK;
  __ue(() => setListLen(AGENTS.length), [AGENTS.length]);
  __ue(() => {
    if (listFocusOpen && AGENTS[listIdx]) {
      inspect({ kind: 'agent', id: AGENTS[listIdx].id });
      setListFocusOpen(false);
    }
  }, [listFocusOpen]);

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="stamp">agents</div>
          <h1>eleven atomic agents, one floor.</h1>
        </div>
        <div className="row-flex">
          <span className="meta dim mono-tag">healthy · 9   warming · 2   down · 0</span>
        </div>
      </div>

      <div className="agent-grid">
        {AGENTS.map((a, i) =>
        <button
          key={a.id}
          className={`agent-card ${focusedId === a.id || i === listIdx ? 'selected' : ''}`}
          onClick={() => {setListIdx(i);inspect({ kind: 'agent', id: a.id });}}>
          
            <div className="row1">
              <AuraRing size={36} tone={a.health === 'warming' ? 'flare' : 'accent'} breathe={a.health !== 'down'} dim={a.health === 'down'} />
              <div style={{ flex: 1 }}>
                <div className="name" style={{ fontFamily: "Arial", lineHeight: "1.4" }}>{a.name}</div>
                <div className="role">{a.role}</div>
              </div>
            </div>
            <span className={`pill ${a.health}`}>{a.health}</span>
            <Sparkline points={a.opsPerMin} color={a.health === 'warming' ? 'var(--warn)' : 'var(--aura-accent)'} fill height={22} />
            <div className="meta-row">
              <span className="last">last · {fmtRel(a.lastActive)}</span>
              <span className="ops">{Math.round(a.opsPerMin.reduce((s, v) => s + v, 0) / a.opsPerMin.length)} ops/min</span>
            </div>
          </button>
        )}
      </div>
    </div>);

}

// ─────────────────────────────────────────────────────────────────
// 3) PROJECTS
// ─────────────────────────────────────────────────────────────────
const PROJECT_FILTERS = ['all', 'live', 'with-PR', 'with-jules-code', 'with-image', 'errored'];
function ProjectsView({ inspect, focusedId, listIdx, setListIdx, setListLen, listFocusOpen, setListFocusOpen }) {
  const { PROJECTS, fmtRel } = window.MOCK;
  const [filter, setFilter] = __us('all');
  const filtered = __um(() => PROJECTS.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'live') return p.status === 'live';
    if (filter === 'with-PR') return p.hasPR;
    if (filter === 'with-jules-code') return p.hasJules;
    if (filter === 'with-image') return p.hasImage;
    if (filter === 'errored') return p.errored;
    return true;
  }), [filter]);
  __ue(() => setListLen(filtered.length), [filtered.length]);
  __ue(() => {
    if (listFocusOpen && filtered[listIdx]) {
      inspect({ kind: 'project', id: filtered[listIdx].slug });
      setListFocusOpen(false);
    }
  }, [listFocusOpen]);

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="stamp">projects</div>
          <h1>{PROJECTS.length} products the floor has shipped.</h1>
        </div>
      </div>

      <div className="chips">
        {PROJECT_FILTERS.map((f) =>
        <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        )}
      </div>

      <div className="panel" style={{ overflow: 'visible' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 130 }}>slug</th>
                <th>repo</th>
                <th>deploy url</th>
                <th style={{ width: 90 }}>status</th>
                <th style={{ width: 140 }}>last intent</th>
                <th style={{ width: 80, textAlign: 'right' }}>intents</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 &&
              <tr><td colSpan={6}><Empty text="no projects match these filters." /></td></tr>
              }
              {filtered.map((p, i) =>
              <tr key={p.slug} className={focusedId === p.slug || i === listIdx ? 'selected' : ''} onClick={() => {setListIdx(i);inspect({ kind: 'project', id: p.slug });}}>
                  <td className="slug">{p.slug}<div className="dim" style={{ fontSize: 11, marginTop: 2 }}>{p.title}</div></td>
                  <td><a className="gh-link" href="#" onClick={(e) => {e.preventDefault();e.stopPropagation();}}><Icon name="gh" size={12} /> {p.repo}</a></td>
                  <td><span className="gh">{p.url ? p.url.replace('https://', '') : <span className="dim">—</span>}</span></td>
                  <td><StatusText s={p.status} /></td>
                  <td className="mono">{fmtRel(p.lastIntent)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{p.intents}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>);

}

// ─────────────────────────────────────────────────────────────────
// 4) COMMS
// ─────────────────────────────────────────────────────────────────
function CommsView({ inspect }) {
  const { THREADS, fmtRel } = window.MOCK;
  const [openIds, setOpenIds] = __us(new Set([THREADS[0].id]));
  const [expandedMsg, setExpandedMsg] = __us(new Set());
  const [filt, setFilt] = __us({ from: 'all', kind: 'all', hours: '24' });

  const filtered = THREADS.filter((t) => {
    if (filt.from !== 'all' && !t.chain.includes(filt.from)) return false;
    if (filt.kind !== 'all' && t.kind !== filt.kind) return false;
    return true;
  });

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="stamp">comms</div>
          <h1>agent-to-agent threads.</h1>
        </div>
        <span className="dim mono-tag">live · {THREADS.length} threads · last 4h</span>
      </div>

      <div className="row-flex wrap" style={{ gap: 16 }}>
        <FilterSelect label="from-agent" value={filt.from} onChange={(v) => setFilt({ ...filt, from: v })}
        options={['all', 'sol', 'orchestrator', 'worker', 'verifier', 'audit', 'incident', 'retro', 'skill_editor', 'jules_client', 'memory_bank']} />
        <FilterSelect label="kind" value={filt.kind} onChange={(v) => setFilt({ ...filt, kind: v })}
        options={['all', 'plan.dispatch', 'intent.intake', 'deploy.escalation', 'recall', 'lesson.compact']} />
        <FilterSelect label="last" value={filt.hours} onChange={(v) => setFilt({ ...filt, hours: v })}
        options={['1', '4', '24', '168']} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 && <Empty text="no threads match these filters." />}
        {filtered.map((t) => {
          const open = openIds.has(t.id);
          return (
            <div className={`thread`} key={t.id}>
              <div className="thread-h" onClick={() => {
                setOpenIds((s) => {const n = new Set(s);n.has(t.id) ? n.delete(t.id) : n.add(t.id);return n;});
              }}>
                <Icon name="chevron" size={12} className="dim" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms var(--ease)' }} />
                <div className="dag">
                  {t.chain.map((c, i) =>
                  <React.Fragment key={c + i}>
                      <span className="node">{c}</span>
                      {i < t.chain.length - 1 && <span className="arr" />}
                    </React.Fragment>
                  )}
                </div>
                <span className="kind">{t.kind}</span>
                <span className="when">{fmtRel(t.lastMs)}</span>
              </div>
              {open &&
              <div className="thread-body">
                  {t.messages.map((m, i) => {
                  const expandKey = t.id + '-' + i;
                  const exp = expandedMsg.has(expandKey);
                  const lines = m.payload.split('\n');
                  const truncated = lines.length > 8;
                  return (
                    <div className="msg" key={i}>
                        <div className="from">
                          {m.from} <span className="dim">→</span> {m.to}
                          <span className="skill">{m.skill}</span>
                        </div>
                        <div>
                          <div className={`payload ${exp ? 'expanded' : ''}`}>
                            {exp || !truncated ? m.payload : lines.slice(0, 8).join('\n')}
                          </div>
                          {truncated &&
                        <span className="payload-fade" onClick={() => setExpandedMsg((s) => {const n = new Set(s);exp ? n.delete(expandKey) : n.add(expandKey);return n;})}>
                              {exp ? 'collapse' : 'expand ' + (lines.length - 8) + ' more lines'}
                            </span>
                        }
                        </div>
                      </div>);

                })}
                </div>
              }
            </div>);

        })}
      </div>
    </div>);

}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="row-flex" style={{ gap: 8 }}>
      <span className="dim mono-tag">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: 'var(--aura-steel)',
          color: 'var(--fg-1)',
          border: '1px solid var(--rule)',
          borderRadius: 100,
          padding: '5px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.06em',
          outline: 'none'
        }}>
        
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>);

}

// ─────────────────────────────────────────────────────────────────
// 5) MEMORY
// ─────────────────────────────────────────────────────────────────
const MEMORY_TONES = { project: 'var(--t-task)', agent: 'var(--t-deploy)', user: 'var(--t-skill)', skill: 'var(--t-retro)' };
function MemoryView({ inspect }) {
  const { MEMORY, MEMORY_ENTRIES } = window.MOCK;
  const [scope, setScope] = __us('project:posy');
  const [q, setQ] = __us('');
  const entries = MEMORY_ENTRIES[scope] || [];
  const filtered = q ? entries.filter((e) => e.preview.toLowerCase().includes(q.toLowerCase())) : entries;

  const highlight = (text) => {
    if (!q) return text;
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return text.replace(re, '<mark>$1</mark>');
  };

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="stamp">memory</div>
          <h1>the floor's long memory.</h1>
        </div>
      </div>

      <div className="text-search">
        <Icon name="search" />
        <input placeholder="search across all scopes…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <span className="dim mono-tag">{filtered.length} hits</span>}
      </div>

      <div className="memory-cols">
        {['project', 'agent', 'user', 'skill'].map((s) =>
        <div className="panel memory-col" key={s} style={{ '--tone': MEMORY_TONES[s] }}>
            <div className="panel-h">
              <div className="lbl">{s + ':*'}</div>
              <div className="meta">{MEMORY[s].length} scopes</div>
            </div>
            <div className="scope-list">
              {MEMORY[s].map((sc) =>
            <button key={sc.name} className={`scope-row ${scope === sc.name ? 'selected' : ''}`} onClick={() => setScope(sc.name)}>
                  <span className="name">{sc.name}</span>
                  <span className="hits">{sc.hits.toLocaleString()} hits · {sc.entries}</span>
                </button>
            )}
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-h">
          <div className="lbl">{scope}</div>
          <div className="meta">{filtered.length} entries{q ? ' · matches highlighted' : ''}</div>
        </div>
        <div>
          {filtered.length === 0 ?
          <Empty text="no entries for this scope." /> :
          filtered.map((e) =>
          <button key={e.id} className="mem-entry" style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--rule)', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => inspect({ kind: 'memory', id: e.id, entry: e, scope })}>
                <span className="mid">{e.id}</span>
                <span className="preview" dangerouslySetInnerHTML={{ __html: highlight(e.preview) }} />
                <span className="meta">
                  <span>last recalled · {window.MOCK.fmtRel(e.lastRecalledAt)}</span>
                  <span className="score">score · {e.score}</span>
                </span>
              </button>
          )
          }
        </div>
      </div>
    </div>);

}

// ─────────────────────────────────────────────────────────────────
// 6) SKILLS · treemap
// ─────────────────────────────────────────────────────────────────
const SKILL_CATS = ['execution', 'verification', 'business', 'comms', 'governance', 'incident'];
const SKILL_CAT_TONES = { execution: 'var(--t-task)', verification: 'var(--t-deploy)', business: 'var(--t-skill)', comms: 'var(--t-comms)', governance: 'var(--t-audit)', incident: 'var(--t-incident)' };
function SkillsView({ inspect, focusedId }) {
  const { SKILLS } = window.MOCK;
  // For each cat, compute relative widths summing to 12 cols.
  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="stamp">skills</div>
          <h1>{SKILLS.length} skills · sized by use · colored by p(success).</h1>
        </div>
        <div className="dim mono-tag">last 7d</div>
      </div>

      <div className="panel">
        <div className="treemap">
          {SKILL_CATS.map((cat) => {
            const cells = SKILLS.filter((s) => s.cat === cat);
            const total = cells.reduce((s, c) => s + c.invocations, 0);
            return (
              <React.Fragment key={cat}>
                <div className="tm-cat-head" style={{ '--tone': SKILL_CAT_TONES[cat] }}>
                  {cat} <span className="dim">· {cells.length} skills · {total.toLocaleString()} runs</span>
                </div>
                {cells.map((s) => {
                  // weight in cols, between 2..8
                  const span = Math.max(2, Math.min(8, Math.round(s.invocations / total * 12)));
                  // color by p_success — green to amber to red
                  const bgAlpha = 0.10 + Math.min(0.35, s.invocations / 4000);
                  const bg = s.pSuccess > 0.92 ? `rgba(110,231,193,${bgAlpha})` :
                  s.pSuccess > 0.85 ? `rgba(255,179,71,${bgAlpha})` :
                  `rgba(255,123,110,${bgAlpha})`;
                  const borderC = s.pSuccess > 0.92 ? 'rgba(110,231,193,0.30)' :
                  s.pSuccess > 0.85 ? 'rgba(255,179,71,0.30)' :
                  'rgba(255,123,110,0.30)';
                  return (
                    <button
                      key={s.id}
                      className={`tm-cell ${focusedId === s.id ? 'selected' : ''}`}
                      style={{ gridColumn: 'span ' + span, background: bg, borderColor: borderC }}
                      onClick={() => inspect({ kind: 'skill', id: s.id })}>
                      
                      <div className="name">{s.id}</div>
                      <div className="stats">
                        <span>{s.invocations.toLocaleString()}</span>
                        <span className="succ">{(s.pSuccess * 100).toFixed(0)}%</span>
                      </div>
                    </button>);

                })}
              </React.Fragment>);

          })}
        </div>
      </div>
    </div>);

}

// ─────────────────────────────────────────────────────────────────
// 7) RETRO
// ─────────────────────────────────────────────────────────────────
function RetroView() {
  const { RETROS } = window.MOCK;
  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="stamp">retro</div>
          <h1>weekly retrospectives.</h1>
          <div className="sub">sundays · 18:00 et · authored by <code style={{ color: 'var(--aura-accent)' }}>retro</code></div>
        </div>
      </div>

      <div className="retro-feed">
        {RETROS.map((r) =>
        <div className="retro-card" key={r.week}>
            <div>
              <div className="stamp">◐ {r.week}</div>
              <div className="week" style={{ marginTop: 4 }}>{r.range}</div>
            </div>
            <div className="retro-grid">
              <div className="retro-list wins">
                <div className="head">top 3 wins</div>
                <ol>{r.wins.map((w, i) => <li key={i} dangerouslySetInnerHTML={{ __html: w }} />)}</ol>
              </div>
              <div className="retro-list">
                <div className="head">top 3 losses</div>
                <ol>{r.losses.map((w, i) => <li key={i} dangerouslySetInnerHTML={{ __html: w }} />)}</ol>
              </div>
            </div>
            <div className="retro-meta">
              <span>{r.intents} intents · {r.deploys} deploys · {r.p0} p0</span>
              <span>{r.lessons} lessons · {r.skillsCompacted} skills compacted</span>
              <a href="#" onClick={(e) => e.preventDefault()}>full markdown →</a>
            </div>
          </div>
        )}
      </div>
    </div>);

}

// ─────────────────────────────────────────────────────────────────
// 8) NEW SKILLS
// ─────────────────────────────────────────────────────────────────
function NewSkillsView({ inspect, focusedId, listIdx, setListIdx, setListLen, listFocusOpen, setListFocusOpen }) {
  const { NEW_SKILLS } = window.MOCK;
  __ue(() => setListLen(NEW_SKILLS.length), [NEW_SKILLS.length]);
  __ue(() => {
    if (listFocusOpen && NEW_SKILLS[listIdx]) {
      inspect({ kind: 'newskill', id: NEW_SKILLS[listIdx].id });
      setListFocusOpen(false);
    }
  }, [listFocusOpen]);

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="stamp">new skills</div>
          <h1>queue from <code style={{ color: 'var(--aura-accent)' }}>skill_editor</code>.</h1>
        </div>
        <div className="dim mono-tag">6 in queue · 1 approved · 3 pending · 1 rejected</div>
      </div>

      <div className="panel">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 110px 130px 90px', gap: 16, padding: '10px 16px', borderBottom: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
          <span>proposal</span>
          <span>source lessons</span>
          <span>critic</span>
          <span>human review</span>
          <span style={{ textAlign: 'right' }}>queued</span>
        </div>
        {NEW_SKILLS.map((n, i) =>
        <button key={n.id} className={`newskill-row ${focusedId === n.id || i === listIdx ? 'selected' : ''}`} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
        onClick={() => {setListIdx(i);inspect({ kind: 'newskill', id: n.id });}}>
            <div className="name">{n.name}<div className="desc">{n.desc}</div></div>
            <div className="src">{n.sources.map((s, j) => <div key={j} style={{ marginBottom: 2 }}>{s}</div>)}</div>
            <div><span className={`pill ${n.critic}`}>{n.critic}</span></div>
            <div className="human">{n.human}</div>
            <div className="when">{i + 1}h ago</div>
          </button>
        )}
      </div>
    </div>);

}

// ─────────────────────────────────────────────────────────────────
// 9) CHAT
// ─────────────────────────────────────────────────────────────────
function ChatView() {
  const { CHAT } = window.MOCK;
  const [msgs, setMsgs] = __us(CHAT);
  const [draft, setDraft] = __us('');
  const [planClosed, setPlanClosed] = __us(new Set());
  const threadRef = __ur(null);

  __ue(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [msgs.length]);

  // simulate steps advancing in the current plan
  __ue(() => {
    const id = setInterval(() => {
      setMsgs((prev) => {
        const next = [...prev];
        const planIdx = next.findIndex((m) => m.kind === 'plan');
        if (planIdx === -1) return prev;
        const plan = { ...next[planIdx], steps: next[planIdx].steps.map((s) => ({ ...s })) };
        let advanced = false;
        for (let i = 0; i < plan.steps.length; i++) {
          if (plan.steps[i].status === 'running') {
            plan.steps[i].status = 'success';
            if (i + 1 < plan.steps.length && plan.steps[i + 1].status === 'queued') {
              plan.steps[i + 1].status = 'running';
            }
            advanced = true;
            break;
          }
        }
        if (!advanced) return prev;
        next[planIdx] = plan;
        // when last running becomes success, append deploy artifact
        if (plan.steps.every((s) => s.status === 'success')) {
          next.push({
            kind: 'artifact-deploy',
            when: '14:57',
            title: 'laplight is live',
            url: 'https://laplight.run',
            meta: 'cloud-run · us-central1 · revision laplight-00007-bba'
          });
          next.push({
            kind: 'sol',
            when: '14:57',
            text: 'shipped. <strong>laplight</strong> — tap once per length. <em>good swim.</em>'
          });
        }
        return next;
      });
    }, 4500);
    return () => clearInterval(id);
  }, []);

  const publish = () => {
    if (!draft.trim()) return;
    setMsgs((m) => [...m, { kind: 'user', when: window.MOCK.fmtTime(Date.now()).slice(0, 5), text: draft }]);
    setDraft('');
    // sol replies + plan card stub
    setTimeout(() => {
      setMsgs((m) => [...m, { kind: 'sol', when: window.MOCK.fmtTime(Date.now()).slice(0, 5), text: '*received.* publishing to <code>factory.tasks</code>.' }]);
    }, 600);
  };

  return (
    <div className="work" style={{ position: 'static', display: 'contents' }}>
      <div className="chat-wrap">
        <div className="chat-thread" ref={threadRef}>
          {msgs.map((m, i) => {
            if (m.kind === 'user') return (
              <div className="chat-msg user" key={i}>
                <div className="who">you <span className="when">{m.when}</span></div>
                <div className="bubble">{m.text}</div>
              </div>);

            if (m.kind === 'sol') return (
              <div className="chat-msg sol" key={i}>
                <div className="who"><AuraRing size={14} /> sol <span className="when">{m.when}</span></div>
                <div className="bubble" dangerouslySetInnerHTML={{ __html: m.text }} />
              </div>);

            if (m.kind === 'plan') {
              const closed = planClosed.has(i);
              const ok = m.steps.filter((s) => s.status === 'success').length;
              return (
                <div className="chat-msg" key={i}>
                  <div className="who">orchestrator <span className="when">{m.when}</span></div>
                  <div className={`plan-card ${closed ? 'closed' : ''}`}>
                    <div className="ph" onClick={() => setPlanClosed((s) => {const n = new Set(s);n.has(i) ? n.delete(i) : n.add(i);return n;})}>
                      <Icon name="chevronD" size={12} className="chev" />
                      <span className="label">{m.title} · <span style={{ color: 'var(--fg-2)' }}>{m.project}</span></span>
                      <span className="count">{ok}/{m.steps.length} steps</span>
                    </div>
                    <div className="plan-body">
                      {m.steps.map((s) =>
                      <div className="step-row" key={s.stepId}>
                          <span className="n">{s.n}</span>
                          <span className="skill">{s.skill}<span className="desc">{s.desc}</span></span>
                          <span className="step-id">{s.stepId}</span>
                          <span className="status"><StatusText s={s.status} /></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>);

            }
            if (m.kind === 'artifact-deploy') return (
              <div className="chat-msg" key={i}>
                <div className="who">worker · deploy.cloud_run <span className="when">{m.when}</span></div>
                <div className="artifact">
                  <div className="ico"><Icon name="deploy" /></div>
                  <div>
                    <div className="stamp">◐ live</div>
                    <div className="title">{m.title} — <a href="#" onClick={(e) => e.preventDefault()}>{m.url.replace('https://', '')}</a></div>
                    <div className="meta">{m.meta}</div>
                  </div>
                  <div className="go"><Icon name="arrow" /></div>
                </div>
              </div>);

            if (m.kind === 'artifact-jules') return (
              <div className="chat-msg" key={i}>
                <div className="who">jules_client <span className="when">{m.when}</span></div>
                <div className="artifact">
                  <div className="ico"><Icon name="pr" /></div>
                  <div>
                    <div className="stamp">◐ pr opened</div>
                    <div className="title">{m.title}</div>
                    <div className="meta">{m.meta}</div>
                  </div>
                  <div className="go"><Icon name="arrow" /></div>
                </div>
              </div>);

            return null;
          })}
        </div>

        <div className="composer">
          <div className="composer-inner">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {e.preventDefault();publish();}}}
              placeholder="bring a sentence. the factory takes care of the rest."
              rows={1} />
            
            <div className="composer-actions">
              <span>publishes to <code style={{ color: 'var(--aura-accent)', background: 'rgba(138,182,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>factory.tasks</code></span>
              <span className="dim">⌘+enter</span>
              <button className="pub" onClick={publish} disabled={!draft.trim()}>
                publish <Icon name="arrow" size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>);

}

Object.assign(window, {
  OverviewView, AgentsView, ProjectsView, CommsView, MemoryView, SkillsView, RetroView, NewSkillsView, ChatView
});