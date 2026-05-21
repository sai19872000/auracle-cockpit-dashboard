/* auracle cockpit — right inspector
   The inspector is a single component whose body switches on focusKind. */

const { useState: _useStateI } = React;

function Inspector({ focus, onClose, onNavigate }) {
  const [tab, setTab] = _useStateI('detail');

  React.useEffect(() => { setTab('detail'); }, [focus && focus.kind, focus && focus.id]);

  if (!focus) {
    return (
      <aside className="inspector" aria-hidden="true">
        <div className="inspector-h">
          <div className="crumb">inspector</div>
          <button className="icon-btn" aria-label="close inspector"><Icon name="close" /></button>
        </div>
        <div className="inspector-body">
          <Empty text="select a row to inspect it." />
        </div>
      </aside>
    );
  }

  const body = (() => {
    switch (focus.kind) {
      case 'agent':     return <AgentInspector focus={focus} tab={tab} setTab={setTab} onNavigate={onNavigate} />;
      case 'project':   return <ProjectInspector focus={focus} />;
      case 'event':     return <EventInspector focus={focus} />;
      case 'skill':     return <SkillInspector focus={focus} />;
      case 'memory':    return <MemoryInspector focus={focus} />;
      case 'newskill':  return <NewSkillInspector focus={focus} />;
      default:          return <Empty text="nothing to show." />;
    }
  })();

  return (
    <aside className={`inspector open`} role="complementary" aria-label="inspector">
      <div className="inspector-h">
        <div className="crumb">{focus.kind} <span className="dim">/</span> <strong>{focus.id}</strong></div>
        <button className="icon-btn" aria-label="close inspector" onClick={onClose} title="esc"><Icon name="close" /></button>
      </div>
      <div className="inspector-body">{body}</div>
    </aside>
  );
}

