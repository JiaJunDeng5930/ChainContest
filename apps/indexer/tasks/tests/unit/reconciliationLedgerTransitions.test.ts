import { describe, expect, it } from 'vitest';
import {
  assertReconciliationStatusTransition,
  isAllowedReconciliationTransition,
  InvalidReconciliationStatusTransitionError
} from '@indexer-tasks/services/reconciliationProcessor';

const allowedPairs: Array<[string, string]> = [
  ['pending_review', 'in_review'],
  ['in_review', 'resolved'],
  ['resolved', 'needs_attention'],
  ['pending_review', 'needs_attention'],
  ['in_review', 'needs_attention'],
  ['needs_attention', 'in_review']
];

describe('reconciliation ledger status transitions', () => {
  it.each(allowedPairs)('allows %s -> %s', (from, to) => {
    expect(isAllowedReconciliationTransition(from, to)).toBe(true);
    expect(() => assertReconciliationStatusTransition(from, to)).not.toThrow();
  });

  it('rejects direct resolution without review', () => {
    expect(isAllowedReconciliationTransition('pending_review', 'resolved')).toBe(false);
    expect(() => assertReconciliationStatusTransition('pending_review', 'resolved')).toThrow(
      InvalidReconciliationStatusTransitionError
    );
  });

  it('rejects reverting resolved reports back to pending', () => {
    expect(isAllowedReconciliationTransition('resolved', 'pending_review')).toBe(false);
    expect(() => assertReconciliationStatusTransition('resolved', 'pending_review')).toThrow(
      InvalidReconciliationStatusTransitionError
    );
  });
});
