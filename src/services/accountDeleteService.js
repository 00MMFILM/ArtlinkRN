import { SERVER_URL, getApiHeaders } from "./apiConfig";

// Real account deletion. Only `complete: true` from the server counts as done:
// anything else keeps the session and the local data so the user can retry.
// `excludes` lists what the server could not delete and must be shown as-is.
export async function requestAccountDelete() {
  const res = await fetch(`${SERVER_URL}/api/account-delete`, {
    method: "POST",
    headers: getApiHeaders(),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.ok !== true || body?.complete !== true) {
    const error = new Error("ACCOUNT_DELETE_INCOMPLETE");
    error.failed = Array.isArray(body?.failed) ? body.failed : [];
    error.retryable = body?.retryable !== false;
    throw error;
  }
  return {
    deleted: body.deleted || {},
    excludes: Array.isArray(body.excludes) ? body.excludes : [],
  };
}
