import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  init,
  shutdown,
  registerOrganizerContract,
  listOrganizerContracts,
  createContestCreationRequest,
  recordContestDeploymentArtifact,
  getContestCreationRequest,
  listContestCreationRequests,
  queryCreatorContests,
  type OrganizerContractRecord,
  type ContestCreationRequestRecord,
  type ContestDeploymentArtifactRecord,
  type ListContestCreationRequestsResponse,
  type QueryCreatorContestsResponse
} from '../../src/index.js';
import { createDatabaseFixture, type TestDatabaseFixture, resetAllFixtures } from '../fixtures/database.js';
import { buildTestValidators } from '../helpers/validators.js';
import { contests } from '../../src/schema/index.js';

let fixture: TestDatabaseFixture;

describe('contest creation persistence', () => {
  beforeAll(async () => {
    fixture = await createDatabaseFixture();
    await init({
      databaseUrl: fixture.connectionString,
      validators: buildTestValidators()
    });
  });

  afterAll(async () => {
    await shutdown();
    await fixture.cleanup();
  });

  beforeEach(async () => {
    await resetAllFixtures();
  });

  it('registers and lists organizer contracts per user + network + type', async () => {
    const first = await registerOrganizerContract({
      userId: 'user-1',
      networkId: 11155111,
      contractType: 'factory',
      address: '0x00000000000000000000000000000000000000f1',
      metadata: { version: '1.0.0' }
    });

    expect(first.created).toBe(true);
    expect(first.contract.address).toBe('0x00000000000000000000000000000000000000f1');

    const second = await registerOrganizerContract({
      userId: 'user-1',
      networkId: 11155111,
      contractType: 'factory',
      address: '0x00000000000000000000000000000000000000f2',
      metadata: { version: '1.1.0' }
    });

    expect(second.created).toBe(false);
    expect(second.contract.address).toBe('0x00000000000000000000000000000000000000f2');
    expect(second.contract.metadata).toMatchObject({ version: '1.1.0' });

    const registry: OrganizerContractRecord[] = await listOrganizerContracts({
      userId: 'user-1',
      networkId: 11155111
    });

    expect(registry).toHaveLength(1);
    expect(registry[0]?.contractType).toBe('factory');
    expect(registry[0]?.address).toBe('0x00000000000000000000000000000000000000f2');
  });

  it('creates creation requests, attaches deployment artifacts and retrieves aggregates', async () => {
    const creation = await createContestCreationRequest({
      userId: 'user-2',
      networkId: 10,
      payload: { name: 'Velocity Cup', rounds: 4 }
    });

    expect(creation.request.requestId).toBeDefined();
    expect(creation.request.payload).toMatchObject({ name: 'Velocity Cup' });

    const artifact = await recordContestDeploymentArtifact({
      requestId: creation.request.requestId,
      networkId: 10,
      registrarAddress: '0x00000000000000000000000000000000000000aa',
      treasuryAddress: '0x00000000000000000000000000000000000000bb',
      settlementAddress: '0x00000000000000000000000000000000000000cc',
      rewardsAddress: '0x00000000000000000000000000000000000000dd',
      metadata: { txHash: '0xdeadbeef' }
    });

    expect(artifact.requestId).toBe(creation.request.requestId);
    expect(artifact.metadata).toMatchObject({ txHash: '0xdeadbeef' });

    const aggregate = await getContestCreationRequest(creation.request.requestId);
    expect(aggregate?.request.requestId).toBe(creation.request.requestId);
    expect(aggregate?.artifact?.registrarAddress).toBe('0x00000000000000000000000000000000000000aa');
  });

  it('lists creation requests with pagination order newest-first', async () => {
    for (let index = 0; index < 3; index += 1) {
      await createContestCreationRequest({
        userId: 'creator-1',
        networkId: 11155111,
        payload: { index }
      });
    }

    const firstPage: ListContestCreationRequestsResponse = await listContestCreationRequests({
      userId: 'creator-1',
      pagination: { pageSize: 2 }
    });

    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await listContestCreationRequests({
      userId: 'creator-1',
      pagination: { cursor: firstPage.nextCursor }
    });

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('queries creator contests combining requests, artifacts and live contests', async () => {
    const requestA = await createContestCreationRequest({
      userId: 'creator-2',
      networkId: 1,
      payload: { slug: 'alpha' }
    });

    const requestB = await createContestCreationRequest({
      userId: 'creator-2',
      networkId: 5,
      payload: { slug: 'beta' }
    });

    const contestId = randomUUID();
    await fixture.db.insert(contests).values({
      id: contestId,
      chainId: 5,
      contractAddress: '0x0000000000000000000000000000000000000aaa',
      internalKey: null,
      status: 'registered',
      timeWindowStart: new Date('2025-10-01T00:00:00Z'),
      timeWindowEnd: new Date('2025-10-10T00:00:00Z'),
      originTag: 'factory',
      metadata: { keywords: 'beta' },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await recordContestDeploymentArtifact({
      requestId: requestB.request.requestId,
      networkId: 5,
      contestId,
      registrarAddress: '0x0000000000000000000000000000000000000a01',
      treasuryAddress: '0x0000000000000000000000000000000000000a02',
      settlementAddress: null,
      rewardsAddress: null,
      metadata: { txHash: '0xbeef' }
    });

    const response: QueryCreatorContestsResponse = await queryCreatorContests({
      userId: 'creator-2'
    });

    expect(response.items).toHaveLength(2);
    const deployed = response.items.find((item) => item.request.requestId === requestB.request.requestId);
    expect(deployed?.status).toBe('deployed');
    expect(deployed?.contest?.contestId).toBe(contestId);
    const pending = response.items.find((item) => item.request.requestId === requestA.request.requestId);
    expect(pending?.status).toBe('accepted');
    expect(pending?.artifact).toBeNull();
  });
});
