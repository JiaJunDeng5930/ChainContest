import { z } from 'zod';
import { httpErrors } from '@/lib/http/errors';
import { database } from '@/lib/db/client';
import type { OrganizerComponentRecord, OrganizerComponentStatus } from '@chaincontest/db';

const statusEnum = z.enum(['pending', 'confirmed', 'failed']);

const querySchema = z.object({
  userId: z.string().min(1),
  networkId: z.number().int().positive().optional(),
  componentType: z.enum(['vault_implementation', 'price_source']).optional(),
  statuses: z.array(statusEnum).optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  cursor: z.string().optional()
});

export interface ListOrganizerComponentsInput {
  userId: string;
  networkId?: number;
  componentType?: 'vault_implementation' | 'price_source';
  statuses?: OrganizerComponentStatus[];
  pageSize?: number;
  cursor?: string | null;
}

export interface ListOrganizerComponentsOutput {
  items: OrganizerComponentRecord[];
  nextCursor: string | null;
}

export const listOrganizerComponents = async (
  input: ListOrganizerComponentsInput
): Promise<ListOrganizerComponentsOutput> => {
  const parsed = querySchema.safeParse({
    userId: input.userId,
    networkId: input.networkId,
    componentType: input.componentType,
    statuses: input.statuses,
    pageSize: input.pageSize,
    cursor: input.cursor ?? undefined
  });

  if (!parsed.success) {
    throw httpErrors.validationFailed('Invalid component listing parameters', {
      detail: parsed.error.flatten().fieldErrors
    });
  }

  const request = parsed.data;
  const response = await database.listOrganizerComponents({
    userId: request.userId,
    networkId: request.networkId,
    componentType: request.componentType,
    statuses: request.statuses,
    pagination: {
      pageSize: request.pageSize,
      cursor: request.cursor ?? null
    }
  });

  return response;
};
