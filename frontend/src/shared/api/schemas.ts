import { z } from 'zod'

export const sideSchema = z.enum(['us', 'them'])
export const positionSchema = z.enum(['S', 'OH', 'OPP', 'MB', 'L'])
export const skillSchema = z.enum(['S', 'R', 'A', 'B', 'D', 'E', 'F'])
export const evaluationSchema = z.enum(['#', '+', '!', '-', '/', '='])

export type SideType = z.infer<typeof sideSchema>
export type PositionType = z.infer<typeof positionSchema>
export type SkillType = z.infer<typeof skillSchema>
export type EvaluationType = z.infer<typeof evaluationSchema>

export const teamSchema = z.object({ id: z.number(), name: z.string() })
export type TeamType = z.infer<typeof teamSchema>

export const playerSchema = z.object({
  id: z.number(),
  team_id: z.number(),
  number: z.number().nullable(),
  name: z.string(),
  position: positionSchema,
  is_active: z.boolean(),
})
export type PlayerType = z.infer<typeof playerSchema>

export const videoStatusSchema = z.enum(['pending', 'processing', 'ready', 'failed'])

export const videoSchema = z.object({
  id: z.number(),
  original_path: z.string(),
  proxy_path: z.string().nullable(),
  duration: z.number(),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  status: videoStatusSchema,
  error: z.string().nullable(),
  created_at: z.string(),
})
export type VideoType = z.infer<typeof videoSchema>

export const jobSchema = z.object({
  id: z.number(),
  kind: z.string(),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  progress: z.number(),
  payload: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
})
export type JobType = z.infer<typeof jobSchema>

const gameSetBase = {
  id: z.number(),
  match_id: z.number(),
  number: z.number(),
  video_id: z.number().nullable(),
  lineup: z.array(z.number()),
  lineup_roles: z.array(positionSchema).nullable().default(null),
  libero_ids: z.array(z.number()),
  we_serve_first: z.boolean(),
  verified: z.boolean(),
}

export const gameSetSchema = z.object(gameSetBase)
export type GameSetType = z.infer<typeof gameSetSchema>

export const setSummarySchema = z.object({
  ...gameSetBase,
  our_score: z.number(),
  their_score: z.number(),
  rally_count: z.number(),
  configured: z.boolean(),
  finished: z.boolean(),
})
export type SetSummaryType = z.infer<typeof setSummarySchema>

export const venueSchema = z.object({ id: z.number(), name: z.string(), slug: z.string() })
export type VenueType = z.infer<typeof venueSchema>

export const matchSchema = z.object({
  id: z.number(),
  team_id: z.number(),
  opponent: z.string(),
  date: z.string(),
  venue: z.string().nullable(),
  venue_id: z.number().nullable(),
  notes: z.string().nullable(),
  archived: z.boolean().default(false),
})

export const matchSummarySchema = matchSchema.extend({
  venue_name: z.string().nullable(),
  sets: z.array(setSummarySchema),
  sets_won: z.number(),
  sets_lost: z.number(),
})
export type MatchSummaryType = z.infer<typeof matchSummarySchema>

export const rallyStateSchema = z.object({
  our_score: z.number(),
  their_score: z.number(),
  serving: sideSchema,
  lineup: z.array(z.number()),
  on_court: z.array(z.number()),
  server_id: z.number().nullable(),
  setter_zone: z.number().nullable(),
  libero_replaces: z.number().nullable(),
  serve_subs: z.array(z.object({ in_id: z.number(), out_id: z.number(), due: z.enum(['serve_lost', 'front_row']).nullable() })),
  libero_out: z.boolean(),
  lineup_roles: z.array(positionSchema.nullable()),
})
export type RallyStateType = z.infer<typeof rallyStateSchema>

export const actionSchema = z.object({
  id: z.number(),
  rally_id: z.number(),
  order: z.number(),
  player_id: z.number().nullable(),
  skill: skillSchema,
  evaluation: evaluationSchema,
  video_time: z.number().nullable(),
})
export type ActionType = z.infer<typeof actionSchema>

