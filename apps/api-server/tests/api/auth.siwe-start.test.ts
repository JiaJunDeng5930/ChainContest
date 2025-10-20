import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest, getCookieValue } from '../utils/request';

const START_PATH = '/api/auth/siwe/start';

describe('POST /api/auth/siwe/start', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
    vi.doMock('pg', () => {
      class MockPool {
        query = vi.fn().mockResolvedValue({ rows: [] });
        end = vi.fn().mockResolvedValue(undefined);
      }

      return { Pool: MockPool };
    });
  });

  it('返回 nonce 与过期时间并设置安全 cookie', async () => {
    const { POST, siweNonceCookie } = await import('../../app/api/auth/siwe/start/route');

    const request = createRouteRequest(START_PATH, {
      body: {
        address: '0x0000000000000000000000000000000000000001',
        chainId: 1
      }
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { nonce: string; expiresAt: string };
    expect(payload.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(new Date(payload.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(`${siweNonceCookie}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('缺少 address 时返回 400', async () => {
    const { POST } = await import('../../app/api/auth/siwe/start/route');

    const request = createRouteRequest(START_PATH, {
      body: {
        chainId: 1
      }
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe('validation_failed');
  });

  it('重复请求时沿用新的 nonce', async () => {
    const { POST, siweNonceCookie } = await import('../../app/api/auth/siwe/start/route');

    const firstResponse = await POST(
      createRouteRequest(START_PATH, {
        body: {
          address: '0x0000000000000000000000000000000000000001',
          chainId: 1
        }
      })
    );

    const firstCookie = getCookieValue(firstResponse.headers.get('set-cookie'), siweNonceCookie);
    expect(firstCookie).toBeDefined();

    const secondResponse = await POST(
      createRouteRequest(START_PATH, {
        body: {
          address: '0x0000000000000000000000000000000000000001',
          chainId: 1
        }
      })
    );

    const secondCookie = getCookieValue(secondResponse.headers.get('set-cookie'), siweNonceCookie);
    expect(secondCookie).toBeDefined();
    expect(secondCookie).not.toBe(firstCookie);
  });
});
