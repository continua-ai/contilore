export interface PiHookMessage {
  customType: string;
  content: string;
  display: boolean;
  details?: Record<string, unknown>;
}

export interface PiBeforeAgentStartEvent {
  prompt: string;
  systemPrompt: string;
}

export interface PiInputEvent {
  text: string;
  source?: "interactive" | "rpc" | "extension";
}

export interface PiToolCallEvent {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface PiToolResultEvent {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  details?: Record<string, unknown>;
  content?: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface PiTurnStartEvent {
  turnIndex: number;
}

export interface PiTurnEndEvent {
  turnIndex: number;
  message?: {
    usage?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      totalTokens?: number;
      cost?: {
        total?: number;
      };
    };
  };
}

export interface PiLikeApi {
  on(
    eventName: string,
    handler: (event: unknown, context: unknown) => Promise<unknown> | unknown,
  ): void;
}
