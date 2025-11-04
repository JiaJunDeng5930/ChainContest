import { SiweMessage } from 'siwe';
import { privateKeyToAccount } from 'viem/accounts';

const [nonce, expiresAt, keyOverride] = process.argv.slice(2);
if (!nonce || !expiresAt) {
  console.error('usage: node temp-sign-siwe.mjs <nonce> <expiresAt> [privateKey]');
  process.exit(1);
}
const privateKey =
  typeof keyOverride === 'string' && keyOverride.trim().length > 0
    ? keyOverride.trim()
    : '0x7797c0f3db8b946604ec2039dfd9763e4ffdc53174342a2ed9b14fa3eda666a5';
const account = privateKeyToAccount(privateKey);
const domain = 'localhost:44000';
const uri = 'http://localhost:43000';
const issuedAt = new Date().toISOString();
const message = new SiweMessage({
  domain,
  address: account.address,
  statement: 'Sign in to ChainContest',
  uri,
  version: '1',
  chainId: 31337,
  nonce,
  issuedAt,
  expirationTime: expiresAt
});
const preparedMessage = message.prepareMessage();
const signature = await account.signMessage({ message: preparedMessage });
console.log(JSON.stringify({ message: preparedMessage, signature }));
