import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

/** Ein Authenticator aus Software (ES256, ohne Nachweis), so wie ihn ein Handy oder Schlüssel dem Browser liefert */

const b64 = (b: Uint8Array | Buffer): string => Buffer.from(b).toString('base64url');
const sha256 = (b: Uint8Array | Buffer | string): Buffer => createHash('sha256').update(b).digest();

// Eine kleine CBOR-Ausgabe: genug für Zahlen, Bytes, Text und Maps
function cbor(v: number | Buffer | string | Map<number | string, unknown>): Buffer {
  const head = (major: number, n: number): Buffer => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  };
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === 'string') {
    const t = Buffer.from(v);
    return Buffer.concat([head(3, t.length), t]);
  }
  return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, val]) => [cbor(k), cbor(val as any)])]);
}

export interface SoftAuthenticator {
  credentialId: string;
  /** setzt die Anzahl, die der Authenticator beim nächsten Mal meldet */
  counter: number;
  register(opts: { challenge: string; origin: string; rpID: string; userVerified?: boolean }): any;
  assert(opts: { challenge: string; origin: string; rpID: string; userHandle?: string | null; userVerified?: boolean; privateKey?: KeyObject }): any;
  privateKey: KeyObject;
}

export function createAuthenticator(): SoftAuthenticator {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credId = randomBytes(32);
  const cose = cbor(
    new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x!, 'base64url')],
      [-3, Buffer.from(jwk.y!, 'base64url')],
    ]),
  );
  const counterBytes = (n: number): Buffer => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };

  const self: SoftAuthenticator = {
    credentialId: b64(credId),
    counter: 0,
    privateKey,
    register({ challenge, origin, rpID, userVerified = true }) {
      const flags = 0x01 | 0x40 | (userVerified ? 0x04 : 0);
      const idLen = Buffer.alloc(2);
      idLen.writeUInt16BE(credId.length);
      const authData = Buffer.concat([sha256(rpID), Buffer.from([flags]), counterBytes(self.counter), Buffer.alloc(16), idLen, credId, cose]);
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }));
      return {
        id: b64(credId),
        rawId: b64(credId),
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(clientDataJSON),
          attestationObject: b64(cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))),
          transports: ['internal'],
        },
      };
    },
    assert({ challenge, origin, rpID, userHandle = null, userVerified = true, privateKey: key = privateKey }) {
      const flags = 0x01 | (userVerified ? 0x04 : 0);
      const authData = Buffer.concat([sha256(rpID), Buffer.from([flags]), counterBytes(self.counter)]);
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
      const signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), key);
      return {
        id: b64(credId),
        rawId: b64(credId),
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(clientDataJSON),
          authenticatorData: b64(authData),
          signature: b64(signature),
          ...(userHandle ? { userHandle: b64(Buffer.from(userHandle)) } : {}),
        },
      };
    },
  };
  return self;
}
