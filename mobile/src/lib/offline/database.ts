import * as SQLite from "expo-sqlite";

export type OfflineOperationState = "pending" | "running" | "failed" | "dead";

export type OfflineOperation = {
  id: string;
  userId: string;
  operationType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  state: OfflineOperationState;
  attempt: number;
  nextAttemptAt: string;
  lastErrorCode: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type OfflineOperationRow = {
  id: string;
  user_id: string;
  operation_type: string;
  payload_json: string;
  idempotency_key: string;
  state: OfflineOperationState;
  attempt: number;
  next_attempt_at: string;
  last_error_code: string | null;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

const DATABASE_VERSION = 3;
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function nextOperationFailure(
  attempt: number,
  retryable: boolean,
  now = new Date(),
) {
  const dead = !retryable || attempt >= 7;
  const delayMilliseconds = Math.min(
    60 * 60 * 1000,
    1_000 * 2 ** Math.max(0, attempt - 1),
  );
  return {
    state: dead ? ("dead" as const) : ("failed" as const),
    nextAttemptAt: new Date(now.getTime() + delayMilliseconds).toISOString(),
  };
}

function toOperation(row: OfflineOperationRow): OfflineOperation {
  return {
    id: row.id,
    userId: row.user_id,
    operationType: row.operation_type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    idempotencyKey: row.idempotency_key,
    state: row.state,
    attempt: row.attempt,
    nextAttemptAt: row.next_attempt_at,
    lastErrorCode: row.last_error_code,
    leaseExpiresAt: row.lease_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function migrate(database: SQLite.SQLiteDatabase) {
  const versionRow = await database.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;
  await database.execAsync(
    "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;",
  );
  if (currentVersion === 0) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS offline_operations (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'failed', 'dead')),
        attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
        next_attempt_at TEXT NOT NULL,
        last_error_code TEXT,
        lease_expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS offline_operations_ready_idx
        ON offline_operations (user_id, state, next_attempt_at, created_at);
    `);
  }
  // Older queue rows used updated_at as an implicit lease. Migrate them to an
  // explicit expiry so a slow worker cannot hold work forever.
  if (currentVersion < 2) {
    const now = new Date().toISOString();
    await database.runAsync(
      `UPDATE offline_operations
       SET state = 'failed', next_attempt_at = ?, updated_at = ?
       WHERE state = 'running'`,
      now,
      now,
    );
  }
  if (currentVersion > 0 && currentVersion < 3) {
    await database.execAsync(
      "ALTER TABLE offline_operations ADD COLUMN lease_expires_at TEXT;",
    );
    const now = new Date().toISOString();
    await database.runAsync(
      `UPDATE offline_operations
       SET lease_expires_at = ?
       WHERE state = 'running' AND lease_expires_at IS NULL`,
      now,
    );
  }
  await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export function getOfflineDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("patch-offline.db").then(
      async (database) => {
        await migrate(database);
        return database;
      },
    );
  }
  return databasePromise;
}

export async function enqueueOperation(
  operation: Omit<
    OfflineOperation,
    | "state"
    | "attempt"
    | "nextAttemptAt"
    | "lastErrorCode"
    | "leaseExpiresAt"
    | "createdAt"
    | "updatedAt"
  >,
) {
  const database = await getOfflineDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO offline_operations (
      id, user_id, operation_type, payload_json, idempotency_key, state,
      attempt, next_attempt_at, last_error_code, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, NULL, ?, ?)
    ON CONFLICT(user_id, idempotency_key) DO NOTHING`,
    operation.id,
    operation.userId,
    operation.operationType,
    JSON.stringify(operation.payload),
    operation.idempotencyKey,
    now,
    now,
    now,
  );
}

export async function claimNextOperation(
  userId: string,
): Promise<OfflineOperation | null> {
  const database = await getOfflineDatabase();
  let claimed: OfflineOperation | null = null;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<OfflineOperationRow>(
      `SELECT * FROM offline_operations
       WHERE user_id = ?
         AND state IN ('pending', 'failed')
         AND next_attempt_at <= ?
       ORDER BY created_at ASC
       LIMIT 1`,
      userId,
      new Date().toISOString(),
    );
    if (!row) return;
    const now = new Date().toISOString();
    const leaseExpiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    await transaction.runAsync(
      "UPDATE offline_operations SET state = 'running', attempt = attempt + 1, lease_expires_at = ?, updated_at = ? WHERE id = ?",
      leaseExpiresAt,
      now,
      row.id,
    );
    claimed = toOperation({
      ...row,
      state: "running",
      attempt: row.attempt + 1,
      lease_expires_at: leaseExpiresAt,
      updated_at: now,
    });
  });
  return claimed as OfflineOperation | null;
}

export async function reclaimStalledOperations(
  userId: string,
  leaseMilliseconds = 2 * 60 * 1000,
) {
  const database = await getOfflineDatabase();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - leaseMilliseconds).toISOString();
  await database.runAsync(
    `UPDATE offline_operations
     SET state = 'failed', next_attempt_at = ?, lease_expires_at = NULL, updated_at = ?
     WHERE user_id = ? AND state = 'running' AND lease_expires_at <= ?`,
    now.toISOString(),
    now.toISOString(),
    userId,
    staleBefore,
  );
}

export async function completeOperation(id: string) {
  const database = await getOfflineDatabase();
  await database.runAsync("DELETE FROM offline_operations WHERE id = ?", id);
}

export async function releaseOperation(id: string) {
  const database = await getOfflineDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE offline_operations
     SET state = 'pending', next_attempt_at = ?, lease_expires_at = NULL, updated_at = ?
     WHERE id = ? AND state = 'running'`,
    now,
    now,
    id,
  );
}

export async function failOperation(
  id: string,
  attempt: number,
  errorCode: string,
  retryable: boolean,
) {
  const database = await getOfflineDatabase();
  const now = new Date();
  const next = nextOperationFailure(attempt, retryable, now);
  await database.runAsync(
    `UPDATE offline_operations
     SET state = ?, next_attempt_at = ?, last_error_code = ?, lease_expires_at = NULL, updated_at = ?
     WHERE id = ?`,
    next.state,
    next.nextAttemptAt,
    errorCode,
    now.toISOString(),
    id,
  );
}

export async function listOperations(
  userId: string,
  states?: readonly OfflineOperationState[],
) {
  const database = await getOfflineDatabase();
  const rows = states?.length
    ? await database.getAllAsync<OfflineOperationRow>(
        `SELECT * FROM offline_operations WHERE user_id = ? AND state IN (${states.map(() => "?").join(", ")}) ORDER BY created_at ASC`,
        [userId, ...states],
      )
    : await database.getAllAsync<OfflineOperationRow>(
        "SELECT * FROM offline_operations WHERE user_id = ? ORDER BY created_at ASC",
        userId,
      );
  return rows.map(toOperation);
}

export async function retryOperation(id: string) {
  const database = await getOfflineDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    "UPDATE offline_operations SET state = 'pending', next_attempt_at = ?, last_error_code = NULL, updated_at = ? WHERE id = ?",
    now,
    now,
    id,
  );
}

export async function discardOperation(id: string) {
  await completeOperation(id);
}

export async function clearOfflineUserData(userId: string) {
  const database = await getOfflineDatabase();
  await database.runAsync(
    "DELETE FROM offline_operations WHERE user_id = ?",
    userId,
  );
}
