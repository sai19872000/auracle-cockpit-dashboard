/* auracle cockpit — top-level shell.
   Wires together rail, topbar, view router, inspector, cmd+k, keyboard, tweaks. */

const { useState: us, useEffect: ue, useRef: ur, useCallback: uc, useMemo: umm } = React;

// ── nav definition ─────────────────────────────────────────────
const VIEWS = [
  { id: 'overview',  label: 'overview',   icon: 'overview',  key: 'o' },
  { id: 'agents',    label: 'agents',     icon: 'agents',    key: 'a' },
  { id: 'projects',  label: 'projects',   icon: 'projects',  key: 'p' },
  { id: 'comms',     label: 'comms',      icon: 'comms',     key: 'c' },
  { id: 'memory',    label: 'memory',     icon: 'memory',    key: 'm' },
  { id: 'skills',    label: 'skills',     icon: 'skills',    key: 's' },
  { id: 'retro',     label: 'retro',      icon: 'retro',     key: 'r' },
  { id: 'newskills', label: 'new skills', icon: 'newskills', key: 'n' },
  { id: 'chat',      label: 'chat',       icon: 'chat',      key: null, divider: true },
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "default",
  "theme": "dark",
  "rail": "expanded",
  "stream": "on",
  "accent": "#8AB6FF"
}/*EDITMODE-END*/;

