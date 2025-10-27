import type {
  BlockAnchorShape,
  ContestEventEnvelopeShape,
  EventCursorShape,
} from '../gateway/domainModels.js';

export interface EventDecodingOptions {
  readonly cursor?: EventCursorShape;
  readonly fromBlock?: bigint;
  readonly toBlock?: bigint;
  readonly limit?: number;
  readonly fallbackCursor: EventCursorShape;
  readonly fallbackBlock: BlockAnchorShape;
}

const compareEvents = (
  left: ContestEventEnvelopeShape,
  right: ContestEventEnvelopeShape,
): number => {
  if (left.blockNumber !== right.blockNumber) {
    return left.blockNumber < right.blockNumber ? -1 : 1;
  }
  if (left.logIndex !== right.logIndex) {
    return left.logIndex - right.logIndex;
  }
  return 0;
};

const isAfterCursor = (
  event: ContestEventEnvelopeShape,
  cursor?: EventCursorShape,
): boolean => {
  if (!cursor) {
    return true;
  }
  if (event.blockNumber > cursor.blockNumber) {
    return true;
  }
  if (event.blockNumber === cursor.blockNumber) {
    return event.logIndex > cursor.logIndex;
  }
  return false;
};

const withinFromBlock = (
  event: ContestEventEnvelopeShape,
  fromBlock?: bigint,
): boolean => {
  if (fromBlock === undefined) {
    return true;
  }
  return event.blockNumber >= fromBlock;
};

const withinToBlock = (
  event: ContestEventEnvelopeShape,
  toBlock?: bigint,
): boolean => {
  if (toBlock === undefined) {
    return true;
  }
  return event.blockNumber <= toBlock;
};

const applyLimit = <T>(events: readonly T[], limit?: number): readonly T[] => {
  if (!limit || limit <= 0) {
    return events;
  }
  return events.slice(0, limit);
};

export interface DecodedEventBatch {
  readonly events: readonly ContestEventEnvelopeShape[];
  readonly nextCursor: EventCursorShape;
  readonly latestBlock: BlockAnchorShape;
}

export const decodeContestEventBatch = (
  events: readonly ContestEventEnvelopeShape[],
  options: EventDecodingOptions,
): DecodedEventBatch => {
  const sorted = [...events].sort(compareEvents);

  const filtered = sorted.filter(
    (event) =>
      isAfterCursor(event, options.cursor) &&
      withinFromBlock(event, options.fromBlock) &&
      withinToBlock(event, options.toBlock),
  );

  const limited = applyLimit(filtered, options.limit);

  const lastEvent = limited.length > 0 ? limited[limited.length - 1] : undefined;

  const nextCursor = lastEvent
    ? lastEvent.cursor
    : options.cursor ?? options.fallbackCursor;

  const latestBlock = lastEvent ? lastEvent.derivedAt : options.fallbackBlock;

  return Object.freeze({
    events: Object.freeze(limited),
    nextCursor,
    latestBlock,
  });
};
