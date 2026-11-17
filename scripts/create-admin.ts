// Trusted operator command; accepts JSON via stdin, never command-line passwords.
import { z } from 'zod';
import { authDb, uniqueConflict } from '../src/modules/auth/auth.repository.js';
import { email, password } from '../src/modules/auth/auth.schema.js';
import { hashPassword } from '../src/modules/auth/auth.crypto.js';
const schema = z.strictObject({
  email,
  password,
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(['SUPER_ADMIN', 'OPERATIONS_LEAD', 'CUSTOMER_CARE']),
});
try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (input.length > 4096) throw new Error('Input too large');
  }
  const parsed = schema.safeParse(JSON.parse(input));
  if (!parsed.success) throw new Error('Invalid admin input');
  await authDb.user.create({
    data: {
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });
  process.stdout.write(
    'Administrator created. First sign-in requires MFA enrollment.\n',
  );
} catch (error) {
  process.stderr.write(
    uniqueConflict(error)
      ? 'Account already exists; no changes made.\n'
      : 'Admin creation failed. Check input and database configuration.\n',
  );
  process.exitCode = 1;
} finally {
  await authDb.$disconnect();
}
