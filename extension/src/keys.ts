// Simulated TEE ECIES keypair — persisted locally so restarts don't invalidate
// ciphertext already encrypted against a previous run's public key.
import * as fs from 'fs';
import * as path from 'path';
import * as eccrypto from 'eccrypto';

const KEYS_FILE = path.join(__dirname, '..', '.simulated_keys.json');

interface StoredKeys {
  privateKey: string; // hex, no 0x prefix
  publicKey: string; // hex, no 0x prefix (uncompressed, 0x04-prefixed point)
}

function loadOrCreateKeys(): StoredKeys {
  if (fs.existsSync(KEYS_FILE)) {
    return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
  }

  const privateKey = eccrypto.generatePrivate();
  const publicKey = eccrypto.getPublic(privateKey);
  const stored: StoredKeys = {
    privateKey: privateKey.toString('hex'),
    publicKey: publicKey.toString('hex'),
  };

  fs.writeFileSync(KEYS_FILE, JSON.stringify(stored, null, 2));
  console.log(`[keys] generated new simulated TEE keypair -> ${KEYS_FILE}`);
  return stored;
}

const keys = loadOrCreateKeys();

export function getPrivateKey(): Buffer {
  return Buffer.from(keys.privateKey, 'hex');
}

export function getPublicKey(): Buffer {
  return Buffer.from(keys.publicKey, 'hex');
}