function App() {
  // tweaks
  const tweaks = window.useTweaks ? window.useTweaks(TWEAK_DEFAULTS) : { state: TWEAK_DEFAULTS, set: () => {} };
  const t = tweaks.state || TWEAK_DEFAULTS;
  const setTweak = tweaks.set || (() => {});

  // route
  const [view, setView] = us('overview');
  const [focus, setFocus] = us(null); // inspector focus
  const [railCollapsed, setRailCollapsed] = us(t.rail === 'collapsed');
  ue(() => setRailCollapsed(t.rail === 'collapsed'), [t.rail]);

  // list focus state — shared so j/k works across views
  const [listIdx, setListIdx] = us(0);
  const [listLen, setListLen] = us(0);
  const [listFocusOpen, setListFocusOpen] = us(false);

  ue(() => { setListIdx(0); setFocus(null); }, [view]);

  // theme & accent on root
  ue(() => {
    document.documentElement.setAttribute('data-theme', t.theme || 'dark');
    document.documentElement.setAttribute('data-density', t.density || 'default');
    document.documentElement.style.setProperty('--aura-accent', t.accent || '#8AB6FF');
  }, [t.theme, t.density, t.accent]);

  // cmd+k palette
  const [paletteOpen, setPaletteOpen] = us(false);

  // notifications count
  const [incidents] = us(1);

  // last activity stamp
  const { ts: lastTs, pulse: lastPulse } = useLastActivity();
  const [, force] = us(0);
  ue(() => { const t = setInterval(() => force(n => n + 1), 1000); return () => clearInterval(t); }, []);
  const lastRel = window.MOCK.fmtRel(lastTs);

  // status
  const [streamState] = us('live');

  // ── keyboard ──
  const goSequenceRef = ur({ active: false, t: 0 });
  uc(() => {}, []);
  ue(() => {
    const onKey = (e) => {
      // ignore when typing in inputs
      const tag = (e.target.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable);

      // cmd/ctrl + k anywhere
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(p => !p);
        return;
      }

      if (paletteOpen) return; // palette owns the rest while open

      if (isTyping) return;

      if (e.key === 'Escape') {
        if (focus) { setFocus(null); return; }
      }

      // g + letter for view navigation
      const now = Date.now();
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
        goSequenceRef.current = { active: true, t: now };
        return;
      }
      if (goSequenceRef.current.active && (now - goSequenceRef.current.t) < 1200) {
        const v = VIEWS.find(x => x.key === e.key.toLowerCase());
        if (v) { e.preventDefault(); setView(v.id); goSequenceRef.current.active = false; return; }
        goSequenceRef.current.active = false;
      }

      // j/k list navigation
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setListIdx(i => Math.min(listLen - 1, i + 1));
        return;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setListIdx(i => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        setListFocusOpen(true);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, focus, listLen]);

  // navigation from palette
  const goTo = (nav) => {
    if (nav.view) setView(nav.view);
    if (nav.id) {
      const kindByView = { agents: 'agent', projects: 'project', skills: 'skill', newskills: 'newskill' };
      setTimeout(() => setFocus({ kind: kindByView[nav.view] || nav.view, id: nav.id }), 60);
    }
    setPaletteOpen(false);
  };

  const inspect = (f) => setFocus(f);

  // crumbs
  const currentView = VIEWS.find(v => v.id === view);
  const crumbView = currentView ? currentView.label : view;

  return (
    <>
      <div className={`app ${railCollapsed ? 'rail-collapsed' : ''}`}>
        {/* Left rail */}
        <aside className="rail">
          <div className="rail-brand">
            <AuraRing size={22} />
            <span className="word">auracle<span className="dot">.</span></span>
          </div>
          <nav className="rail-nav" aria-label="primary">
            <div className="group">cockpit</div>
            {VIEWS.slice(0, 8).map(v => (
              <button key={v.id} className={`rail-item ${view === v.id ? 'active' : ''}`} onClick={() => setView(v.id)} title={`g ${v.key}`}>
                <Icon name={v.icon} className="ic" />
                <span>{v.label}</span>
                {v.id === 'overview' && <span className="badge">{incidents}</span>}
                {v.key && <span className="kbd">g {v.key}</span>}
              </button>
            ))}
            <div className="group">action</div>
            <button className={`rail-item ${view === 'chat' ? 'active' : ''}`} onClick={() => setView('chat')}>
              <Icon name="chat" className="ic" />
              <span>chat</span>
              <span className="kbd">g h</span>
            </button>
          </nav>
          <div className="rail-foot">
            <AuraRing size={20} />
            <div className="meta">47 agents · <strong>9</strong> awake</div>
            <button className="collapser" onClick={() => setRailCollapsed(c => { const n = !c; setTweak('rail', n ? 'collapsed' : 'expanded'); return n; })} title={railCollapsed ? 'expand' : 'collapse'}>
              <Icon name="rail" size={14} />
            </button>
          </div>
        </aside>

        {/* Top bar */}
        <header className="topbar">
          <div className="crumbs">~ <span className="sep">/</span> auracle <span className="sep">/</span> <strong>{crumbView}</strong></div>
          <button className="search-btn" onClick={() => setPaletteOpen(true)} aria-label="open search">
            <Icon name="search" size={14} />
            <span>search events, agents, projects…</span>
            <span className="kbd">⌘K</span>
          </button>
          <div className="spacer" />
          <StatusPill state={streamState} />
          <button className="icon-btn" aria-label="notifications" title={`${incidents} unresolved incidents`}>
            <Icon name="bell" />
            {incidents > 0 && <span className="count">{incidents}</span>}
          </button>
          <span className={`last-active ${lastPulse ? 'pulsing' : ''}`} title="last event from /events/stream">
            <span className="pip" />
            last activity {lastRel}
          </span>
        </header>

        {/* Work area */}
        <main className="work">
          {view === 'overview'  && <OverviewView  inspect={inspect} listIdx={listIdx} listLen={listLen} setListIdx={setListIdx} setListLen={setListLen} listFocusOpen={listFocusOpen} setListFocusOpen={setListFocusOpen} />}
          {view === 'agents'    && <AgentsView    inspect={inspect} focusedId={focus && focus.kind === 'agent' && focus.id}    listIdx={listIdx} setListIdx={setListIdx} setListLen={setListLen} listFocusOpen={listFocusOpen} setListFocusOpen={setListFocusOpen} />}
          {view === 'projects'  && <ProjectsView  inspect={inspect} focusedId={focus && focus.kind === 'project' && focus.id}  listIdx={listIdx} setListIdx={setListIdx} setListLen={setListLen} listFocusOpen={listFocusOpen} setListFocusOpen={setListFocusOpen} />}
          {view === 'comms'     && <CommsView     inspect={inspect} />}
          {view === 'memory'    && <MemoryView    inspect={inspect} />}
          {view === 'skills'    && <SkillsView    inspect={inspect} focusedId={focus && focus.kind === 'skill' && focus.id} />}
          {view === 'retro'     && <RetroView     />}
          {view === 'newskills' && <NewSkillsView inspect={inspect} focusedId={focus && focus.kind === 'newskill' && focus.id} listIdx={listIdx} setListIdx={setListIdx} setListLen={setListLen} listFocusOpen={listFocusOpen} setListFocusOpen={setListFocusOpen} />}
          {view === 'chat'      && <ChatView      />}

          <Inspector focus={focus} onClose={() => setFocus(null)} onNavigate={goTo} />
        </main>
      </div>

      {paletteOpen && <CmdKPalette onClose={() => setPaletteOpen(false)} onGo={goTo} />}

      <CockpitTweaks t={t} setTweak={setTweak} />
    </>
  );
}

