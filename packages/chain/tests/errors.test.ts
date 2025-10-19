import { describe, expect, it } from 'vitest';
import {
  ContestChainError,
  createContestChainError,
  createNotImplementedError,
  formatContestChainError,
  isContestChainError,
  wrapContestChainError,
  assertContestChainError,
  CONTEST_CHAIN_ERROR_CODES,
} from '../src/errors/contestChainError';

describe('ContestChainError utilities', () => {
  it('creates immutable contest chain error', () => {
    const error = createContestChainError({
      code: 'RULE_VIOLATION',
      message: 'Rule broken',
      details: { rule: 'cooldown' },
      retryable: false,
    });

    expect(error.code).toBe('RULE_VIOLATION');
    expect(Object.isFrozen(error.details)).toBe(true);
    expect(isContestChainError(error)).toBe(true);
  });

  it('wraps external error and infers code', () => {
    const original = Object.assign(new Error('Nonce too low'), { code: 'NONCE_TOO_LOW' });
    const wrapped = wrapContestChainError(original);

    expect(wrapped.code).toBe('STATE_CONFLICT');
    expect(wrapped).not.toBe(original);
  });

  it('produces formatted output', () => {
    const error = createNotImplementedError('todo');
    const formatted = formatContestChainError(error);

    expect(formatted).toContain('NOT_IMPLEMENTED');
  });

  it('assertContestChainError rethrows non domain errors', () => {
    const example = new Error('boom');
    expect(() => assertContestChainError(example, { code: 'INTERNAL_ERROR' })).toThrowError(
      ContestChainError,
    );
  });


  it('wrapContestChainError uses fallback message', () => {
    const wrapped = wrapContestChainError(new Error('unknown'), {
      code: 'INTERNAL_ERROR',
      message: 'fallback',
    });
    expect(wrapped.message).toBe('fallback');
  });

  it('wrapContestChainError returns same instance for domain error', () => {
    const base = createNotImplementedError('x');
    const wrapped = wrapContestChainError(base);
    expect(wrapped).toBe(base);
  });

  it('wraps primitive values using fallback descriptor', () => {
    const wrapped = wrapContestChainError('boom', { code: 'INTERNAL_ERROR' });
    expect(wrapped.code).toBe('INTERNAL_ERROR');
  });

  it('assertContestChainError returns existing domain error', () => {
    const existing = createNotImplementedError('existing');
    expect(assertContestChainError(existing)).toBe(existing);
  });

  it('formatContestChainError includes source and details', () => {
    const error = createContestChainError({
      code: 'CHAIN_UNAVAILABLE',
      message: 'rpc down',
      details: { retry: 1 },
      source: 'rpc',
    });
    const formatted = formatContestChainError(error);
    expect(formatted).toContain('source=rpc');
    expect(formatted).toContain('details=');
  });
  it('infers authorization code from message', () => {
    const wrapped = wrapContestChainError(new Error('allowance missing'), {
      code: 'INTERNAL_ERROR',
    });
    expect(wrapped.code).toBe('AUTHORIZATION_REQUIRED');
  });
  it('serializes to JSON structure', () => {
    const base = createContestChainError({
      code: 'CHAIN_UNAVAILABLE',
      message: 'rpc down',
      details: { attempt: 1 },
    });
    const json = base.toJSON();
    expect(json.code).toBe('CHAIN_UNAVAILABLE');
    expect(json.details).toMatchObject({ attempt: 1 });
  });
  it('exposes list of error codes for reference', () => {
    expect(CONTEST_CHAIN_ERROR_CODES).toContain('CHAIN_UNAVAILABLE');
  });
});
