import AsyncStorage from "@react-native-async-storage/async-storage";

export const ACTIVE_SCOPE_KEY = "artlink-active-account-scope-v1";
const GUEST_SCOPE_KEY = "artlink-current-guest-scope-v1";
export const PERSONAL_KEYS = [
  "artlink-notes", "artlink-note-state-v1", "artlink-profile", "artlink-goals", "artlink-feedbacks",
  "artlink-portfolio-items", "artlink-portfolio-summary", "artlink-public-portfolio-id",
  "artlink-matching-posts", "artlink-matching-deleted", "artlink-blocked-users", "artlink-reported-content",
  "artlink-device-user-id", "artlink-profile-token", "artlink-data-consent", "artlink-data-consent-asked",
  "artlink-ai-disclosure-accepted", "artlink-eula-accepted", "artlink-note-draft",
  "artlink-practice-log", "artlink-practice-queue",
];
const personal = new Set(PERSONAL_KEYS);
let currentScope = null; // null is only used before the one-time legacy migration
export const accountScope = (userId) => `account:${userId}`;
export const getStorageScope = () => currentScope;
export const isGuestScope = (scope) => typeof scope === "string" && (scope === "guest" || scope.startsWith("guest:"));
export const scopedKey = (key, scope = currentScope) => scope && personal.has(key) ? `${key}::${scope}` : key;

const LEGACY_SCOPE = "legacy-unassigned";
// Device-level, never scoped: once the owner claims the legacy snapshot the notice stays off.
const LEGACY_CLAIM_KEY = "artlink-legacy-records-claimed-v1";

const storageLocks = new Map();
export function withStorageLock(key, scope, operation) {
  const lockKey = scopedKey(key, scope);
  const previous = storageLocks.get(lockKey) || Promise.resolve();
  const run = previous.catch(() => {}).then(operation);
  storageLocks.set(lockKey, run);
  run.finally(() => { if (storageLocks.get(lockKey) === run) storageLocks.delete(lockKey); }).catch(() => {});
  return run;
}

export async function strictSetItem(key, value) {
  await AsyncStorage.setItem(key, value);
  if (await AsyncStorage.getItem(key) !== value) throw new Error("LOCAL_STORAGE_WRITE_FAILED");
}
let scopeWrites = Promise.resolve();
export function setStorageScope(scope, { isCurrent = () => true } = {}) {
  const run = scopeWrites.catch(() => {}).then(async () => {
    if (!isCurrent()) return null;
    await strictSetItem(ACTIVE_SCOPE_KEY, scope);
    if (!isCurrent()) {
      if (currentScope) await strictSetItem(ACTIVE_SCOPE_KEY, currentScope);
      return null;
    }
    currentScope = scope;
    return scope;
  });
  scopeWrites = run;
  return run;
}
export async function guestStorageScope() {
  return await AsyncStorage.getItem(GUEST_SCOPE_KEY) || "guest";
}

// Legacy values remain intact as a recovery backup. Only data whose owner can be
// established is imported. Logged-out legacy data must never become a new user's notes.
export async function initializeAccountStorage() {
  const active = await AsyncStorage.getItem(ACTIVE_SCOPE_KEY);
  if (active) { currentScope = active; return active; }
  const rawProfile = await AsyncStorage.getItem("artlink-profile");
  let profile = null;
  try { profile = rawProfile ? JSON.parse(rawProfile) : null; } catch {}
  // Older versions left account notes behind on logout, even after entering
  // guest mode. Neither an anonymous profile nor guestEntered proves ownership.
  const owner = profile?.authUserId ? accountScope(profile.authUserId) : LEGACY_SCOPE;
  for (const key of PERSONAL_KEYS) {
    const raw = await AsyncStorage.getItem(key);
    if (raw !== null && await AsyncStorage.getItem(scopedKey(key, owner)) === null) {
      await strictSetItem(scopedKey(key, owner), raw);
    }
  }
  return setStorageScope(owner === LEGACY_SCOPE ? "guest" : owner);
}

// Local, account-scoped erasure after the server confirmed the account is gone.
// Device-wide settings (language, device id, active scope, onboarding/guest history)
// and other accounts' namespaces are left untouched.
export async function clearAccountStorage(scope) {
  if (typeof scope !== "string" || !scope.startsWith("account:")) throw new Error("ACCOUNT_SCOPE_REQUIRED");
  for (const key of PERSONAL_KEYS) await AsyncStorage.removeItem(scopedKey(key, scope));
  // The pre-1.11.7 unscoped copy is kept as a backup. Remove it too when it provably
  // belongs to this account, but keep the device-wide consent flags.
  const deviceSettings = new Set(["artlink-data-consent", "artlink-data-consent-asked", "artlink-ai-disclosure-accepted", "artlink-eula-accepted"]);
  let legacyOwner = null;
  try {
    const raw = await AsyncStorage.getItem("artlink-profile");
    legacyOwner = raw ? JSON.parse(raw)?.authUserId : null;
  } catch { legacyOwner = null; }
  if (legacyOwner && accountScope(legacyOwner) === scope) {
    for (const key of PERSONAL_KEYS) if (!deviceSettings.has(key)) await AsyncStorage.removeItem(key);
  }
}

