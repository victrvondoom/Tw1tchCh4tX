import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LEVELS,
  type GameState,
  type RoundResult,
  type Control,
  type CommandResult,
} from '@prism/shared';
import { api } from './lib/api';
import { useArena } from './hooks/useArena';
import { Arena } from './components/Arena';
import { CALIBRATION_POINTS, useGaze } from './features/gaze/useGaze';
type Panel = 'levels' | 'settings' | 'history' | 'overlay' | null;
export function Logo() {
  return (
    <span className="brand">
      <img src="/favicon.svg" alt="" />
      <span>
        PRISM<b>X</b>
        <small>TWITCH COMMUNITY ARENA</small>
      </span>
    </span>
  );
}
export function Feed({ state, compact = false }: { state: GameState; compact?: boolean }) {
  return (
    <div
      className="feed"
      role="log"
      aria-label="Mission events"
      aria-live="polite"
      aria-relevant="additions"
    >
      {state.events.length ? (
        state.events
          .slice(compact ? -3 : -8)
          .reverse()
          .map((e) => (
            <div className={`event ${e.kind}`} key={e.id}>
              <i />
              <div>
                <small>{e.kind}</small>
                <p>{e.text}</p>
              </div>
              <time>{Math.floor(e.at / 1000)}s</time>
            </div>
          ))
      ) : (
        <div className="empty">
          <span>◈</span>
          <p>Your community’s next move starts here.</p>
          <small>Events appear as the mission unfolds.</small>
        </div>
      )}
    </div>
  );
}
export function Overlay({ state, connection }: { state: GameState | null; connection: string }) {
  useEffect(() => {
    document.body.classList.add('overlay-body');
    return () => document.body.classList.remove('overlay-body');
  }, []);
  const p = new URLSearchParams(location.search);
  if (!state) return <div className="overlay-message">PRISM X · Connecting to arena…</div>;
  return (
    <main className="overlay" aria-label="OBS overlay">
      {p.get('hud') !== '0' && (
        <div className="overlay-hud">
          <Logo />
          <div>
            <small>MISSION {state.level.id}</small>
            <strong>{state.level.name}</strong>
          </div>
          <div>
            <small>SCORE</small>
            <strong>{state.score}</strong>
          </div>
          <div>
            <small>INTEGRITY</small>
            <strong>{state.health}%</strong>
          </div>
          <div>
            <small>TARGETS</small>
            <strong>
              {state.captured.length}/{state.level.targets.length}
            </strong>
          </div>
          <span className="tag">
            {state.mode === 'demo' ? 'LOCAL DEMO' : 'TWITCH'} · {state.phase}
          </span>
        </div>
      )}
      {connection !== 'connected' && (
        <p className="overlay-message">Connection lost · reconnecting</p>
      )}
      {p.get('events') !== '0' && (
        <div className="overlay-events">
          <Feed state={state} compact />
        </div>
      )}
    </main>
  );
}
function History({ version }: { version: number }) {
  const [data, setData] = useState<{
      history: RoundResult[];
      leaderboard: { demo: RoundResult[]; twitch: RoundResult[] };
    } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void api<typeof data>('/api/history')
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [version]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Loading mission history…</p>;
  return (
    <>
      <p className="muted">
        This installation’s last 100 missions. Demo and Twitch scores are separate, not verified
        global rankings.
      </p>
      {data.history.length ? (
        <>
          <div className="best-score">
            LOCAL DEMO BEST <strong>{data.leaderboard.demo[0]?.score ?? '—'}</strong> TWITCH BEST{' '}
            <strong>{data.leaderboard.twitch[0]?.score ?? '—'}</strong>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mission</th>
                  <th>Mode</th>
                  <th>Outcome</th>
                  <th>Score</th>
                  <th>Achievements</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((r) => (
                  <tr key={r.id}>
                    <td>{LEVELS[r.level - 1]?.name}</td>
                    <td>{r.mode}</td>
                    <td>{r.outcome}</td>
                    <td>{r.score}</td>
                    <td>{r.achievements.join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty">
          <span>◇</span>
          <h3>Your first mission is waiting.</h3>
          <p>Finish a round to save your score and achievements.</p>
        </div>
      )}
    </>
  );
}
export default function App() {
  const { state, connection } = useArena();
  const [entered, setEntered] = useState(new URLSearchParams(location.search).has('play')),
    [panel, setPanel] = useState<Panel>(null),
    [operator, setOperator] = useState(false),
    [keyRequired, setKeyRequired] = useState(false),
    [key, setKey] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [chat, setChat] = useState(''),
    [mouseAim, setMouseAim] = useState(true),
    [historyVersion, setHistoryVersion] = useState(0),
    [confirmDelete, setConfirmDelete] = useState(false),
    [hud, setHud] = useState(true),
    [events, setEvents] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null),
    latest = useRef(state),
    lastAim = useRef(0),
    pendingAim = useRef(false),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = state;
  const inform = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 7000);
  }, []);
  useEffect(() => {
    void api<{ operator: boolean; keyRequired: boolean }>('/api/session')
      .then((s) => {
        setOperator(s.operator);
        setKeyRequired(s.keyRequired);
      })
      .catch(() => {});
    const result = new URLSearchParams(location.search).get('twitch');
    if (result)
      inform(
        result === 'authorized'
          ? 'Consent received. Check Twitch connection status.'
          : result === 'denied'
            ? 'Consent declined. Demo is still available.'
            : 'Twitch authorization failed. Check settings.',
      );
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [inform]);
  useEffect(() => {
    if (panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [panel]);
  async function control(c: Control) {
    try {
      const r = await api<CommandResult>('/api/control', c);
      if (c.type !== 'aim') inform(r.message);
      return true;
    } catch (e) {
      inform(e instanceof Error ? e.message : 'Control failed');
      return false;
    }
  }
  function aim(angle: number) {
    if (
      !operator ||
      latest.current?.phase !== 'playing' ||
      pendingAim.current ||
      performance.now() - lastAim.current < 130
    )
      return;
    lastAim.current = performance.now();
    pendingAim.current = true;
    void api('/api/control', { type: 'aim', angle })
      .catch((e) => inform(e.message))
      .finally(() => {
        pendingAim.current = false;
      });
  }
  const gaze = useGaze((p) => {
    const s = latest.current;
    if (s)
      aim(
        (Math.atan2(p.y * 600 - s.level.emitter.y, p.x * 1000 - s.level.emitter.x) * 180) / Math.PI,
      );
  });
  useEffect(() => {
    if (!gaze.active || gaze.calibrated) return;
    const capture = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        gaze.capture();
      }
    };
    window.addEventListener('keydown', capture);
    return () => window.removeEventListener('keydown', capture);
  }, [gaze]);
  async function unlock() {
    setBusy(true);
    try {
      await api('/api/session', keyRequired ? { key } : {});
      setKey('');
      setOperator(true);
      inform('Streamer controls unlocked for this browser.');
      return true;
    } catch (e) {
      inform(e instanceof Error ? e.message : 'Could not unlock');
      setPanel('settings');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function start(level = 1) {
    setBusy(true);
    try {
      if (!operator && !(await unlock())) return;
      if (await control({ type: 'start', level })) {
        setEntered(true);
        setPanel(null);
      }
    } finally {
      setBusy(false);
    }
  }
  async function send(text: string) {
    if (!text.trim()) return;
    try {
      const r = await api<CommandResult>('/api/chat', { text, eventId: crypto.randomUUID() });
      inform(r.message);
      setChat('');
    } catch (e) {
      inform(e instanceof Error ? e.message : 'Chat failed');
    }
  }
  async function connect() {
    setBusy(true);
    try {
      const r = await api<{ url: string }>('/auth/twitch/start', {});
      location.assign(r.url);
    } catch (e) {
      inform(e instanceof Error ? e.message : 'Twitch unavailable');
    } finally {
      setBusy(false);
    }
  }
  const connected = connection === 'connected',
    playing = state?.phase === 'playing',
    live = state?.mode === 'twitch',
    seconds = Math.ceil((state?.remaining ?? 0) / 1000),
    overlayUrl = `${location.origin}/overlay?hud=${hud ? 1 : 0}&events=${events ? 1 : 0}`;
  if (location.pathname === '/overlay') return <Overlay state={state} connection={connection} />;
  return (
    <>
      <header>
        <button
          className="brand-button"
          onClick={() => setEntered(false)}
          aria-label="Prism X home"
        >
          <Logo />
        </button>
        <nav aria-label="Main navigation">
          <button className={entered ? 'active' : ''} onClick={() => setEntered(true)}>
            Arena
          </button>
          <button onClick={() => setPanel('levels')}>Missions</button>
          <button onClick={() => setPanel('history')}>Score archive</button>
        </nav>
        <div className="header-right">
          <span className={`connection ${connected ? 'online' : ''}`}>
            <i />
            {connected ? 'ARENA ONLINE' : 'RECONNECTING'}
          </span>
          <button
            className="icon-button"
            aria-label="Open settings"
            onClick={() => setPanel('settings')}
          >
            ⚙
          </button>
        </div>
      </header>
      {!connected && (
        <div className="banner" role="status">
          {state
            ? 'Arena disconnected. Controls are paused while reconnecting.'
            : 'Connecting to the game server. Run npm run dev and open http://localhost:5173 if this persists.'}
        </div>
      )}
      {!entered ? (
        <main className="landing">
          <section className="hero">
            <div className="eyebrow lime">● AN EXPERIMENT IN COLLECTIVE PLAY</div>
            <h1>
              Your eyes.
              <br />
              Their moves.
              <br />
              <em>One mission.</em>
            </h1>
            <p>
              A beam of light. A chat full of ideas. Bend the path together and defend your world
              from simulated cyber threats.
            </p>
            <div className="button-row">
              <button
                className="button primary large"
                disabled={!connected || busy}
                onClick={() => void start()}
              >
                Play demo ↗
              </button>
              <button className="button ghost large" onClick={() => setPanel('levels')}>
                Explore missions →
              </button>
            </div>
            <div className="hero-note">
              ✓ No Twitch login required <span>✓ Mouse & keyboard ready</span>
            </div>
            <div className="hero-index">
              01 / OPTICS <span>02 / COMMUNITY</span> 03 / DEFENSE
            </div>
          </section>
          <section className="hero-visual">
            <div className="panel-heading">
              <span className="tag">INTERACTIVE PHYSICS</span>
              <small>FIELD 001</small>
            </div>
            {state ? (
              <Arena state={state} />
            ) : (
              <div className="empty">Initializing optical field…</div>
            )}
            <div className="hero-caption">
              <span>✳</span>
              <div>
                <strong>Keep the light alive.</strong>
                <p>Aim the beam. Let your community shape the path.</p>
              </div>
              <b>↗</b>
            </div>
            <div className="floating-label">
              ◈ REAL RAY PHYSICS<small>+ COMMUNITY DEFENSE</small>
            </div>
          </section>
          <div className="features">
            {[
              ['01', 'Light follows the rules.', 'Deterministic reflections. Real solutions.'],
              ['02', 'Chat changes the game.', 'Rotate mirrors and vote on defenses.'],
              ['03', 'Made for your stream.', 'Read-only OBS overlay. Local camera processing.'],
            ].map(([n, h, p]) => (
              <article key={n}>
                <span>{n}</span>
                <div>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </div>
              </article>
            ))}
          </div>
        </main>
      ) : (
        <main className="game-layout">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                CONTROL ROOM / MISSION {String(state?.level.id ?? 1).padStart(2, '0')}
              </div>
              <h1>{state?.level.name ?? 'Loading arena'}</h1>
              <p>{state?.level.subtitle ?? 'Establishing connection…'}</p>
            </div>
            <div className="heading-actions">
              <span className="tag">{live ? 'TWITCH ROUND' : 'LOCAL DEMO'}</span>
              <button className="button secondary" onClick={() => setPanel('overlay')}>
                ↗ OBS overlay
              </button>
              <button className="button secondary" onClick={() => setPanel('levels')}>
                Change mission
              </button>
            </div>
          </div>
          {state && (
            <>
              <section className="metrics">
                <div>
                  <span>MISSION SCORE</span>
                  <strong data-testid="score">
                    {state.score.toLocaleString().padStart(4, '0')}
                  </strong>
                  <small>Earned together</small>
                </div>
                <div>
                  <span>TARGETS SECURED</span>
                  <strong>
                    {state.captured.length}
                    <i> / {state.level.targets.length}</i>
                  </strong>
                  <small>Hold light for 0.8 seconds</small>
                </div>
                <div>
                  <span>TIME REMAINING</span>
                  <strong>
                    {String(Math.floor(seconds / 60)).padStart(2, '0')}
                    <i>:</i>
                    {String(seconds % 60).padStart(2, '0')}
                  </strong>
                  <small>{state.phase.toUpperCase()}</small>
                </div>
                <div>
                  <span>SYSTEM INTEGRITY</span>
                  <strong className={state.health < 50 ? 'danger' : 'lime'}>
                    {state.health}
                    <i>%</i>
                  </strong>
                  <div className="health-track">
                    <span style={{ width: `${state.health}%` }} />
                  </div>
                </div>
              </section>
              <div className="arena-grid">
                <section className="arena-panel">
                  <div className="panel-heading">
                    <h2>
                      <i className="purple-dot" /> Optical field
                    </h2>
                    <small>
                      {gaze.calibrated ? 'GAZE' : mouseAim ? 'MOUSE' : 'KEYBOARD'} INPUT ·{' '}
                      {state.phase.toUpperCase()}
                    </small>
                  </div>
                  <div className="canvas-wrap">
                    <Arena
                      state={state}
                      interactive={operator && connected && playing}
                      mouseAim={mouseAim}
                      onAim={aim}
                      onPause={() => void control({ type: 'pause' })}
                      gaze={gaze.point}
                    />
                    {(state.phase === 'idle' || state.phase === 'paused') && (
                      <div className="arena-message">
                        <h2>
                          {state.phase === 'paused'
                            ? 'Mission paused'
                            : 'Ready to find your angle?'}
                        </h2>
                        <p>Point the beam at mirror A. Your chat takes it from there.</p>
                        <button
                          className="button primary"
                          disabled={!connected || busy || (state.phase === 'paused' && !operator)}
                          onClick={() =>
                            state.phase === 'paused'
                              ? void control({ type: 'resume' })
                              : void start(state.level.id)
                          }
                        >
                          {state.phase === 'paused' ? 'Resume mission' : 'Start mission'}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="legend">
                    <span>━ LIGHT PATH</span>
                    <span>━ MIRROR</span>
                    <span>○ RECEIVER</span>
                    <b>
                      {state.moves}/{state.level.moveLimit} MOVES
                    </b>
                  </div>
                  <div className="aim-controls">
                    <label htmlFor="aim">
                      Emitter angle <b>{Math.round(state.aim)}°</b>
                      <input
                        id="aim"
                        type="range"
                        min="-180"
                        max="180"
                        value={state.aim}
                        disabled={!operator || !playing || !connected}
                        onChange={(e) =>
                          void control({ type: 'aim', angle: Number(e.target.value) })
                        }
                      />
                    </label>
                    <button
                      className="button secondary"
                      disabled={!operator || !playing || !connected}
                      onClick={() => void control({ type: 'aim', angle: 0 })}
                    >
                      Aim 0°
                    </button>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={mouseAim}
                        onChange={(e) => setMouseAim(e.target.checked)}
                      />
                      Mouse aim
                    </label>
                  </div>
                  <div className="mirror-row">
                    {state.level.mirrors.map((m) => (
                      <div className="mirror-control" key={m.id}>
                        <div>
                          <small>MIRROR {m.id}</small>
                          <strong data-testid={`mirror-${m.id}`}>{m.angle}°</strong>
                        </div>
                        <button
                          aria-label={`Rotate mirror ${m.id} minus 15 degrees`}
                          disabled={!operator || !playing || !connected || live}
                          onClick={() => void send(`!rotate ${m.id} -15`)}
                        >
                          −15°
                        </button>
                        <button
                          aria-label={`Rotate mirror ${m.id} plus 15 degrees`}
                          disabled={!operator || !playing || !connected || live}
                          onClick={() => void send(`!rotate ${m.id} 15`)}
                        >
                          +15°
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="streamer-controls">
                    <small>STREAMER CONTROLS</small>
                    <div>
                      <button
                        disabled={!operator || !connected || (!playing && state.phase !== 'paused')}
                        onClick={() =>
                          void control({ type: state.phase === 'paused' ? 'resume' : 'pause' })
                        }
                      >
                        {state.phase === 'paused' ? '▶ Resume' : 'Ⅱ Pause'}
                      </button>
                      <button
                        disabled={!operator || !connected}
                        onClick={() => void control({ type: 'reset' })}
                      >
                        ↻ Reset
                      </button>
                      <button onClick={() => setPanel('settings')}>◎ Input settings</button>
                    </div>
                  </div>
                </section>
                <aside className="right-rail">
                  <section className="panel defense">
                    <div className="panel-heading">
                      <h2>⬡ Community defense</h2>
                      <span className="tag subtle">SIMULATED</span>
                    </div>
                    <div className="defense-body">
                      <div className={`threat-icon ${state.activeThreat ? 'alert' : ''}`}>
                        {state.activeThreat ? '!' : '✓'}
                      </div>
                      <div className="eyebrow">
                        {state.activeThreat ? 'INCOMING WAVE' : 'PERIMETER STATUS'}
                      </div>
                      <h3>
                        {state.activeThreat?.label ??
                          (state.phase === 'won' ? 'Mission secured' : 'Holding the line')}
                      </h3>
                      <p>
                        {state.activeThreat
                          ? `${state.activeThreat.classification} · ${Math.ceil((state.activeThreat.ends - state.elapsed) / 1000)}s to decide`
                          : `${state.resolvedThreats.length}/${state.level.threats.length} waves resolved · ${state.shields} defense charges`}
                      </p>
                      <div className="defense-guide">
                        {state.activeThreat?.defense === 'quarantine'
                          ? 'Isolate suspicious messages before they spread.'
                          : state.activeThreat?.defense === 'shield'
                            ? 'Absorb the traffic burst at the perimeter.'
                            : state.activeThreat?.defense === 'verify'
                              ? 'Verify identity before granting access.'
                              : 'Choose one defense when a threat appears. Every viewer gets one vote.'}
                      </div>
                      <div className="vote-buttons">
                        {(['shield', 'quarantine', 'verify'] as const).map((d) => (
                          <button
                            key={d}
                            disabled={
                              !operator || !playing || !connected || !state.activeThreat || live
                            }
                            onClick={() => void send(`!vote ${d}`)}
                          >
                            <span>{d}</span>
                            <b>{state.votes[d]}</b>
                          </button>
                        ))}
                      </div>
                      <small>No real attacks. All threats stay inside the game.</small>
                    </div>
                  </section>
                  <section className="panel chat-panel">
                    <div className="panel-heading">
                      <h2>▱ {live ? 'Twitch commands' : 'Chat simulator'}</h2>
                      <small>{state.queueDepth} QUEUED</small>
                    </div>
                    <div className="chat-help">
                      <code>!rotate A -15</code>
                      <code>!vote quarantine</code>
                    </div>
                    <Feed state={state} />
                    <form
                      className="chat-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void send(chat);
                      }}
                    >
                      <label className="sr-only" htmlFor="chat">
                        Chat command
                      </label>
                      <input
                        id="chat"
                        value={chat}
                        maxLength={160}
                        placeholder={live ? 'Send commands in Twitch chat' : 'Type a command…'}
                        disabled={!operator || !connected || live}
                        onChange={(e) => setChat(e.target.value)}
                      />
                      <button
                        aria-label="Send chat command"
                        disabled={!operator || !connected || live || !chat.trim()}
                      >
                        ↑
                      </button>
                    </form>
                    <div className="chat-footer">
                      <small>{state.participants} contributors · 750ms cooldown</small>
                      <button
                        disabled={!operator || !connected || live}
                        onClick={() => void send('!hint')}
                      >
                        Need a hint?
                      </button>
                    </div>
                  </section>
                </aside>
              </div>
              {state.result && (
                <section className="results-panel" aria-label="Mission results">
                  <div>
                    <div className="eyebrow">{state.result.mode.toUpperCase()} MISSION RESULTS</div>
                    <h2>
                      {state.result.outcome === 'won'
                        ? 'You kept the light alive.'
                        : 'Every attempt finds a new angle.'}
                    </h2>
                    <p>
                      {state.result.outcome === 'won'
                        ? 'All targets secured. Your community made it through.'
                        : 'Review the hint and defense choices, then try again.'}
                    </p>
                    <div className="achievements">
                      {state.result.achievements.map((a) => (
                        <span key={a}>✧ {a}</span>
                      ))}
                    </div>
                  </div>
                  <div className="result-score">
                    <small>FINAL SCORE</small>
                    <strong>{state.result.score}</strong>
                    <button
                      className="button primary"
                      disabled={!operator || !connected}
                      onClick={() =>
                        void control({ type: state.result?.outcome === 'won' ? 'next' : 'reset' })
                      }
                    >
                      {state.result.outcome === 'won' ? 'Next mission →' : 'Try again ↻'}
                    </button>
                  </div>
                </section>
              )}
              {!operator && (
                <div className="operator-bar">
                  <p>You’re viewing the arena. Unlock streamer controls to play.</p>
                  <button
                    className="button primary"
                    disabled={busy || !connected}
                    onClick={() => void unlock()}
                  >
                    Unlock controls
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      )}
      <footer>
        <span>TW1TCHPR1SMX / BUILT WITH OPENAI CODEX</span>
        <span>LOCAL-FIRST PLAY · NO REAL CYBERATTACKS</span>
        <button onClick={() => setPanel('settings')}>Privacy & settings ↗</button>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        className="settings-dialog"
        onCancel={() => setPanel(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setPanel(null);
        }}
      >
        <div className="dialog-heading">
          <div>
            <div className="eyebrow">PRISM X / CONTROL CENTER</div>
            <h2>
              {panel === 'levels'
                ? 'Choose your next mission'
                : panel === 'history'
                  ? 'Mission archive'
                  : panel === 'overlay'
                    ? 'Make it stream-ready'
                    : 'Your arena, your controls'}
            </h2>
          </div>
          <button className="icon-button" aria-label="Close panel" onClick={() => setPanel(null)}>
            ×
          </button>
        </div>
        {panel === 'levels' && (
          <div className="level-cards">
            {LEVELS.map((l) => (
              <article key={l.id}>
                <div className="level-art">
                  <span>{String(l.id).padStart(2, '0')}</span>
                  {'◇ '.repeat(l.mirrors.length)}
                </div>
                <span className="tag">{l.difficulty}</span>
                <h3>{l.name}</h3>
                <p>{l.subtitle}</p>
                <small>
                  {l.targets.length} targets · {l.threats.length} waves · {l.duration / 1000}s
                </small>
                <button
                  className="button primary"
                  disabled={!connected || busy}
                  onClick={() => void start(l.id)}
                >
                  Play {l.name} →
                </button>
              </article>
            ))}
          </div>
        )}
        {panel === 'history' && (
          <>
            <History version={historyVersion} />
            {operator && (
              <div className="button-row">
                <button
                  className="button secondary"
                  onClick={() => setConfirmDelete(!confirmDelete)}
                >
                  {confirmDelete ? 'Cancel deletion' : 'Clear local history'}
                </button>
                {confirmDelete && (
                  <button
                    className="button danger-button"
                    onClick={() =>
                      void api('/api/history', undefined, 'DELETE')
                        .then(() => {
                          setHistoryVersion((v) => v + 1);
                          setConfirmDelete(false);
                          inform('Local mission history deleted.');
                        })
                        .catch((e) => inform(e.message))
                    }
                  >
                    Confirm: delete saved scores
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {panel === 'overlay' && (
          <>
            <p className="muted">
              Add this URL as an OBS Browser Source at <strong>1920 × 1080</strong>. Transparent
              background; read-only state from this server.
            </p>
            <div className="overlay-preview">
              <Logo />
              <span>LIVE MISSION</span>
              <strong>{state?.score ?? 0}</strong>
              <span>{state?.health ?? 100}% INTEGRITY</span>
            </div>
            <div className="button-row">
              <label className="toggle">
                <input type="checkbox" checked={hud} onChange={(e) => setHud(e.target.checked)} />
                Score & mission HUD
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={events}
                  onChange={(e) => setEvents(e.target.checked)}
                />
                Recent events
              </label>
            </div>
            <label className="field-label">
              Browser source URL
              <input className="full-input" readOnly value={overlayUrl} />
            </label>
            <div className="button-row">
              <button
                className="button primary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(overlayUrl)
                    .then(() => inform('Overlay URL copied.'))
                    .catch(() => inform('Clipboard unavailable. Select and copy the URL above.'))
                }
              >
                Copy URL
              </button>
              <a className="button secondary" href={overlayUrl} target="_blank" rel="noreferrer">
                Open overlay preview ↗
              </a>
            </div>
            <p className="micro">
              Native OBS capture still requires testing on your streaming setup.
            </p>
          </>
        )}
        {panel === 'settings' && (
          <div className="settings-grid">
            <section>
              <h3>Streamer access</h3>
              <p className="muted">
                {operator
                  ? 'This browser can control the shared arena. Session expires after eight hours.'
                  : 'The local demo unlocks automatically on loopback. Hosted instances require the server operator key.'}
              </p>
              {operator ? (
                <button
                  className="button secondary"
                  onClick={() =>
                    void api('/api/session', undefined, 'DELETE')
                      .then(() => {
                        setOperator(false);
                        gaze.stop();
                        inform('Controls locked.');
                      })
                      .catch((e) => inform(e.message))
                  }
                >
                  Lock this browser
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void unlock();
                  }}
                >
                  {keyRequired && (
                    <label className="field-label">
                      Operator key
                      <input
                        type="password"
                        autoComplete="off"
                        maxLength={256}
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                      />
                    </label>
                  )}
                  <button className="button primary" disabled={busy || !connected}>
                    Unlock streamer controls
                  </button>
                </form>
              )}
            </section>
            <section>
              <h3>Twitch connection</h3>
              <span className={`connection ${state?.twitch.state === 'connected' ? 'online' : ''}`}>
                <i />
                {state?.twitch.state.toUpperCase() ?? 'DISCONNECTED'}
              </span>
              <p className="muted">{state?.twitch.detail}</p>
              <p className="micro">
                Read-only chat from the broadcaster’s own channel. Tokens stay in server memory.
                Live credential verification is required before streaming.
              </p>
              <div className="button-row">
                <button
                  className="button purple-button"
                  disabled={!operator || busy || !state?.twitch.configured}
                  onClick={() => void connect()}
                >
                  Connect Twitch ↗
                </button>
                <button
                  className="button secondary"
                  disabled={!operator || state?.twitch.state === 'disabled'}
                  onClick={() =>
                    void api('/auth/twitch/disconnect', {})
                      .then(() => inform('Twitch disconnected. Start a new demo round.'))
                      .catch((e) => inform(e.message))
                  }
                >
                  Disconnect
                </button>
              </div>
              {!state?.twitch.configured && (
                <p className="micro">
                  Set Twitch credentials in the server .env file. See docs/TWITCH_SETUP.md.
                </p>
              )}
            </section>
            <section>
              <h3>Experimental eye-gaze input</h3>
              <p className="muted">
                Local iris landmarks and five-point calibration. Accuracy varies with lighting,
                glasses and head movement. Mouse and keyboard remain available.
              </p>
              <div className="gaze-status" role="status">
                ◎ {gaze.status}
                <small>Tracking quality: {gaze.quality} · heuristic, not a probability</small>
              </div>
              <div className="button-row">
                <button
                  className="button primary"
                  disabled={!operator || gaze.active}
                  onClick={() => {
                    setPanel(null);
                    void gaze.start();
                  }}
                >
                  Enable camera & calibrate
                </button>
                <button className="button secondary" onClick={gaze.stop}>
                  Stop camera now
                </button>
              </div>
              <label className="field-label">
                Gaze sensitivity: {gaze.sensitivity.toFixed(1)}×
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={gaze.sensitivity}
                  onChange={(e) => gaze.setSensitivity(Number(e.target.value))}
                />
              </label>
              <p className="micro">
                Optional setup: npm run gaze:assets. No frames are recorded/uploaded. Hiding this
                tab stops the camera.
              </p>
            </section>
            <section>
              <h3>Privacy & game rules</h3>
              <p className="muted">
                Only the last 100 anonymous mission summaries are stored. Raw messages, user IDs,
                gaze coordinates and camera frames never enter SQLite. Protection caches expire
                after ten minutes.
              </p>
              <p className="muted">
                Charge targets for 0.8s. Rotate in 5° steps up to 45° per command. One final vote
                per viewer per wave; ties have no winner. Earn 300 points per target and 150 per
                correct defense.
              </p>
              <button className="text-button" onClick={() => setPanel('history')}>
                View or delete saved scores →
              </button>
            </section>
          </div>
        )}
      </dialog>
      {gaze.active && !gaze.calibrated && (
        <div
          className="calibration"
          role="dialog"
          aria-label="Eye gaze calibration"
          aria-modal="true"
        >
          <div className={`calibration-dot ${CALIBRATION_POINTS[gaze.step] ?? 'center'}`} />
          <div className="calibration-instructions">
            <div className="eyebrow">CALIBRATION {gaze.step + 1} / 5</div>
            <h2>Look at the green dot.</h2>
            <p>Keep your head still, then press Space to capture.</p>
            <p>{gaze.status}</p>
            <div className="button-row">
              <button className="button primary" onClick={gaze.capture}>
                Capture point
              </button>
              <button className="button secondary" onClick={gaze.stop}>
                Stop camera & exit
              </button>
            </div>
          </div>
        </div>
      )}
      {gaze.active && gaze.calibrated && (
        <button className="camera-kill" onClick={gaze.stop}>
          ● Camera active — stop now
        </button>
      )}
    </>
  );
}
