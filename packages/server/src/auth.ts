import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type Database from "better-sqlite3";
import { loadRuleset, hitsFilter } from "./filter.ts";
import { grantFigure } from "./figure.ts";
import { grantStarter, provisionSuite } from "./items.ts";
import { startOnboarding } from "./onboarding.ts";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const PW_PARAMS = `scrypt:N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P},len=${KEYLEN}`;

const usernameRuleset = loadRuleset(new URL("../filter-words.txt", import.meta.url).pathname);

/** Fixed salt for the timing-equalising dummy hash on the login miss path. Not a secret: the
 *  work factor is the point, not the output. */
const DUMMY_SALT = Buffer.from("grand-dummy-salt");


export const CredentialsSchema = z.object({
  username: z.string().regex(/^[a-z0-9_-]{3,20}$/i),
  password: z.string().min(8).max(200),
});

export class AuthError extends Error {}

function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

function normalizeUsername(username: string): string {
  const fold: Record<string, string> = { "0": "o", "1": "l", "3": "e", "5": "s" };
  return username
    .toLowerCase()
    .replace(/[_-]/g, "")
    .replace(/[0135]/g, (d) => fold[d] ?? d);
}

/** Sessions live 30 days, sliding: an active session renews when it passes the half-life, so a
 *  regular player never sees a logout but an abandoned token dies. The DB stores only the
 *  SHA-256 of the bearer token — a leaked database no longer leaks live sessions. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createSession(db: Database.Database, accountId: number, ttlMs = SESSION_TTL_MS): string {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  db.prepare("INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    tokenHash(token),
    accountId,
    now,
    now + ttlMs,
  );
  return token;
}

export async function register(
  db: Database.Database,
  username: string,
  password: string,
): Promise<{ token: string }> {
  if (!/^[a-z0-9_-]{3,20}$/i.test(username)) {
    throw new AuthError("username must be 3-20 characters: letters, numbers, _ or - (no spaces)");
  }
  if (password.length < 8) throw new AuthError("password must be at least 8 characters");
  if (password.length > 200) throw new AuthError("password too long (max 200)");
  if (hitsFilter(usernameRuleset, username)) throw new AuthError("username not allowed");

  const salt = randomBytes(16);
  const hash = await hashPassword(password, salt);
  const normalized = normalizeUsername(username);

  // One transaction for the whole account: identity, starter grant, the suite those items are
  // placed in, the quest, and the session. A half-registered account — items but no suite, or a
  // suite nobody can log into — must not be reachable.
  try {
    return db.transaction((): { token: string } => {
      const info = db
        .prepare(
          `INSERT INTO accounts (username, username_normalized, pw_hash, pw_salt, pw_params, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(username, normalized, hash, salt, PW_PARAMS, Date.now());
      const accountId = Number(info.lastInsertRowid);

      grantStarter(db, accountId);
      grantFigure(db, accountId);
      provisionSuite(db, accountId, username);
      startOnboarding(db, accountId);
      return { token: createSession(db, accountId) };
    })();
  } catch (e) {
    // The only uniqueness constraint this path can hit is the username.
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      throw new AuthError("username already taken");
    }
    throw e;
  }
}

export async function login(
  db: Database.Database,
  username: string,
  password: string,
): Promise<{ token: string }> {
  const row = db.prepare("SELECT id, pw_hash, pw_salt FROM accounts WHERE username = ?").get(username) as
    | { id: number; pw_hash: Buffer; pw_salt: Buffer }
    | undefined;
  // Run scrypt even when the account does not exist, so the not-found path costs the same as a
  // wrong password and a caller cannot enumerate usernames by timing.
  const hash = await hashPassword(password, row ? row.pw_salt : DUMMY_SALT);
  if (!row) throw new AuthError("invalid username or password");
  if (hash.length !== row.pw_hash.length || !timingSafeEqual(hash, row.pw_hash)) {
    throw new AuthError("invalid username or password");
  }
  return { token: createSession(db, row.id) };
}

export function sessionAccount(
  db: Database.Database,
  token: string,
  ttlMs = SESSION_TTL_MS,
): { id: number; username: string; isStaff: boolean } | null {
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT sessions.account_id AS account_id, sessions.expires_at AS expiresAt,
              accounts.id AS id, accounts.username AS username, accounts.is_staff AS is_staff
       FROM sessions JOIN accounts ON accounts.id = sessions.account_id
       WHERE sessions.token = ?`,
    )
    .get(tokenHash(token)) as
    | { accountId: number; expiresAt: number; id: number; username: string; is_staff: number }
    | undefined;
  if (!row || row.expiresAt <= now) return null;
  // Sliding renewal: past the half-life, an active session earns a fresh full TTL.
  if (row.expiresAt - now < ttlMs / 2) {
    db.prepare("UPDATE sessions SET expires_at = ? WHERE token = ?").run(now + ttlMs, tokenHash(token));
  }
  return { id: row.id, username: row.username, isStaff: row.is_staff === 1 };
}
