export type TraceScope = "personal" | "team" | "public";

export type TraceEventType =
  | "user_input"
  | "assistant_output"
  | "tool_call"
  | "tool_result"
  | "turn_summary"
  | "feedback"
  | "checkpoint";

export type OutcomeSignal = "success" | "failure" | "unknown";

export interface TokenUsage {
  inputUncached?: number;
  inputCached?: number;
  output?: number;
  thinking?: number;
  cacheWrite?: number;
}

export interface EventCost {
  usd?: number;
}

export interface EventMetrics {
  latencyMs?: number;
  tokens?: TokenUsage;
  cost?: EventCost;
  outcome?: OutcomeSignal;
}

export interface TraceEvent {
  id: string;
  timestamp: string;
  sessionId: string;
  agentId?: string;
  actorId?: string;
  harness: string;
  scope: TraceScope;
  type: TraceEventType;
  payload: Record<string, unknown>;
  tags?: string[];
  metrics?: EventMetrics;
}

export interface TraceQuery {
  sessionIds?: string[];
  since?: string;
  until?: string;
  types?: TraceEventType[];
  limit?: number;
}

export interface IndexedDocument {
  id: string;
  sourceEventId: string;
  text: string;
  terms?: string[];
  metadata?: Record<string, string | number | boolean | null>;
}

export interface SearchQuery {
  text: string;
  limit?: number;
  filters?: Record<string, string | number | boolean>;
}

export interface SearchResult {
  document: IndexedDocument;
  score: number;
}

export interface LearningSuggestion {
  id: string;
  title: string;
  rationale: string;
  confidence: number;
  evidenceEventIds: string[];
  playbookMarkdown: string;
}

export interface MinedArtifact {
  id: string;
  kind: "wrong_turn_fix" | "happy_path" | "anti_pattern";
  summary: string;
  confidence: number;
  evidenceEventIds: string[];
  metadata?: Record<string, string | number | boolean | null>;
}
