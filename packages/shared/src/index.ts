import { z } from 'zod';
export const VecSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
export const SurfaceSchema = z
  .object({ id: z.string(), a: VecSchema, b: VecSchema, kind: z.enum(['mirror', 'absorber']) })
  .strict();
export const TargetSchema = z
  .object({ id: z.string(), center: VecSchema, radius: z.number().positive() })
  .strict();
export const MirrorSchema = z
  .object({
    id: z.string(),
    center: VecSchema,
    length: z.number().positive(),
    angle: z.number().finite(),
  })
  .strict();
export const DefenseSchema = z.enum(['shield', 'quarantine', 'verify']);
export type Defense = z.infer<typeof DefenseSchema>;
export const ThreatSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    classification: z.string(),
    defense: DefenseSchema,
    starts: z.number().nonnegative(),
    ends: z.number().positive(),
  })
  .strict();
export const LevelSchema = z
  .object({
    id: z.number().int().min(1).max(3),
    name: z.string(),
    subtitle: z.string(),
    difficulty: z.string(),
    hint: z.string(),
    emitter: VecSchema,
    aim: z.number().finite(),
    mirrors: z.array(MirrorSchema).max(16),
    targets: z.array(TargetSchema).max(32),
    obstacles: z.array(SurfaceSchema).max(64),
    duration: z.number().positive(),
    moveLimit: z.number().int().positive(),
    threats: z.array(ThreatSchema).max(16),
  })
  .strict();
export type Level = z.infer<typeof LevelSchema>;
export const TraceSchema = z.object({
  segments: z
    .array(z.object({ from: VecSchema, to: VecSchema, hit: z.string().nullable() }))
    .max(65),
  targets: z.array(z.string()).max(64),
  termination: z.enum(['escape', 'absorbed', 'limit']),
});
export const ResultSchema = z
  .object({
    id: z.string(),
    level: z.number().int(),
    mode: z.enum(['demo', 'twitch']),
    outcome: z.enum(['won', 'lost']),
    score: z.number().nonnegative(),
    elapsed: z.number().nonnegative(),
    moves: z.number().int().nonnegative(),
    defenses: z.number().int().nonnegative(),
    participants: z.number().int().nonnegative(),
    achievements: z.array(z.string()),
    createdAt: z.string(),
  })
  .strict();
export type RoundResult = z.infer<typeof ResultSchema>;
export const TwitchStatusSchema = z
  .object({
    state: z.enum(['disabled', 'disconnected', 'connecting', 'connected', 'error']),
    detail: z.string(),
    configured: z.boolean(),
  })
  .strict();
export type TwitchStatus = z.infer<typeof TwitchStatusSchema>;
export const CommandResultSchema = z
  .object({
    status: z.enum(['queued', 'accepted', 'rejected']),
    code: z.string(),
    message: z.string(),
  })
  .strict();
export type CommandResult = z.infer<typeof CommandResultSchema>;
export const EventSchema = z.object({
  id: z.number().int(),
  at: z.number().nonnegative(),
  kind: z.enum(['info', 'accepted', 'rejected', 'queued', 'defense', 'danger']),
  text: z.string(),
});
export type EventEntry = z.infer<typeof EventSchema>;
export const GameStateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    roundId: z.string(),
    mode: z.enum(['demo', 'twitch']),
    phase: z.enum(['idle', 'playing', 'paused', 'won', 'lost']),
    level: LevelSchema,
    aim: z.number().finite(),
    elapsed: z.number().nonnegative(),
    remaining: z.number().nonnegative(),
    moves: z.number().int().nonnegative(),
    score: z.number().nonnegative(),
    health: z.number().min(0).max(100),
    shields: z.number().int().nonnegative(),
    defenses: z.number().int().nonnegative(),
    participants: z.number().int().nonnegative(),
    charge: z.record(z.string(), z.number().min(0).max(800)),
    captured: z.array(z.string()),
    activeThreat: ThreatSchema.nullable(),
    resolvedThreats: z.array(z.string()),
    votes: z.object({
      shield: z.number().int().nonnegative(),
      quarantine: z.number().int().nonnegative(),
      verify: z.number().int().nonnegative(),
    }),
    trace: TraceSchema,
    events: z.array(EventSchema).max(40),
    queueDepth: z.number().int().nonnegative(),
    result: ResultSchema.nullable(),
    twitch: TwitchStatusSchema,
  })
  .strict();
export type GameState = z.infer<typeof GameStateSchema>;
export const ServerMessageSchema = z
  .object({ type: z.literal('state'), state: GameStateSchema })
  .strict();
