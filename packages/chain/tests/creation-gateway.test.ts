import { describe, expect, it } from 'vitest';
import { createContestCreationGateway } from '../src/gateway/creationGateway';

const gateway = createContestCreationGateway({
  clock: () => new Date('2025-10-24T00:00:00.000Z')
});

describe('contest creation gateway', () => {
  it('registers organizer contracts deterministically', async () => {
    const result = await gateway.registerOrganizerContract({
      organizer: '0x000000000000000000000000000000000000dEaD',
      networkId: 11155111,
      contractType: 'factory',
      metadata: { version: '1.0.0' }
    });

    expect(result.status).toBe('registered');
    expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.metadata?.checksum).toHaveLength(64);
  });

  it('accepts contest deployment and emits artifact summary', async () => {
    const receipt = await gateway.executeContestDeployment({
      organizer: '0x000000000000000000000000000000000000dEaD',
      networkId: 10,
      payload: { name: 'Velocity Cup', rounds: 4 }
    });

    expect(receipt.status).toBe('accepted');
    expect(receipt.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(receipt.artifact?.registrarAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(receipt.artifact?.metadata?.payloadDigest).toHaveLength(64);
    expect(receipt.acceptedAt).toBe('2025-10-24T00:00:00.000Z');
  });

  it('uses system clock when none provided', async () => {
    const gw = createContestCreationGateway();

    const receipt = await gw.executeContestDeployment({
      organizer: '0x000000000000000000000000000000000000dEaD',
      networkId: 5,
      payload: { name: 'Default Clock' }
    });

    expect(receipt.acceptedAt).toMatch(/Z$/);
    expect(receipt.artifact?.registrarAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
