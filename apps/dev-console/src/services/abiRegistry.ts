import { Interface, type JsonFragment } from "ethers";
import { z } from "zod";

import type { ContractDescriptor } from "../lib/types";

const abiSchema = z
  .array(
    z
      .object({
        type: z.string().min(1),
      })
      .passthrough(),
  )
  .min(1);

export class AbiRegistryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AbiRegistryError";
  }
}

export class AbiValidationError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(message: string, issues: z.ZodIssue[]) {
    super(message);
    this.name = "AbiValidationError";
    this.issues = issues;
  }
}

export interface AbiRegistryEntry {
  descriptor: ContractDescriptor;
  fragments: JsonFragment[];
  iface: Interface;
  loadedAt: Date;
}

export interface AbiRegistryOptions {
  request?: typeof fetch;
}

async function fetchAbiViaPath(
  descriptor: ContractDescriptor,
  request: typeof fetch,
): Promise<JsonFragment[] | null> {
  const resolvedPath = descriptor.abiPath.trim();

  try {
    const response = await request(resolvedPath, {
      credentials: "same-origin",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const parsed = abiSchema.safeParse(payload);

    if (!parsed.success) {
      throw new AbiValidationError(
        `ABI at ${resolvedPath} is invalid`,
        parsed.error.issues,
      );
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof AbiValidationError) {
      throw error;
    }

    return null;
  }
}

async function fetchAbiViaApi(
  descriptor: ContractDescriptor,
  request: typeof fetch,
): Promise<JsonFragment[]> {
  let response: Response;

  try {
    response = await request(`/api/contracts/${descriptor.id}/abi`, {
      credentials: "same-origin",
    });
  } catch (error) {
    throw new AbiRegistryError(
      `Failed to fetch ABI for ${descriptor.id} from runtime API`,
      error instanceof Error ? { cause: error } : undefined,
    );
  }

  if (!response.ok) {
    throw new AbiRegistryError(
      `Runtime API responded with status ${response.status} for contract ${descriptor.id}`,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    throw new AbiRegistryError(
      `Runtime API returned non-JSON payload for contract ${descriptor.id}`,
      error instanceof Error ? { cause: error } : undefined,
    );
  }

  const parsed = abiSchema.safeParse(payload);

  if (!parsed.success) {
    throw new AbiValidationError(
      `Runtime ABI for ${descriptor.id} is invalid`,
      parsed.error.issues,
    );
  }

  return parsed.data;
}

async function loadAbi(
  descriptor: ContractDescriptor,
  request: typeof fetch,
): Promise<JsonFragment[]> {
  if (descriptor.abiPath.startsWith("inline:")) {
    return fetchAbiViaApi(descriptor, request);
  }

  const viaPath = await fetchAbiViaPath(descriptor, request);

  if (viaPath) {
    return viaPath;
  }

  return fetchAbiViaApi(descriptor, request);
}

export class AbiRegistry {
  private readonly cache = new Map<string, AbiRegistryEntry>();
  private readonly request: typeof fetch;

  constructor(options: AbiRegistryOptions = {}) {
    this.request = options.request ?? fetch;
  }

  clear(contractId?: string): void {
    if (!contractId) {
      this.cache.clear();
      return;
    }

    this.cache.delete(contractId);
  }

  getCached(contractId: string): AbiRegistryEntry | null {
    return this.cache.get(contractId) ?? null;
  }

  async getInterface(
    descriptor: ContractDescriptor,
  ): Promise<AbiRegistryEntry> {
    const cached = this.cache.get(descriptor.id);

    if (cached && cached.descriptor.abiPath === descriptor.abiPath) {
      return cached;
    }

    const fragments = await loadAbi(descriptor, this.request);
    let iface: Interface;

    try {
      iface = new Interface(fragments);
    } catch (error) {
      throw new AbiRegistryError(
        `Unable to construct Interface for ${descriptor.id}`,
        error instanceof Error ? { cause: error } : undefined,
      );
    }

    const entry: AbiRegistryEntry = {
      descriptor,
      fragments,
      iface,
      loadedAt: new Date(),
    };

    this.cache.set(descriptor.id, entry);

    return entry;
  }
}

export function createAbiRegistry(
  options: AbiRegistryOptions = {},
): AbiRegistry {
  return new AbiRegistry(options);
}
