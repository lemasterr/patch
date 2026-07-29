export type AppErrorCode =
  | "offline"
  | "auth_required"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "temporary"
  | "unknown";

export type AppError = {
  code: AppErrorCode;
  message: string;
  retryable: boolean;
  cause?: unknown;
};

const userMessages: Record<AppErrorCode, string> = {
  offline: "You’re offline. We’ll retry when you reconnect.",
  auth_required: "Please sign in again to continue.",
  forbidden: "You don’t have permission to do that.",
  not_found: "That item is no longer available.",
  validation: "Please check the information and try again.",
  conflict: "This changed elsewhere. Refresh and try again.",
  rate_limited: "Please wait a moment before trying again.",
  temporary: "Something temporary went wrong. Please try again.",
  unknown: "Something went wrong. Please try again.",
};

export function toAppError(error: unknown): AppError {
  const raw = error instanceof Error ? error.message : "";
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  const normalized = `${code} ${raw}`.toLowerCase();
  let appCode: AppErrorCode = "unknown";
  if (/network|fetch|offline|internet/.test(normalized)) appCode = "offline";
  else if (/jwt|session|auth|401/.test(normalized)) appCode = "auth_required";
  else if (/42501|forbidden|permission|403/.test(normalized))
    appCode = "forbidden";
  else if (/pgrst116|not found|no_data_found|404/.test(normalized))
    appCode = "not_found";
  else if (/23505|conflict|already|p0001/.test(normalized))
    appCode = "conflict";
  else if (/429|rate/.test(normalized)) appCode = "rate_limited";
  else if (/22023|23514|check|invalid|validation/.test(normalized))
    appCode = "validation";
  else if (/timeout|temporar|5\d\d/.test(normalized)) appCode = "temporary";
  return {
    code: appCode,
    message: userMessages[appCode],
    retryable: ["offline", "temporary", "conflict"].includes(appCode),
    cause: error,
  };
}

export type Result<T> =
  { data: T; error: null } | { data: null; error: AppError };

export async function asResult<T>(
  operation: () => Promise<T>,
): Promise<Result<T>> {
  try {
    return { data: await operation(), error: null };
  } catch (error) {
    return { data: null, error: toAppError(error) };
  }
}