function AgentInspector({ focus, tab, setTab, onNavigate }) {
  const a = window.MOCK.AGENTS.find(x => x.id === focus.id);
  if (!a) return <Empty text="agent not found." />;

  return (
    <>
      <div className="persona-head">
        <div className="row-flex" style={{ gap: 14 }}>
          <AuraRing size={56} tone={a.health === 'down' ? 'bad' : a.health === 'warming' ? 'flare' : 'accent'} breathe={a.health !== 'down'} />
          <div>
            <div className="name">{a.name}</div>
            <div className="role">{a.role}</div>
          </div>
          <div className="spacer" />
          <span className={`status-pill ${a.health === 'healthy' ? '' : a.health}`}><span className="dot" />{a.health}</span>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'detail' ? 'active' : ''}`} onClick={() => setTab('detail')}>persona</button>
        <button className={`tab ${tab === 'invocations' ? 'active' : ''}`} onClick={() => setTab('invocations')}>invocations</button>
        <button className={`tab ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}>config</button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>history</button>
      </div>

      {tab === 'detail' && (
        <>
          <div className="prose" dangerouslySetInnerHTML={{ __html: a.desc.replace(/\*(.+?)\*/g, '<em>$1</em>') }} />
          <Sparkline points={a.opsPerMin} color="var(--aura-accent)" height={48} />
          <div className="dim mono-tag" style={{ marginTop: -6 }}>ops/min · last 24h</div>
        </>
      )}

      {tab === 'invocations' && (
        <div>
          <div className="kv" style={{ marginBottom: 12 }}>
            <dt>last 20</dt><dd>{a.invocations.length} invocations</dd>
          </div>
          <div>
            <div className="inv-row" style={{ color: 'var(--fg-3)' }}>
              <span>ts</span><span>step · skill</span><span>ms</span><span style={{ textAlign: 'right' }}>state</span>
            </div>
            {a.invocations.map(inv => (
              <div className="inv-row" key={inv.stepId}>
                <span className="ts">{window.MOCK.fmtTime(inv.ts).slice(0, 5)}</span>
                <span><strong style={{ color: 'var(--fg-1)' }}>{inv.skill}</strong> <span className="dim">{inv.stepId}</span></span>
                <span>{inv.durationMs}</span>
                <span style={{ textAlign: 'right' }}><StatusText s={inv.status} /></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'config' && (
        <dl className="kv">
          <dt>model</dt><dd>{a.config.model}</dd>
          <dt>tier</dt><dd>{a.tier}</dd>
          <dt>prompt sha</dt><dd>{a.config.promptSha}</dd>
          <dt>version</dt><dd>{a.config.version}</dd>
          <dt>tools</dt><dd>{a.config.tools.join(', ') || '—'}</dd>
        </dl>
      )}

      {tab === 'history' && (
        <div className="prose">
          <div className="dim mono-tag" style={{ marginBottom: 8 }}>chronological · week of may 11</div>
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid var(--rule)', fontSize: 12 }}>
              <span className="dim mono-tag">{['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][i % 7]} {String(7 + (i * 53) % 17).padStart(2, '0')}:{String((i * 37) % 60).padStart(2, '0')}</span>
              <div style={{ marginTop: 2 }}>
                {['compiled plan', 'dispatched step', 'reviewed output', 'returned recall', 'opened jules session', 'shipped revision'][i % 6]} · <code>stp_{(0xa000 + i * 17).toString(16)}</code>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ProjectInspector({ focus }) {
  const p = window.MOCK.PROJECTS.find(x => x.slug === focus.id);
  if (!p) return <Empty text="project not found." />;
  return (
    <>
      <div>
        <div className="dim mono-tag">project</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 300, letterSpacing: '-0.02em', marginTop: 4 }}>{p.slug}</div>
        <div className="dim" style={{ marginTop: 2, fontSize: 13 }}>{p.title}</div>
      </div>

      <dl className="kv">
        <dt>status</dt><dd><StatusText s={p.status} /></dd>
        <dt>repo</dt><dd><a className="gh-link" href="#" onClick={(e) => e.preventDefault()}><Icon name="gh" size={12} /> {p.repo}</a></dd>
        {p.url && <><dt>deploy url</dt><dd><a className="gh-link" href={p.url} onClick={(e) => e.preventDefault()}>{p.url.replace('https://', '')}</a></dd></>}
        <dt>intents</dt><dd>{p.intents}</dd>
        <dt>last intent</dt><dd>{window.MOCK.fmtRel(p.lastIntent)}</dd>
        {p.digest && <><dt>image</dt><dd>{p.digest}</dd></>}
      </dl>

      <div>
        <div className="dim mono-tag" style={{ marginBottom: 8 }}>recent intent history</div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--rule)', fontSize: 13, display: 'flex', gap: 12 }}>
            <span className="dim mono-tag" style={{ minWidth: 64 }}>{i + 1}d ago</span>
            <span>{['add empty state for /water', 'fix UTC date regression', 'rename queue → flow', 'tighten onboarding copy', 'add testflight build', 'enable jules on this repo'][i]}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="dim mono-tag" style={{ marginBottom: 8 }}>jules sessions</div>
        {p.hasJules ? (
          <>
            <div style={{ fontSize: 13, padding: '6px 0' }}><code>jls_8f02</code> <span className="dim">· merged · 4d ago</span></div>
            <div style={{ fontSize: 13, padding: '6px 0' }}><code>jls_8f51</code> <span className="dim">· open · 11h ago</span></div>
          </>
        ) : <Empty text="no jules sessions on this repo." />}
      </div>

      <div>
        <div className="dim mono-tag" style={{ marginBottom: 8 }}>retro mentions</div>
        <div style={{ fontSize: 13 }}>
          <span className="dim">2026-W19 · </span>cold-start regression noted as a loss.<br />
          <span className="dim">2026-W18 · </span>called out as a quiet win.
        </div>
      </div>
    </>
  );
}

function EventInspector({ focus }) {
  const e = focus.event;
  if (!e) return <Empty text="event not found." />;
  return (
    <>
      <div>
        <div className="dim mono-tag">event</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--fg-1)', marginTop: 4, letterSpacing: 0.5 }}>{e.id}</div>
      </div>
      <dl className="kv">
        <dt>ts</dt><dd>{new Date(e.ts).toISOString()}</dd>
        <dt>topic</dt><dd><TopicTag topic={e.topic} /></dd>
        <dt>skill</dt><dd>{e.skill}</dd>
        <dt>step</dt><dd>{e.stepId}</dd>
        <dt>status</dt><dd><StatusText s={e.status} /></dd>
      </dl>
      <div>
        <div className="dim mono-tag" style={{ marginBottom: 8 }}>payload</div>
        <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)', background: 'var(--aura-ink)', border: '1px solid var(--rule)', padding: 10, borderRadius: 4, margin: 0 }}>{`{
  "id": "${e.id}",
  "ts": ${e.ts},
  "topic": "${e.topic}",
  "skill": "${e.skill}",
  "step_id": "${e.stepId}",
  "status": "${e.status}"
}`}</pre>
      </div>
    </>
  );
}

function SkillInspector({ focus }) {
  const s = window.MOCK.SKILLS.find(x => x.id === focus.id);
  if (!s) return <Empty text="skill not found." />;
  return (
    <>
      <div>
        <div className="dim mono-tag">skill · {s.cat}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--fg-1)', marginTop: 4, letterSpacing: 0.5 }}>{s.id}</div>
        <div className="dim" style={{ marginTop: 4, fontSize: 13 }}>{s.desc}</div>
      </div>
      <dl className="kv">
        <dt>kind</dt><dd>{s.kind}</dd>
        <dt>model tier</dt><dd>{s.model}</dd>
        <dt>reversible</dt><dd>{s.reversible ? 'yes' : 'no'}</dd>
        <dt>tools</dt><dd>{s.tools.length ? s.tools.join(', ') : '—'}</dd>
        <dt>p(success)</dt><dd style={{ color: s.pSuccess > 0.9 ? 'var(--ok)' : s.pSuccess > 0.8 ? 'var(--warn)' : 'var(--bad)' }}>{(s.pSuccess * 100).toFixed(1)}%</dd>
        <dt>invocations 7d</dt><dd>{s.invocations.toLocaleString()}</dd>
      </dl>
      <div>
        <div className="dim mono-tag" style={{ marginBottom: 8 }}>body · markdown</div>
        <div className="prose">
          <p><strong>{s.id}</strong> is a {s.kind} skill in the <em>{s.cat}</em> family. {s.desc}.</p>
          <p>inputs are validated against <code>{s.id}.input.v1</code>; outputs are shape-checked by <code>verify.shape</code> before they land in memory.</p>
          {!s.reversible && <p>this skill is <strong>not reversible</strong>. orchestrator will not retry it without an explicit allow.</p>}
        </div>
      </div>
      <div>
        <div className="dim mono-tag" style={{ marginBottom: 8 }}>last 20 invocations</div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="inv-row">
            <span className="ts">{['14:42','14:38','14:29','14:11','13:58','13:44','13:30','13:19'][i]}</span>
            <span><span className="dim">stp_{(0xb000 + i * 41).toString(16)}</span></span>
            <span>{240 + i * 117}</span>
            <span style={{ textAlign: 'right' }}><StatusText s={i === 5 ? 'failed' : 'success'} /></span>
          </div>
        ))}
      </div>
    </>
  );
}

function MemoryInspector({ focus }) {
  const entry = focus.entry;
  return (
    <>
      <div>
        <div className="dim mono-tag">memory entry</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--fg-1)', marginTop: 4 }}>{entry.id}</div>
        <div className="dim mono-tag" style={{ marginTop: 4 }}>scope · {focus.scope}</div>
      </div>
      <dl className="kv">
        <dt>last recalled</dt><dd>{window.MOCK.fmtRel(entry.lastRecalledAt)}</dd>
        <dt>score</dt><dd style={{ color: 'var(--aura-accent)' }}>{entry.score}</dd>
      </dl>
      <div>
        <div className="dim mono-tag" style={{ marginBottom: 8 }}>content</div>
        <div className="prose" dangerouslySetInnerHTML={{ __html: entry.preview }} />
      </div>
      <div>
        <div className="dim mono-tag" style={{ marginBottom: 8 }}>written by</div>
        <div className="prose">
          <p><strong>worker</strong> via <code>memory.write</code> on a successful <em>code.implement</em> step.</p>
        </div>
      </div>
    </>
  );
}

function NewSkillInspector({ focus }) {
  const n = window.MOCK.NEW_SKILLS.find(x => x.id === focus.id);
  if (!n) return <Empty text="proposal not found." />;
  return (
    <>
      <div>
        <div className="dim mono-tag">proposed skill</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--fg-1)', marginTop: 4, letterSpacing: 0.5 }}>{n.name}</div>
        <div className="dim" style={{ marginTop: 4, fontSize: 13 }}>{n.desc}</div>
      </div>
      <dl className="kv">
        <dt>critic</dt><dd><span className={`pill ${n.critic}`} style={{
          padding: '2px 10px', borderRadius: 100,
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
          background: n.critic === 'approve' ? 'rgba(110,231,193,0.10)' : n.critic === 'revise' ? 'rgba(255,179,71,0.10)' : 'rgba(255,123,110,0.12)',
          color: n.critic === 'approve' ? 'var(--ok)' : n.critic === 'revise' ? 'var(--warn)' : 'var(--bad)',
        }}>{n.critic}</span></dd>
        <dt>human</dt><dd>{n.human}</dd>
      </dl>
      <div>
        <div className="dim mono-tag" style={{ marginBottom: 8 }}>source lessons</div>
        {n.sources.map((s, i) => (
          <div key={i} className="prose" style={{ paddingLeft: 12, borderLeft: '2px solid var(--rule)', marginBottom: 6 }}><span className="dim">{s}</span></div>
        ))}
      </div>
      <div>
        <div className="dim mono-tag" style={{ marginBottom: 8 }}>diff against current registry</div>
        <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)', background: 'var(--aura-ink)', border: '1px solid var(--rule)', padding: 10, borderRadius: 4, margin: 0, lineHeight: 1.55 }}>{
`+ skills/${n.name}.skill.md
+ id: ${n.name}
+ kind: thought
+ model_tier: sonnet
+ inputs: ${n.name}.input.v1
+ outputs: ${n.name}.output.v1
+ reversibility: true
+ ---
+ ${n.desc}.`}</pre>
      </div>
      <div className="row-flex" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="chip active">approve</button>
        <button className="chip">request changes</button>
        <button className="chip">reject</button>
      </div>
    </>
  );
}

window.Inspector = Inspector;