/** serve — a sub comes in to serve and the starter is expected back; libero_* — the libero sits out / returns */
export const substitutionKindSchema = z.enum(['regular', 'serve', 'libero_out', 'libero_in'])
export const substitutionSchema = z.object({
  out_id: z.number().nullable().default(null),
  in_id: z.number().nullable().default(null),
  kind: substitutionKindSchema.default('regular'),
  // role the incoming player takes; null = the role of the player he replaces
  role: positionSchema.nullable().default(null),
})
export type SubstitutionType = z.infer<typeof substitutionSchema>

export const rallySchema = z.object({
  id: z.number(),
  set_id: z.number(),
  index: z.number(),
  start_time: z.number().nullable(),
  end_time: z.number().nullable(),
  winner: sideSchema.nullable(),
  substitutions: z.array(substitutionSchema),
  tags: z.array(z.string()),
  source: z.string(),
  note: z.string().nullable(),
  actions: z.array(actionSchema),
  state: rallyStateSchema.nullable(),
})
export type RallyType = z.infer<typeof rallySchema>

export const suggestionSchema = z.object({
  id: z.number(),
  set_id: z.number(),
  time: z.number(),
  skill: skillSchema,
  confidence: z.number(),
  ball: z.array(z.number()),
  player_box: z.array(z.number()).nullable(),
  player_id: z.number().nullable(),
  player_confidence: z.number().nullable(),
  status: z.enum(['pending', 'accepted', 'rejected']),
})
export type SuggestionType = z.infer<typeof suggestionSchema>

export const calibrationSchema = z.object({
  id: z.number(),
  video_id: z.number(),
  from_time: z.number(),
  points: z.array(z.tuple([z.number(), z.number()])),
  error_m: z.number(),
})
export type CalibrationType = z.infer<typeof calibrationSchema>

export const workspaceSchema = z.object({
  set: gameSetSchema,
  match: matchSchema,
  video: videoSchema.nullable(),
  players: z.array(playerSchema),
  rallies: z.array(rallySchema),
  suggestions: z.array(suggestionSchema),
  current: rallyStateSchema.nullable(),
  finished: z.boolean(),
  previous_set: gameSetSchema.pick({ lineup: true, lineup_roles: true, libero_ids: true, we_serve_first: true }).nullable().default(null),
})
export type WorkspaceType = z.infer<typeof workspaceSchema>

const ratio = z.number().nullable()

export const playerStatsSchema = z.object({
  player_id: z.number(),
  rallies_on_court: z.number(),
  points: z.number(),
  errors: z.number(),
  serve: z.object({ total: z.number(), ace: z.number(), error: z.number(), eff: ratio }),
  reception: z.object({
    total: z.number(),
    perfect: z.number(),
    positive: z.number(),
    error: z.number(),
    pos_pct: ratio,
    perf_pct: ratio,
  }),
  attack: z.object({
    total: z.number(),
    kill: z.number(),
    error: z.number(),
    blocked: z.number(),
    kill_pct: ratio,
    eff: ratio,
  }),
  block: z.object({ total: z.number(), point: z.number(), error: z.number() }),
  dig: z.object({ total: z.number(), positive: z.number(), error: z.number() }),
  set: z.object({ total: z.number(), error: z.number() }),
  raw: z.record(z.string(), z.record(z.string(), z.number())),
})
export type PlayerStatsType = z.infer<typeof playerStatsSchema>

export const rotationStatsSchema = z.object({
  setter_zone: z.number(),
  sideout_total: z.number(),
  sideout_won: z.number(),
  break_total: z.number(),
  break_won: z.number(),
})
export type RotationStatsType = z.infer<typeof rotationStatsSchema>

