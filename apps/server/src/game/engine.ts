import { randomUUID } from 'node:crypto';
import {
  LEVELS,
  type GameState,
  type Control,
  type Command,
  type CommandResult,
  type Defense,
  type EventEntry,
  type RoundResult,
} from '@prism/shared';
import { mirrorSurface, traceRay } from '@prism/physics';
export class Game {
  state: GameState;
  private actors = new Set<string>();
  private ballots = new Map<string, Defense>();
  private eventId = 0;
  private penalty = 0;
  constructor(private save: (r: RoundResult) => void = () => {}) {
    const level = structuredClone(LEVELS[0]!);
    this.state = {
      revision: 0,
      roundId: randomUUID(),
      mode: 'demo',
      phase: 'idle',
      level,
      aim: level.aim,
      elapsed: 0,
      remaining: level.duration,
      moves: 0,
      score: 0,
      health: 100,
      shields: 3,
      defenses: 0,
      participants: 0,
      charge: {},
      captured: [],
      activeThreat: null,
      resolvedThreats: [],
      votes: { shield: 0, quarantine: 0, verify: 0 },
      trace: { segments: [], targets: [], termination: 'escape' },
      events: [],
      queueDepth: 0,
      result: null,
      twitch: {
        state: 'disabled',
        detail: 'Demo mode · Twitch is not connected',
        configured: false,
      },
    };
    this.cast();
  }
  event(kind: EventEntry['kind'], text: string) {
    this.state.events.push({ id: ++this.eventId, at: this.state.elapsed, kind, text });
    this.state.events = this.state.events.slice(-40);
    this.state.revision++;
  }
  control(a: Control): CommandResult {
    const ok = (message: string): CommandResult => ({
        status: 'accepted',
        code: 'accepted',
        message,
      }),
      fail = (message: string): CommandResult => ({
        status: 'rejected',
        code: 'invalid_state',
        message,
      });
    if (a.type === 'start' || a.type === 'reset' || a.type === 'next') {
      if (a.type === 'next' && this.state.phase !== 'won')
        return fail('Finish the mission before advancing.');
      const id =
        a.type === 'start'
          ? a.level
          : a.type === 'next'
            ? (this.state.level.id % 3) + 1
            : this.state.level.id;
      const level = LEVELS.find((l) => l.id === id);
      if (!level) return fail('Unknown level.');
      const { twitch, revision } = this.state;
      this.state = {
        ...new Game().state,
        twitch,
        revision,
        mode: twitch.state === 'connected' ? 'twitch' : 'demo',
        phase: 'playing',
        level: structuredClone(level),
        aim: level.aim,
        remaining: level.duration,
      };
      this.actors.clear();
      this.ballots.clear();
      this.penalty = 0;
      this.cast();
      this.event('info', `Mission started: ${level.name}. Charge targets and survive all waves.`);
      return ok('Mission started.');
    }
    if (a.type === 'pause' && this.state.phase === 'playing') {
      this.state.phase = 'paused';
      this.event('info', 'Mission paused. Commands locked.');
      return ok('Paused.');
    }
    if (a.type === 'resume' && this.state.phase === 'paused') {
      this.state.phase = 'playing';
      this.event('info', 'Mission resumed.');
      return ok('Resumed.');
    }
    if (a.type === 'aim' && this.state.phase === 'playing') {
      this.state.aim = a.angle;
      this.cast();
      this.state.revision++;
      return ok('Aim updated.');
    }
    return fail('Control unavailable in this mission state.');
  }
  command(actor: string, c: Command): CommandResult {
    const finish = (status: CommandResult['status'], message: string): CommandResult => {
      this.event(status === 'rejected' ? 'rejected' : 'accepted', message);
      return { status, code: status, message };
    };
    if (c.kind === 'help')
      return finish(
        'accepted',
        '!rotate A 15 · !vote shield|quarantine|verify · !status · !score · !hint',
      );
    if (c.kind === 'hint') return finish('accepted', this.state.level.hint);
    if (c.kind === 'score')
      return finish(
        'accepted',
        `Mission score: ${this.state.score}. Local ${this.state.mode} session.`,
      );
    if (c.kind === 'status')
      return finish(
        'accepted',
        `${this.state.captured.length}/${this.state.level.targets.length} targets · integrity ${this.state.health}% · ${Math.ceil(this.state.remaining / 1000)}s remaining.`,
      );
    if (this.state.phase !== 'playing')
      return finish('rejected', 'Start or resume a mission first.');
    if (c.kind === 'rotate') {
      const m = this.state.level.mirrors.find((m) => m.id === c.mirror);
      if (!m) return finish('rejected', 'That mirror is not in this level.');
      if (this.state.moves >= this.state.level.moveLimit)
        return finish('rejected', 'Mirror move budget exhausted.');
      m.angle = ((m.angle + c.degrees + 540) % 360) - 180;
      this.state.moves++;
      this.participate(actor);
      this.cast();
      this.score();
      return finish('accepted', `Mirror ${m.id} rotated ${c.degrees}° → ${m.angle}°.`);
    }
    if (c.kind === 'vote') {
      if (!this.state.activeThreat) return finish('rejected', 'No active threat.');
      if (this.ballots.has(actor))
        return finish('rejected', 'One vote per viewer per wave. Your vote is locked.');
      if (this.ballots.size >= 10000) return finish('rejected', 'Vote capacity reached.');
      this.ballots.set(actor, c.defense);
      this.state.votes[c.defense]++;
      this.participate(actor);
      this.score();
      return finish('accepted', `Defense vote locked: ${c.defense}.`);
    }
    return finish('rejected', 'Unknown command.');
  }
  private participate(actor: string) {
    if (this.actors.size < 10000) this.actors.add(actor);
    this.state.participants = this.actors.size;
  }
  private cast() {
    const s = this.state,
      r = (s.aim * Math.PI) / 180;
    s.trace = traceRay(
      s.level.emitter,
      { x: Math.cos(r), y: Math.sin(r) },
      [
        ...s.level.obstacles,
        ...s.level.mirrors.map((m) => mirrorSurface(m.id, m.center, m.length, m.angle)),
      ],
      s.level.targets,
    );
  }
  private score() {
    const s = this.state;
    s.score = Math.max(
      0,
      s.captured.length * 300 +
        s.defenses * 150 +
        Math.min(100, s.participants * 5) -
        s.moves * 4 -
        this.penalty +
        (s.phase === 'won' ? Math.floor(s.remaining / 100) : 0),
    );
  }
  advance(ms: number) {
    if (!Number.isFinite(ms) || ms < 0 || ms > 600000 || ms % 50 !== 0)
      throw new Error('Advance requires 50ms steps, maximum ten minutes.');
    for (let left = ms; left > 0 && this.state.phase === 'playing'; left -= 50) this.step();
  }
  private step() {
    const s = this.state;
    s.elapsed += 50;
    s.remaining = Math.max(0, s.level.duration - s.elapsed);
    for (const t of s.level.targets) {
      if (s.captured.includes(t.id)) continue;
      s.charge[t.id] = s.trace.targets.includes(t.id)
        ? Math.min(800, (s.charge[t.id] ?? 0) + 50)
        : 0;
      if (s.charge[t.id] === 800) {
        s.captured.push(t.id);
        this.event('accepted', `Target ${t.id} charged. Light path secured.`);
      }
    }
    const threat = s.level.threats.find(
      (t) => !s.resolvedThreats.includes(t.id) && s.elapsed >= t.starts,
    );
    if (threat && !s.activeThreat) {
      s.activeThreat = threat;
      this.ballots.clear();
      s.votes = { shield: 0, quarantine: 0, verify: 0 };
      this.event(
        'danger',
        `Simulated ${threat.label.toLowerCase()}. Community defense window open.`,
      );
    }
    if (s.activeThreat && s.elapsed >= s.activeThreat.ends) {
      const t = s.activeThreat,
        ranked = (Object.entries(s.votes) as [Defense, number][]).sort((a, b) => b[1] - a[1]);
      const winner = ranked[0]![1] > 0 && ranked[0]![1] > ranked[1]![1] ? ranked[0]![0] : null;
      const available = s.shields > 0;
      if (winner && available) s.shields--;
      if (winner === t.defense && available) {
        s.defenses++;
        this.event('defense', `${t.label} contained with ${winner}. +150 points.`);
      } else {
        s.health = Math.max(0, s.health - 35);
        this.penalty += 30;
        this.event(
          'danger',
          `${t.label} breached the simulation (${winner ?? 'no majority'}). Correct defense: ${t.defense}. −35 integrity.`,
        );
      }
      s.resolvedThreats.push(t.id);
      s.activeThreat = null;
      this.ballots.clear();
      s.votes = { shield: 0, quarantine: 0, verify: 0 };
    }
    if (s.health === 0 || s.remaining === 0) this.complete('lost');
    else if (
      s.captured.length === s.level.targets.length &&
      s.resolvedThreats.length === s.level.threats.length
    )
      this.complete('won');
    this.score();
    s.revision++;
  }
  private complete(outcome: 'won' | 'lost') {
    if (this.state.phase !== 'playing') return;
    const s = this.state;
    s.phase = outcome;
    this.score();
    const achievements: string[] = [];
    if (outcome === 'won') achievements.push('Light keeper');
    if (outcome === 'won' && s.health === 100) achievements.push('Zero breaches');
    if (outcome === 'won' && s.moves <= s.level.mirrors.length * 2)
      achievements.push('Precision optics');
    if (s.participants >= 3) achievements.push('Community powered');
    s.result = {
      id: s.roundId,
      level: s.level.id,
      mode: s.mode,
      outcome,
      score: s.score,
      elapsed: s.elapsed,
      moves: s.moves,
      defenses: s.defenses,
      participants: s.participants,
      achievements,
      createdAt: new Date().toISOString(),
    };
    this.event(
      outcome === 'won' ? 'defense' : 'danger',
      outcome === 'won'
        ? 'Mission complete. The community kept the light alive.'
        : 'Mission ended. Review the path and try again.',
    );
    this.save(s.result);
  }
}
