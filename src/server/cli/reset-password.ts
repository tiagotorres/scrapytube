// Gives a user a new random password, for when nobody can sign in anymore.
//
//   docker exec scrapytube node src/server/cli/reset-password.ts <username>
//
// Without a username, lists the users.
import { randomInt } from 'node:crypto';
import path from 'node:path';

import { loadConfig } from '../config.ts';
import { openDatabase } from '../db.ts';
import { findUserByUsername, listUsers, setPassword } from '../store/users.ts';

const config = loadConfig();
const db = openDatabase(path.join(config.dataDir, 'scrapytube.db'));
const username = process.argv[2];

if (!username) {
  const users = listUsers(db);
  console.log(
    users.length
      ? `Users: ${users.map(user => `${user.username} (${user.name})`).join(', ')}\nUsage: reset-password <username>`
      : 'There are no users yet: open ScrapyTube to create the first one.',
  );
  process.exit(users.length ? 1 : 0);
}

const user = findUserByUsername(db, username);
if (!user) {
  console.error(`No user called "${username}".`);
  process.exit(1);
}

// Easy to type on a phone: four groups of four lowercase letters and digits.
const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
const password = Array.from({ length: 4 }, () =>
  Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join(''),
).join('-');

await setPassword(db, user.id, password);
db.close();
console.log(`New password for ${user.username}: ${password}\nSign in with it, then change it in Settings.`);
