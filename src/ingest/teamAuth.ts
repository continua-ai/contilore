export interface TeamAuth {
  resolveTeamId(token: string): Promise<string | null>;
}

export interface TeamTokenConfig {
  teamId: string;
  token: string;
}

export function createSingleTeamAuth(config: TeamTokenConfig): TeamAuth {
  return {
    resolveTeamId: async (token) => (token === config.token ? config.teamId : null),
  };
}

export function createMultiTeamAuth(configs: TeamTokenConfig[]): TeamAuth {
  const tokenToTeam = new Map<string, string>();
  for (const entry of configs) {
    tokenToTeam.set(entry.token, entry.teamId);
  }

  return {
    resolveTeamId: async (token) => tokenToTeam.get(token) ?? null,
  };
}

export interface RemoteTeamAuthConfig {
  url: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  negativeCacheTtlMs?: number;
}

class RemoteTeamAuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parseRemoteTeamId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const teamId = (payload as { teamId?: unknown }).teamId;
  if (typeof teamId === "string" && teamId.trim()) {
    return teamId.trim();
  }

  const teamIdSnake = (payload as { team_id?: unknown }).team_id;
  if (typeof teamIdSnake === "string" && teamIdSnake.trim()) {
    return teamIdSnake.trim();
  }

  return null;
}

export function createRemoteTeamAuth(config: RemoteTeamAuthConfig): TeamAuth {
  const url = config.url.trim();
  if (!url) {
    throw new Error("RemoteTeamAuthConfig.url must be non-empty.");
  }

  const timeoutMs = config.timeoutMs ?? 2_000;
  const cacheTtlMs = config.cacheTtlMs ?? 5 * 60_000;
  const negativeCacheTtlMs = config.negativeCacheTtlMs ?? 30_000;

  const cache = new Map<string, { teamId: string | null; expiresAtMs: number }>();

  return {
    resolveTeamId: async (token) => {
      const nowMs = Date.now();
      const cached = cache.get(token);
      if (cached && cached.expiresAtMs > nowMs) {
        return cached.teamId;
      }

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json",
          },
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          cache.set(token, {
            teamId: null,
            expiresAtMs: nowMs + negativeCacheTtlMs,
          });
          return null;
        }

        if (!response.ok) {
          throw new RemoteTeamAuthError(
            `Remote team auth failed with status ${response.status}`,
            503,
          );
        }

        const payload = (await response.json()) as unknown;
        const teamId = parseRemoteTeamId(payload);
        if (!teamId) {
          throw new RemoteTeamAuthError(
            "Remote team auth returned invalid payload.",
            503,
          );
        }

        cache.set(token, { teamId, expiresAtMs: nowMs + cacheTtlMs });
        return teamId;
      } catch (error) {
        if (error instanceof RemoteTeamAuthError) {
          throw error;
        }

        throw new RemoteTeamAuthError("Remote team auth request failed.", 503);
      } finally {
        clearTimeout(timeoutHandle);
      }
    },
  };
}

export interface LoadTeamAuthFromEnvResult {
  auth: TeamAuth;
  teamCount: number;
}

function parseTeamTokensJson(raw: string): TeamTokenConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid HAPPY_PATHS_TEAM_TOKENS_JSON: not valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "Invalid HAPPY_PATHS_TEAM_TOKENS_JSON: expected an array of {teamId, token}.",
    );
  }

  const configs: TeamTokenConfig[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      throw new Error(
        "Invalid HAPPY_PATHS_TEAM_TOKENS_JSON: expected an array of objects.",
      );
    }

    const teamId = (entry as { teamId?: unknown }).teamId;
    const token = (entry as { token?: unknown }).token;

    if (typeof teamId !== "string" || typeof token !== "string") {
      throw new Error(
        "Invalid HAPPY_PATHS_TEAM_TOKENS_JSON: each entry must have string teamId + token.",
      );
    }

    const trimmedTeamId = teamId.trim();
    const trimmedToken = token.trim();

    if (!trimmedTeamId || !trimmedToken) {
      throw new Error(
        "Invalid HAPPY_PATHS_TEAM_TOKENS_JSON: teamId/token must be non-empty strings.",
      );
    }

    configs.push({ teamId: trimmedTeamId, token: trimmedToken });
  }

  if (configs.length === 0) {
    throw new Error(
      "Invalid HAPPY_PATHS_TEAM_TOKENS_JSON: expected at least one entry.",
    );
  }

  return configs;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function loadTeamAuthFromEnv(env: NodeJS.ProcessEnv): LoadTeamAuthFromEnvResult {
  const remoteAuthUrl = env.HAPPY_PATHS_TEAM_AUTH_URL;
  if (remoteAuthUrl?.trim()) {
    const auth = createRemoteTeamAuth({
      url: remoteAuthUrl,
      timeoutMs: parseNumber(env.HAPPY_PATHS_TEAM_AUTH_TIMEOUT_MS),
      cacheTtlMs: parseNumber(env.HAPPY_PATHS_TEAM_AUTH_CACHE_TTL_MS),
      negativeCacheTtlMs: parseNumber(env.HAPPY_PATHS_TEAM_AUTH_NEGATIVE_CACHE_TTL_MS),
    });

    return { auth, teamCount: 0 };
  }

  const multiTenant = env.HAPPY_PATHS_TEAM_TOKENS_JSON;
  if (multiTenant?.trim()) {
    const configs = parseTeamTokensJson(multiTenant);
    return {
      auth: createMultiTeamAuth(configs),
      teamCount: configs.length,
    };
  }

  const rawTeamId = env.HAPPY_PATHS_TEAM_ID ?? "default";
  const rawToken = env.HAPPY_PATHS_TEAM_TOKEN;

  if (!rawToken || !rawToken.trim()) {
    throw new Error(
      "Missing HAPPY_PATHS_TEAM_TOKEN (or HAPPY_PATHS_TEAM_TOKENS_JSON / HAPPY_PATHS_TEAM_AUTH_URL).",
    );
  }

  const teamId = rawTeamId.trim();
  const token = rawToken.trim();

  return {
    auth: createSingleTeamAuth({ teamId, token }),
    teamCount: 1,
  };
}

export function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const trimmed = authorization.trim();
  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (!match) {
    return null;
  }

  const token = match[1]?.trim();
  if (!token) {
    return null;
  }

  return token;
}
