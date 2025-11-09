import { z, type ZodType } from 'zod';
import type { ValidationContextOptions } from '@chaincontest/shared-schemas';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

const walletSourceValues = ['manual', 'auto_inferred', 'imported'] as const;
const supportedChainIds = [1, 5, 10, 11155111, 42161, 31337] as const;
const contestStatusValues = ['registered', 'active', 'sealed', 'settled'] as const;
const contestOriginValues = ['factory', 'imported'] as const;

const toMutableEnumValues = <T extends readonly string[]>(values: T): [T[number], ...T[number][]] =>
  values as unknown as [T[number], ...T[number][]];

type DbValidationRegistryEntry = {
  readonly typeKey: string;
  readonly kind: 'atomic' | 'composite';
  readonly dependencies: readonly string[];
  readonly rule: {
    readonly description: string;
    readonly failureMessage: string;
    readonly schema?: ZodType<unknown>;
    readonly composite?: (context: unknown) => void;
    readonly parameters?: Record<string, unknown>;
  };
  readonly metadata?: Record<string, unknown>;
};

type DbValidationRegistry = readonly DbValidationRegistryEntry[];

const actorContextSchema = z
  .object({
    actorId: z.string().min(1).optional(),
    source: z.enum(toMutableEnumValues(walletSourceValues)).optional(),
    reason: z.string().optional()
  })
  .catchall(z.unknown());

const paginationSchema = z
  .object({
    pageSize: z.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).optional().nullable()
  })
  .optional();

const contestItemSelectorSchema = z
  .object({
    contestId: z.string().uuid().optional(),
    internalId: z.string().min(1).optional(),
    chainId: z.number().int().optional(),
    contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
  })
  .refine(
    (value) =>
      Boolean(value.contestId) ||
      Boolean(value.internalId) ||
      (value.chainId && value.contractAddress),
    {
      message: 'Contest selector must provide contestId, internalId, or chainId + contractAddress'
    }
  )
  .refine((value) =>
    !value.chainId || supportedChainIds.includes(value.chainId as (typeof supportedChainIds)[number])
  , {
    message: 'Unsupported chain id in selector'
  });

const contestFilterSchema = z
  .object({
    chainIds: z
      .array(z.number().int().refine((id) => supportedChainIds.includes(id as (typeof supportedChainIds)[number]), {
        message: 'Unsupported chain id in filter'
      }))
      .nonempty()
      .optional(),
    statuses: z.array(z.string().min(1)).optional(),
    timeRange: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1)
      })
      .optional(),
    keyword: z.string().min(1).optional()
  })
  .optional();

const contestIncludesSchema = z
  .object({
    participants: z.boolean().optional(),
    leaderboard: z
      .union([
        z.object({ mode: z.literal('latest') }),
        z.object({ mode: z.literal('version'), version: z.union([z.string(), z.number(), z.bigint()]) })
      ])
      .optional(),
    rewards: z.boolean().optional(),
    creatorSummary: z.boolean().optional()
  })
  .optional();

const contestSelectorSchema = z
  .object({
    items: z.array(contestItemSelectorSchema).optional(),
    filter: contestFilterSchema
  })
  .refine((value) => (value.items && value.items.length > 0) || value.filter, {
    message: 'Contest selector requires items or filter'
  });

const userContestFilterSchema = z
  .object({
    chainIds: z
      .array(z.number().int().refine((id) => supportedChainIds.includes(id as (typeof supportedChainIds)[number])))
      .optional(),
    statuses: z.array(z.string().min(1)).optional(),
    timeRange: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1)
      })
      .optional(),
    contestIds: z.array(z.string().uuid()).optional()
  })
  .optional();

const contestQueryRequestSchema = z.object({
  selector: contestSelectorSchema,
  includes: contestIncludesSchema,
  pagination: paginationSchema
});

const userContestQueryRequestSchema = z.object({
  userId: z.string().min(1),
  filters: userContestFilterSchema,
  pagination: paginationSchema
});

const numericLikeSchema = z.union([
  z.number().int().nonnegative(),
  z.bigint().refine((value) => value >= 0n, { message: 'Must be a non-negative bigint' }),
  z.string().regex(/^\d+$/)
]);

const contestDomainWriteSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('track'),
    payload: z.object({
      chainId: z.number().int().positive(),
      contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      internalKey: z.string().min(1).optional().nullable(),
      status: z.enum(toMutableEnumValues(contestStatusValues)).optional(),
      originTag: z.enum(toMutableEnumValues(contestOriginValues)).optional(),
      timeWindow: z.object({
        start: z.string().min(1),
        end: z.string().min(1)
      }),
      metadata: z.record(z.string(), z.unknown()).optional()
    }),
    actorContext: actorContextSchema.optional()
  }),
  z.object({
    action: z.literal('ingest_snapshot'),
    payload: z.object({
      contestId: z.string().uuid(),
      cursorHeight: numericLikeSchema,
      payload: z.unknown().optional(),
      effectiveAt: z.string().min(1)
    }),
    actorContext: actorContextSchema.optional()
  }),
  z.object({
    action: z.literal('register_participation'),
    payload: z.object({
      contestId: z.string().uuid(),
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      vaultReference: z.string().optional().nullable(),
      amountWei: numericLikeSchema,
      occurredAt: z.string().min(1),
      event: z.object({
        chainId: z.number().int().positive(),
        txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
        logIndex: z.number().int().nonnegative()
      })
    }),
    actorContext: actorContextSchema.optional()
  }),
  z.object({
    action: z.literal('write_leaders_version'),
    payload: z.object({
      contestId: z.string().uuid(),
      version: numericLikeSchema,
      writtenAt: z.string().min(1),
      entries: z
        .array(
          z.object({
            rank: z.number().int().positive(),
            walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
            score: z.union([z.string(), z.number(), z.bigint()]).optional()
          })
        )
        .nonempty()
    }),
    actorContext: actorContextSchema.optional()
  }),
  z.object({
    action: z.literal('seal'),
    payload: z.object({
      contestId: z.string().uuid(),
      sealedAt: z.string().min(1),
      status: z.enum(['sealed', 'settled'] as const).optional()
    }),
    actorContext: actorContextSchema.optional()
  }),
  z.object({
    action: z.literal('update_phase'),
    payload: z.object({
      contestId: z.string().uuid(),
      phase: z.string().min(1),
      status: z.enum(toMutableEnumValues(contestStatusValues)).optional(),
      sealedAt: z.string().min(1).optional(),
      settlement: z.record(z.string(), z.unknown()).optional()
    }),
    actorContext: actorContextSchema.optional()
  }),
  z.object({
    action: z.literal('update_participant'),
    payload: z.object({
      contestId: z.string().uuid(),
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      updates: z.record(z.string(), z.unknown())
    }),
    actorContext: actorContextSchema.optional()
  }),
  z.object({
    action: z.literal('append_reward_claim'),
    payload: z.object({
      contestId: z.string().uuid(),
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      amountWei: numericLikeSchema,
      claimedAt: z.string().min(1),
      event: z.object({
        chainId: z.number().int().positive(),
        txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
        logIndex: z.number().int().nonnegative()
      })
    }),
    actorContext: actorContextSchema.optional()
  })
]);

const ingestionStatusSchema = z
  .object({
    contestId: z.string().uuid().optional(),
    chainId: z.number().int().positive().optional(),
    contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
  })
  .refine((value) => Boolean(value.contestId) || (value.chainId && value.contractAddress), {
    message: 'Must provide contestId or chainId + contractAddress'
  });

const ingestionEventSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('advance_cursor'),
    payload: z.object({
      contestId: z.string().uuid().optional(),
      chainId: z.number().int().positive(),
      contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      cursorHeight: numericLikeSchema,
      cursorLogIndex: z.number().int().nonnegative().optional(),
      cursorHash: z.string().optional().nullable()
    }),
    actorContext: actorContextSchema.optional()
  }),
  z.object({
    action: z.literal('record_event'),
    payload: z.object({
      contestId: z.string().uuid(),
      chainId: z.number().int().positive(),
      txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      logIndex: z.number().int().nonnegative(),
      eventType: z.string().min(1),
      occurredAt: z.string().min(1)
    }),
    actorContext: actorContextSchema.optional()
  })
]);

const userWalletLookupSchema = z.object({
  userId: z.string(),
  walletAddress: z.string()
});

const userWalletMutationSchema = z.object({
  action: z.enum(['bind', 'unbind'] as const),
  userId: z.string().min(1),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  actorContext: actorContextSchema.optional()
});

const registry = [
  {
    typeKey: 'db-user-wallet-lookup-request',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'User wallet lookup request',
      failureMessage: 'Invalid wallet lookup request',
      schema: userWalletLookupSchema as ZodType<unknown>
    }
  },
  {
    typeKey: 'db-user-wallet-mutation-request',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'User wallet mutation request',
      failureMessage: 'Invalid wallet mutation request',
      schema: userWalletMutationSchema as ZodType<unknown>
    }
  },
  {
    typeKey: 'db-contest-query-request',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'Contest aggregation query request',
      failureMessage: 'Invalid contest query request',
      schema: contestQueryRequestSchema as ZodType<unknown>
    }
  },
  {
    typeKey: 'db-user-contest-query-request',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'User contest aggregation request',
      failureMessage: 'Invalid user contest query request',
      schema: userContestQueryRequestSchema as ZodType<unknown>
    }
  },
  {
    typeKey: 'db-contest-domain-write-request',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'Contest domain mutation request',
      failureMessage: 'Invalid contest domain write request',
      schema: contestDomainWriteSchema as ZodType<unknown>
    }
  },
  {
    typeKey: 'db-ingestion-status-request',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'Ingestion status query request',
      failureMessage: 'Invalid ingestion status request',
      schema: ingestionStatusSchema as ZodType<unknown>
    }
  },
  {
    typeKey: 'db-ingestion-event-request',
    kind: 'atomic',
    dependencies: [],
    rule: {
      description: 'Ingestion event mutation request',
      failureMessage: 'Invalid ingestion event request',
      schema: ingestionEventSchema as ZodType<unknown>
    }
  }
] satisfies DbValidationRegistry;

export interface BuildValidatorOptionsParams {
  environmentId?: string;
}

export interface ValidatorRegistrationOptions {
  registry: DbValidationRegistry;
  overrides?: ValidationContextOptions['environmentOverrides'];
  environmentId?: string;
}

export const buildDbValidatorOptions = (
  params: BuildValidatorOptionsParams = {}
): ValidatorRegistrationOptions => {
  const options = {
    registry,
    environmentId: params.environmentId ?? 'default'
  } satisfies ValidatorRegistrationOptions;

  return options;
};