export const ErrorSchema = z.object({ error: z.string(), message: z.string() }).strict();
export const ControlSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), level: z.number().int().min(1).max(3) }).strict(),
  ...(['reset', 'next', 'pause', 'resume'] as const).map((type) =>
    z.object({ type: z.literal(type) }).strict(),
  ),
  z.object({ type: z.literal('aim'), angle: z.number().finite().min(-180).max(180) }).strict(),
]);
export type Control = z.infer<typeof ControlSchema>;
export const ChatInputSchema = z
  .object({ text: z.string().min(1).max(160), eventId: z.string().uuid() })
  .strict();
export type Command =
  | { kind: 'rotate'; mirror: string; degrees: number }
  | { kind: 'vote'; defense: Defense }
  | { kind: 'help' | 'hint' | 'score' | 'status' };
const walls: Level['obstacles'] = [
  { id: 'north', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, kind: 'absorber' },
  { id: 'east', a: { x: 1000, y: 0 }, b: { x: 1000, y: 600 }, kind: 'absorber' },
  { id: 'south', a: { x: 1000, y: 600 }, b: { x: 0, y: 600 }, kind: 'absorber' },
  { id: 'west', a: { x: 0, y: 600 }, b: { x: 0, y: 0 }, kind: 'absorber' },
];
const threats: Level['threats'] = [
  {
    id: 'phish',
    label: 'Phishing wave',
    classification: 'Social engineering',
    defense: 'quarantine',
    starts: 2000,
    ends: 9000,
  },
  {
    id: 'burst',
    label: 'Request burst',
    classification: 'Traffic anomaly',
    defense: 'shield',
    starts: 12000,
    ends: 19000,
  },
  {
    id: 'login',
    label: 'Suspicious login',
    classification: 'Identity anomaly',
    defense: 'verify',
    starts: 22000,
    ends: 29000,
  },
];
export const LEVELS: Level[] = [
  {
    id: 1,
    name: 'First light',
    subtitle: 'One reflection. One shared decision.',
    difficulty: 'Initiate',
    hint: 'Aim at 0°. Set A to −45°. Quarantine the phishing wave.',
    emitter: { x: 100, y: 450 },
    aim: -15,
    mirrors: [{ id: 'A', center: { x: 480, y: 450 }, length: 110, angle: -30 }],
    targets: [{ id: 'T1', center: { x: 480, y: 125 }, radius: 22 }],
    obstacles: walls,
    duration: 75000,
    moveLimit: 18,
    threats: threats.slice(0, 1),
  },
  {
    id: 2,
    name: 'Chain reaction',
    subtitle: 'Link two mirrors to reach the vault.',
    difficulty: 'Operator',
    hint: 'Aim at 0°. Set A and B to −45°. Quarantine phishing, then shield the burst.',
    emitter: { x: 100, y: 450 },
    aim: -15,
    mirrors: [
      { id: 'A', center: { x: 420, y: 450 }, length: 110, angle: -30 },
      { id: 'B', center: { x: 420, y: 160 }, length: 110, angle: -60 },
    ],
    targets: [
      { id: 'T1', center: { x: 420, y: 285 }, radius: 20 },
      { id: 'T2', center: { x: 840, y: 160 }, radius: 22 },
    ],
    obstacles: [
      ...walls,
      { id: 'barrier', a: { x: 650, y: 300 }, b: { x: 650, y: 530 }, kind: 'absorber' },
    ],
    duration: 100000,
    moveLimit: 24,
    threats: threats.slice(0, 2),
  },
  {
    id: 3,
    name: 'Zero trust',
    subtitle: 'Three reflections. Defend every layer.',
    difficulty: 'Architect',
    hint: 'Aim at 0°. Set A and B to −45°, C to 45°. Defenses: quarantine, shield, verify.',
    emitter: { x: 100, y: 450 },
    aim: -15,
    mirrors: [
      { id: 'A', center: { x: 350, y: 450 }, length: 100, angle: -15 },
      { id: 'B', center: { x: 350, y: 140 }, length: 100, angle: -60 },
      { id: 'C', center: { x: 780, y: 140 }, length: 100, angle: 60 },
    ],
    targets: [
      { id: 'T1', center: { x: 350, y: 280 }, radius: 20 },
      { id: 'T2', center: { x: 560, y: 140 }, radius: 20 },
      { id: 'T3', center: { x: 780, y: 480 }, radius: 22 },
    ],
    obstacles: [
      ...walls,
      { id: 'barrier', a: { x: 540, y: 270 }, b: { x: 540, y: 560 }, kind: 'absorber' },
    ],
    duration: 120000,
    moveLimit: 32,
    threats,
  },
];
