// Encryption for secrets the app has to read back (the Client Credentials vault's
// passwords), so a copy of the database — a backup, a leaked dump, someone with
// read access to the host — does not hand over every client's logins.
//
// AES-256-GCM with the key in CREDENTIALS_ENCRYPTION_KEY (64 hex characters =
// 32 bytes; make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
// A stored value looks like  enc:v1:<base64 of iv(12) + tag(16) + ciphertext>.
// Anything without that prefix is an old plain value: it is read as it is and
// encrypted the next time the vault is opened with the key set.
//
// ⚠️ Lose the key and every encrypted password is gone for good — keep a copy of
// it somewhere safe outside Vercel. Changing it makes the old values unreadable.
const crypto = require('crypto');

const PREFIX = 'enc:v1:';

// The key as 32 bytes, or null when it is not set. A set but malformed key is
// an error, not "off": silently storing plain text because of a typo would be
// worse than refusing.
function key() {
  const raw = String(process.env.CREDENTIALS_ENCRYPTION_KEY || '').trim();
  if (!raw) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('CREDENTIALS_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  return Buffer.from(raw, 'hex');
}

const isEncrypted = v => typeof v === 'string' && v.startsWith(PREFIX);

// Encrypts a value. Empty stays empty. Throws when there is no key, so a caller
// can refuse to save rather than write the secret in plain text.
function seal(plain) {
  if (plain == null || plain === '') return plain;
  if (isEncrypted(plain)) return plain;
  const k = key();
  if (!k) throw Object.assign(new Error('CREDENTIALS_ENCRYPTION_KEY is not set'), { code: 'NO_VAULT_KEY' });
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const body = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

// Reads a value back: { value } for plain or decryptable text, or
// { value: null, locked: true } when it is encrypted and cannot be opened
// (no key, or a different key from the one that sealed it).
function open(stored) {
  if (!isEncrypted(stored)) return { value: stored == null ? stored : String(stored) };
  try {
    const k = key();
    if (!k) return { value: null, locked: true };
    const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', k, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return { value: Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8') };
  } catch (e) {
    return { value: null, locked: true };
  }
}

module.exports = { seal, open, isEncrypted, hasKey: () => !!key() };