// A guest can claim their own work once. A fresh guest namespace is then allocated;
// the old namespace remains as a backup but is never offered to another account.
const guestTransfers = new Map();
export function transferGuestData(guestScope, targetScope) {
  const previous = guestTransfers.get(guestScope) || Promise.resolve();
  const run = previous.catch(() => {}).then(() => transferGuestDataOnce(guestScope, targetScope));
  guestTransfers.set(guestScope, run);
  run.finally(() => { if (guestTransfers.get(guestScope) === run) guestTransfers.delete(guestScope); }).catch(() => {});
  return run;
}
async function transferGuestDataOnce(guestScope, targetScope) {
  if (!isGuestScope(guestScope) || !targetScope.startsWith("account:")) return false;
  const claimKey = `artlink-guest-owner::${guestScope}`;
  const claimedBy = await AsyncStorage.getItem(claimKey);
  if (claimedBy && claimedBy !== targetScope) return false;
  // Record ownership before copying any bytes. A failed/overlapping sign-in may
  // retry for the same account, but may never claim this guest snapshot for B.
  if (!claimedBy) await strictSetItem(claimKey, targetScope);
  await copyScopeData(guestScope, targetScope);
  if (await guestStorageScope() === guestScope) {
    await strictSetItem(GUEST_SCOPE_KEY, `guest:${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  }
  return true;
}

// Merge one local namespace into another. The source is never deleted: it stays as a backup.
async function copyScopeData(sourceScope, targetScope) {
  const readState = async (scope) => {
    const raw = await AsyncStorage.getItem(scopedKey("artlink-note-state-v1", scope));
    if (raw) return JSON.parse(raw);
    const notes = await AsyncStorage.getItem(scopedKey("artlink-notes", scope));
    return { notes: notes ? JSON.parse(notes) : [], tombstones: {} };
  };
  // Wait for any save already started in the source or destination account.
  await withStorageLock("artlink-note-state-v1", sourceScope, () =>
    withStorageLock("artlink-note-state-v1", targetScope, async () => {
      const sourceState = await readState(sourceScope), targetState = await readState(targetScope);
      const notes = new Map((sourceState.notes || []).map((n) => [n.id, n]));
      (targetState.notes || []).forEach((n) => notes.set(n.id, n));
      const tombstones = { ...sourceState.tombstones, ...targetState.tombstones };
      await strictSetItem(scopedKey("artlink-note-state-v1", targetScope), JSON.stringify({
        notes: [...notes.values()].filter((n) => !tombstones[n.id]), tombstones,
      }));
    }));
  const transferable = ["artlink-goals", "artlink-feedbacks",
    "artlink-portfolio-items", "artlink-portfolio-summary", "artlink-matching-posts", "artlink-matching-deleted",
    "artlink-note-draft", "artlink-practice-log"];
  for (const key of transferable) {
    const sourceRaw = await AsyncStorage.getItem(scopedKey(key, sourceScope));
    if (sourceRaw === null) continue;
    const targetRaw = await AsyncStorage.getItem(scopedKey(key, targetScope));
    let next = sourceRaw;
    if (targetRaw !== null) {
      const source = JSON.parse(sourceRaw), target = JSON.parse(targetRaw);
      if (Array.isArray(source) && Array.isArray(target)) {
        const merged = new Map(source.map((v) => [v?.id ?? v?.sessionId ?? JSON.stringify(v), v]));
        target.forEach((v) => merged.set(v?.id ?? v?.sessionId ?? JSON.stringify(v), v));
        next = JSON.stringify([...merged.values()]);
      } else continue; // Never replace the destination account's existing document/draft.
    }
    await strictSetItem(scopedKey(key, targetScope), next);
  }
  return true;
}

// Bind once at the start of an asynchronous operation: a late result must keep its
// original namespace even if the user signs in to another account in the meantime.
export function rawStorageForScope(scope = currentScope) {
  return {
    getItem: (key) => AsyncStorage.getItem(scopedKey(key, scope)),
    setItem: (key, value) => AsyncStorage.setItem(scopedKey(key, scope), value),
    removeItem: (key) => AsyncStorage.removeItem(scopedKey(key, scope)),
  };
}

export async function hasUnassignedLegacyData() {
  if (await AsyncStorage.getItem(LEGACY_CLAIM_KEY)) return false;
  const storage = rawStorageForScope(LEGACY_SCOPE);
  for (const key of ["artlink-notes", "artlink-portfolio-items", "artlink-note-state-v1"]) {
    const raw = await storage.getItem(key);
    if (!raw) continue;
    try {
      const value = JSON.parse(raw);
      if (Array.isArray(value) ? value.length > 0 : value?.notes?.length > 0) return true;
    } catch { return true; }
  }
  return false;
}

// What the recovery screen shows before the user decides. Device-local only.
export async function summarizeUnassignedLegacyData() {
  const storage = rawStorageForScope(LEGACY_SCOPE);
  const parse = async (key) => {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };
  const state = await parse("artlink-note-state-v1");
  const notes = Array.isArray(state?.notes) ? state.notes : (await parse("artlink-notes"));
  const items = await parse("artlink-portfolio-items");
  const times = (Array.isArray(notes) ? notes : [])
    .map((n) => Date.parse(n?.createdAt || "")).filter((value) => !Number.isNaN(value));
  return {
    notes: Array.isArray(notes) ? notes.length : 0,
    portfolioItems: Array.isArray(items) ? items.length : 0,
    from: times.length ? new Date(Math.min(...times)).toISOString() : null,
    to: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}

// Only on an explicit user confirmation, and only from this device's own storage.
// Nothing is fetched from the server and the legacy snapshot is kept as a backup.
export async function claimUnassignedLegacyData(targetScope) {
  if (typeof targetScope !== "string" || !targetScope.startsWith("account:")) throw new Error("ACCOUNT_SCOPE_REQUIRED");
  if (await AsyncStorage.getItem(LEGACY_CLAIM_KEY)) return false;
  await copyScopeData(LEGACY_SCOPE, targetScope);
  await strictSetItem(LEGACY_CLAIM_KEY, targetScope);
  return true;
}
