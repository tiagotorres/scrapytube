import type { z } from 'zod';

import type { createUserSchema, updateMeSchema, updateUserSchema } from '#shared/schemas.ts';
import type { User } from '#shared/types.ts';

import type { Database } from '../db.ts';
import { now, transaction } from '../db.ts';
import { HttpError } from '../errors.ts';
import { hashPassword } from '../passwords.ts';
import { deleteUserSessions } from '../sessions.ts';
import type { UserRow } from './rows.ts';
import { SELECT_USER, requireUser, toUser } from './rows.ts';

// Every user can do everything, including managing the other users.
// Removing a user signs them out everywhere; their downloads stay, without
// their name.

export type CreateUserData = z.output<typeof createUserSchema>;
export type UpdateUserData = z.output<typeof updateUserSchema>;
export type UpdateMeData = z.output<typeof updateMeSchema>;

/** True once anyone has been created (setup is done). */
export function hasUsers(db: Database): boolean {
  return db.prepare('SELECT 1 FROM users LIMIT 1').get() !== undefined;
}

export function listUsers(db: Database): User[] {
  const rows = db.prepare(`${SELECT_USER} ORDER BY u.name COLLATE NOCASE, u.id`).all() as unknown as UserRow[];
  return rows.map(toUser);
}

export function findUserByUsername(db: Database, username: string): UserRow | undefined {
  return db.prepare(`${SELECT_USER} WHERE u.username = ?`).get(username.toLowerCase()) as UserRow | undefined;
}

function checkUsernameFree(db: Database, username: string, exceptId?: number) {
  const existing = findUserByUsername(db, username);
  if (existing && existing.id !== exceptId) throw new HttpError(409, 'USERNAME_TAKEN');
}

export async function createUser(db: Database, input: CreateUserData): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  return transaction(db, () => {
    checkUsernameFree(db, input.username);
    const timestamp = now();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO users (username, name, password_hash, language, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.username, input.name, passwordHash, input.language, timestamp, timestamp);
    return toUser(requireUser(db, Number(lastInsertRowid)));
  });
}

export function updateUser(db: Database, id: number, input: UpdateUserData): User {
  return transaction(db, () => {
    const row = requireUser(db, id);
    const name = input.name ?? row.name;
    const username = input.username ?? row.username;
    if (username !== row.username) checkUsernameFree(db, username, id);
    if (name !== row.name || username !== row.username) {
      db.prepare('UPDATE users SET name = ?, username = ?, updated_at = ? WHERE id = ?').run(
        name,
        username,
        now(),
        id,
      );
    }
    return toUser(requireUser(db, id));
  });
}

/** Changes made by people to their own account (name, language). */
export function updateMe(db: Database, id: number, input: UpdateMeData): User {
  return transaction(db, () => {
    const row = requireUser(db, id);
    const name = input.name ?? row.name;
    const language = input.language ?? row.language;
    if (name !== row.name || language !== row.language) {
      db.prepare('UPDATE users SET name = ?, language = ?, updated_at = ? WHERE id = ?').run(
        name,
        language,
        now(),
        id,
      );
    }
    return toUser(requireUser(db, id));
  });
}

/**
 * Sets a new password and signs the user out on their other devices.
 * `keepSessionId` keeps the session that made the change signed in.
 */
export async function setPassword(db: Database, id: number, password: string, keepSessionId?: string) {
  const passwordHash = await hashPassword(password);
  transaction(db, () => {
    requireUser(db, id);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, now(), id);
    deleteUserSessions(db, id, keepSessionId);
  });
}

export function removeUser(db: Database, actorId: number, id: number) {
  if (actorId === id) throw new HttpError(400, 'CANNOT_REMOVE_SELF');
  transaction(db, () => {
    requireUser(db, id);
    // Sessions go with the user; their downloads stay (ON DELETE SET NULL).
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });
}
