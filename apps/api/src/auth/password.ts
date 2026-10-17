import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 defaults to Argon2id (19 MiB memory, 2 passes, 1 lane),
// the OWASP-recommended baseline.
export const hashPassword = (password: string) => hash(password);

export const verifyPassword = ({ hash: hashed, password }: { hash: string; password: string }) =>
  verify(hashed, password);
