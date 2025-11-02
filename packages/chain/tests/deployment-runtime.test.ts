import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as viem from 'viem';
import { createDeploymentRuntime } from '../src/runtime/deploymentRuntime';

const ORIGINAL_ENV = { ...process.env };

const restoreEnv = () => {
  process.env = { ...ORIGINAL_ENV };
};

describe('createDeploymentRuntime', () => {
  beforeEach(() => {
    restoreEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('provides default local RPC mapping for Hardhat', () => {
    delete process.env.HARDHAT_RPC_URL;
    const runtime = createDeploymentRuntime();

    expect(runtime.resolveRpcUrls(31337)).toEqual(['http://127.0.0.1:8545']);
    expect(() => runtime.resolveRpcUrls(1)).toThrowError(
      /No RPC endpoints configured for chain 1/
    );
  });

  it('merges RPC overrides and delegates wallet client creation', () => {
    const runtime = createDeploymentRuntime({
      rpcOverrides: {
        31337: ['http://primary.local', 'http://secondary.local'],
        1: ['https://mainnet.example']
      },
      retryCount: 1,
      timeoutMs: 5000
    });

    const urls = runtime.resolveRpcUrls(1);
    expect(urls).toEqual(['https://mainnet.example']);

    const transport = runtime.createTransport(31337);
    expect(transport).toBeDefined();

    const walletClient = runtime.createWalletClient({ id: 31337 } as never);
    expect(typeof walletClient).toBe('object');
  });

  it('prefers environment configured endpoints when available', () => {
    process.env.SEPOLIA_RPC_PRIMARY = 'https://sepolia.primary';
    process.env.SEPOLIA_RPC_FALLBACK = 'https://sepolia.backup';
    process.env.HARDHAT_RPC_URL = 'http://localhost:8546';

    const runtime = createDeploymentRuntime();
    expect(runtime.resolveRpcUrls(11155111)).toEqual([
      'https://sepolia.primary',
      'https://sepolia.backup'
    ]);
    expect(runtime.resolveRpcUrls(31337)).toEqual(['http://localhost:8546']);
  });

  it('normalizes custom private key and returns single-endpoint transport', () => {
    process.env.DEPLOYER_PRIVATE_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    const runtime = createDeploymentRuntime({
      rpcOverrides: {
        99: ['http://single-endpoint.local']
      }
    });

    expect(runtime.account.address).toMatch(/^0x/);
    const urls = runtime.resolveRpcUrls(99);
    expect(urls).toEqual(['http://single-endpoint.local']);
    const transport = runtime.createTransport(99);
    expect(transport).toBeDefined();
  });
});
