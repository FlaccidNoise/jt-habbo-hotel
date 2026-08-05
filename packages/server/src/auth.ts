import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type Database from "better-sqlite3";
import { loadRuleset, hitsFilter } from "./filter.ts";
import { grantStarter, provisionSuite } from "./items.ts";
import { startOnboarding } from "./onboarding.ts";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const PW_PARAMS = `scrypt:N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P},len=${KEYLEN}`;

const usernameRuleset = loadRuleset(new URL("../filter-words.txt", import.meta.url).pathname);

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

function createSession(db: Database.Database, accountId: number): string {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, account_id, created_at) VALUES (?, ?, ?)").run(
    token,
    accountId,
    Date.now(),
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
  if (!row) throw new AuthError("invalid username or password");

  const hash = await hashPassword(password, row.pw_salt);
  if (hash.length !== row.pw_hash.length || !timingSafeEqual(hash, row.pw_hash)) {
    throw new AuthError("invalid username or password");
  }
  return { token: createSession(db, row.id) };
}

export function sessionAccount(
  db: Database.Database,
  token: string,
): { id: number; username: string } | null {
  const row = db
    .prepare(
      `SELECT accounts.id AS id, accounts.username AS username
       FROM sessions JOIN accounts ON accounts.id = sessions.account_id
       WHERE sessions.token = ?`,
    )
    .get(token) as { id: number; username: string } | undefined;
  return row ?? null;
}