export const statsSchema = z.object({
  team: z.object({
    rallies: z.number(),
    won: z.number(),
    opponent_errors: z.number(),
    opponent_points: z.number(),
  }),
  players: z.array(playerStatsSchema),
  rotations: z.array(rotationStatsSchema),
  roster: z.array(playerSchema),
  matches: z.number().optional(),
})
export type StatsType = z.infer<typeof statsSchema>

export const highlightRallySchema = z.object({
  rally_id: z.number(),
  set_id: z.number(),
  set_number: z.number(),
  video_id: z.number(),
  start: z.number(),
  end: z.number(),
  score: z.string(),
  tags: z.array(z.string()),
  actions: z.array(z.tuple([z.number().nullable(), z.string(), z.string()])),
})
export type HighlightRallyType = z.infer<typeof highlightRallySchema>

export const highlightGroupSchema = z.object({
  key: z.string(),
  title: z.string(),
  rallies: z.array(highlightRallySchema),
})
export type HighlightGroupType = z.infer<typeof highlightGroupSchema>

const ratioOrNull = z.number().nullable()

export const analyzerMetricsSchema = z.object({
  rallies_true: z.number(),
  rallies_found: z.number(),
  rallies_false: z.number(),
  rally_precision: ratioOrNull,
  rally_recall: ratioOrNull,
  rally_f1: z.number(),
  start_error_s: ratioOrNull,
  end_error_s: ratioOrNull,
  action_precision: ratioOrNull,
  action_recall: ratioOrNull,
  action_f1: z.number(),
})
export type AnalyzerMetricsType = z.infer<typeof analyzerMetricsSchema>

export const evaluationReportSchema = z.object({
  overall: analyzerMetricsSchema,
  sets: z.array(analyzerMetricsSchema.extend({ set_id: z.number(), label: z.string() })),
  skipped: z.array(z.string()).optional(),
  at: z.string().optional(),
})
export type EvaluationReportType = z.infer<typeof evaluationReportSchema>

export const modelVersionSchema = z.object({
  scope: z.string(),
  kind: z.string(),
  version: z.string(),
  active: z.boolean(),
  created: z.string(),
  metrics: z.record(z.string(), z.unknown()).optional(),
  baseline: z.record(z.string(), z.unknown()).optional(),
  base: z.string().optional(),
})
export type ModelVersionType = z.infer<typeof modelVersionSchema>

export const learningScopeSchema = z.object({
  scope: z.string(),
  kind: z.enum(['general', 'venue', 'team']),
  label: z.string(),
  verified_sets: z.number(),
})
export type LearningScopeType = z.infer<typeof learningScopeSchema>

export const learningSummarySchema = z.object({
  scope: z.string(),
  scope_kind: z.enum(['general', 'venue', 'team']),
  profile: z.string().nullable(),
  cv_installed: z.boolean(),
  total_sets: z.number(),
  verified_sets: z.array(
    z.object({
      set_id: z.number(),
      label: z.string(),
      rallies: z.number(),
      actions: z.number(),
      precise_actions: z.number(),
      with_player_box: z.number(),
      has_detections: z.boolean(),
      has_calibration: z.boolean(),
    }),
  ),
  players: z.array(z.object({ player_id: z.number(), number: z.number().nullable(), name: z.string(), examples: z.number() })),
  suggestions: z.object({ accepted: z.number(), corrected: z.number(), rejected: z.number(), pending: z.number() }),
  readiness: z.object({
    tune: z.boolean(),
    ball: z.boolean(),
    players: z.boolean(),
    min_sets_ball: z.number(),
    min_examples_player: z.number(),
  }),
  last_evaluation: evaluationReportSchema.nullable(),
  datasets: z.object({
    ball: z.object({ images: z.object({ train: z.number(), val: z.number() }) }).nullable(),
    players: z.object({ players: z.record(z.string(), z.number()) }).nullable(),
  }),
  versions: z.record(z.string(), z.array(modelVersionSchema)),
})
export type LearningSummaryType = z.infer<typeof learningSummarySchema>
