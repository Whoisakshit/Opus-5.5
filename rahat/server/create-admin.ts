// Creates the first control room admin. Everyone else is added from the Staff page.
//   npm run create-admin -- <username> "<Full name>"
// The password is asked for without echoing, generated if left empty, or read from RAHAT_ADMIN_PASSWORD.
import { createInterface } from 'node:readline';
import { randomBytes, randomUUID } from 'node:crypto';
import type { User } from './auth.ts';
import { hashPassword, passwordProblem } from './auth.ts';
import { openStorage } from './storage.ts';

const [username = '', ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ').trim();
if (!/^[a-z0-9._-]{3,32}$/.test(username) || name.length < 2) {
  console.error('Usage: npm run create-admin -- <username> "<Full name>"');
  process.exit(1);
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let asked = false;
    out._writeToOutput = (s: string) => {
      if (!asked) {
        out.output.write(s);
        asked = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

// Leave the password empty to have a strong one generated and shown once, right here.
let password = process.env.RAHAT_ADMIN_PASSWORD ?? (await askHidden('Password (min 10 characters, or press Enter to generate one): '));
const generated = !password;
if (generated) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  password = Array.from(randomBytes(16), (b) => chars[b % chars.length]).join('');
}
const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const store = openStorage();
const users = await store.loadUsers();
if (users.some((u) => u.username === username)) {
  await store.close();
  console.error(`"${username}" already exists.`);
  process.exit(1);
}
const admin: User = {
  id: randomUUID(),
  username,
  name,
  role: 'control',
  ...hashPassword(password),
  active: true,
  v: 1,
  createdAt: Date.now(),
};
await store.saveUser(admin);
await store.close();
console.log(`Created control room admin "${username}".`);
if (generated) {
  console.log(`Password: ${password}`);
  console.log('This is shown only once. Store it in a password manager, then sign in at /#/staff.');
}