// ── cmd+k palette ──
function CmdKPalette({ onClose, onGo }) {
  const [q, setQ] = us('');
  const [idx, setIdx] = us(0);
  const inputRef = ur(null);
  const { SEARCH_ITEMS } = window.MOCK;

  ue(() => { inputRef.current && inputRef.current.focus(); }, []);

  const filtered = umm(() => {
    if (!q) return SEARCH_ITEMS.slice(0, 12);
    const lq = q.toLowerCase();
    return SEARCH_ITEMS.filter(s => s.label.toLowerCase().includes(lq) || s.meta.toLowerCase().includes(lq) || s.kind.toLowerCase().includes(lq)).slice(0, 20);
  }, [q]);

  ue(() => { setIdx(0); }, [q]);

  const submit = () => {
    const r = filtered[idx];
    if (r) onGo(r.nav);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter')     { e.preventDefault(); submit(); }
  };

  return (
    <div className="kpalette-backdrop" onClick={onClose}>
      <div className="kpalette" onClick={e => e.stopPropagation()}>
        <div className="kpalette-input">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="search across events, agents, projects, skills…"
          />
          <span className="dim mono-tag">⌘K</span>
        </div>
        <div className="kpalette-list">
          {filtered.length === 0
            ? <div className="kpalette-empty">no results.</div>
            : filtered.map((r, i) => (
              <div key={r.kind + r.label + i} className={`kp-row ${i === idx ? 'active' : ''}`}
                onMouseEnter={() => setIdx(i)}
                onClick={() => onGo(r.nav)}>
                <span className="kind">{r.kind}</span>
                <span className="label">{r.label}</span>
                <span className="meta">{r.meta}</span>
              </div>
            ))}
        </div>
        <div className="kpalette-foot">
          <span><kbd>↑↓</kbd>navigate</span>
          <span><kbd>↵</kbd>open</span>
          <span><kbd>esc</kbd>close</span>
          <span style={{ marginLeft: 'auto' }}>events · agents · projects · skills</span>
        </div>
      </div>
    </div>
  );
}

// ── Tweaks panel ──
function CockpitTweaks({ t, setTweak }) {
  const { TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakToggle } = window;
  if (!TweaksPanel) return null;
  return (
    <TweaksPanel title="tweaks">
      <TweakSection title="theme">
        <TweakRadio label="mode" value={t.theme} options={['dark', 'light']} onChange={v => setTweak('theme', v)} />
        <TweakColor label="accent" value={t.accent} options={['#8AB6FF', '#6EE7C1', '#FFB347', '#B79CFF', '#FF7B6E']} onChange={v => setTweak('accent', v)} />
      </TweakSection>
      <TweakSection title="density">
        <TweakRadio label="rows" value={t.density} options={['compact', 'default', 'comfortable']} onChange={v => setTweak('density', v)} />
      </TweakSection>
      <TweakSection title="shell">
        <TweakRadio label="rail" value={t.rail} options={['expanded', 'collapsed']} onChange={v => setTweak('rail', v)} />
        <TweakRadio label="stream" value={t.stream} options={['on', 'paused']} onChange={v => {
          setTweak('stream', v);
          window.setStreamPaused && window.setStreamPaused(v === 'paused');
        }} />
      </TweakSection>
    </TweaksPanel>
  );
}

// pause hook for the stream — read by mock-data emitter
ue ? null : null;

// mount
ReactDOM.createRoot(document.getElementById('root')).render(<App />);

// console signature
console.log('%c◐ quietly forged at saiteja.ai', 'color:#8AB6FF;font-family:monospace;letter-spacing:.15em');
