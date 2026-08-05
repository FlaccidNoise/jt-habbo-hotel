import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openDb, closeDb } from "../src/db.ts";
import { register, login, sessionAccount, AuthError } from "../src/auth.ts";
import { grantStarter, listInventory, listRoomFurni, suiteOf } from "../src/items.ts";
import type Database from "better-sqlite3";

let dir: string;
let db: Database.Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-auth-"));
  db = openDb(join(dir, "test.db"));
});

afterEach(() => {
  closeDb(db);
  rmSync(dir, { recursive: true, force: true });
});

describe("auth", () => {
  test("register then login round-trips to the same account", async () => {
    await register(db, "alice", "hunter2pass");
    const { token } = await login(db, "alice", "hunter2pass");
    expect(sessionAccount(db, token)?.username).toBe("alice");
  });

  test("wrong password throws AuthError", async () => {
    await register(db, "bob", "correctpass");
    await expect(login(db, "bob", "wrongpass1")).rejects.toThrow(AuthError);
  });

  test("unknown username throws AuthError", async () => {
    await expect(login(db, "nobody", "whatever1")).rejects.toThrow(AuthError);
  });

  test("bad token resolves to null", () => {
    expect(sessionAccount(db, "not-a-real-token")).toBeNull();
  });

  test("duplicate usernames rejected: exact, case-insensitive, and normalized-fold collisions", async () => {
    await register(db, "alice", "password1");
    await expect(register(db, "alice", "password2")).rejects.toThrow(AuthError);
    await expect(register(db, "Alice", "password2")).rejects.toThrow(AuthError);
    // Fold rule is 0→o 1→l 3→e 5→s: "a1ice" normalizes to "alice" (the plan's own draft used
    // "al1ce", which folds to "allce" and does not collide — a transposition typo relative to
    // the pinned fold table; "a1ice" is the pair that actually exercises the rule as written.
    await expect(register(db, "a1ice", "password2")).rejects.toThrow(AuthError);
  });

  test("username regex rejects too short, too long, spaces, and non-ASCII", async () => {
    await expect(register(db, "ab", "password1")).rejects.toThrow(AuthError);
    await expect(register(db, "a".repeat(21), "password1")).rejects.toThrow(AuthError);
    await expect(register(db, "bad name", "password1")).rejects.toThrow(AuthError);
    await expect(register(db, "héllo", "password1")).rejects.toThrow(AuthError);
  });

  test("password under 8 characters throws", async () => {
    await expect(register(db, "shortpw", "short")).rejects.toThrow(AuthError);
  });

  test("registration rejects a wordlist hit in the username", async () => {
    await expect(register(db, "shit", "password1")).rejects.toThrow(AuthError);
  });

  test("grantStarter grants exactly five items once, placed into the suite at registration", async () => {
    await register(db, "carol", "password1");
    const account = db.prepare("SELECT id FROM accounts WHERE username = ?").get("carol") as {
      id: number;
    };
    // Registration provisions the suite with all five starter items placed — inventory is empty.
    const suite = suiteOf(db, account.id);
    expect(suite).not.toBeNull();
    expect(listInventory(db, account.id)).toHaveLength(0);
    expect(listRoomFurni(db, suite!)).toHaveLength(5);

    grantStarter(db, account.id); // already granted — no-op
    expect(listRoomFurni(db, suite!)).toHaveLength(5);
    expect(listInventory(db, account.id)).toHaveLength(0);

    db.prepare("DELETE FROM furni_items WHERE owner_id = ?").run(account.id); // empty the table
    grantStarter(db, account.id); // flag still set — grants nothing back
    expect(listInventory(db, account.id)).toHaveLength(0);
  });
});
