import { expect, test } from "@playwright/test";

const WALLET_CHECKSUM = "0x1234567890ABCDEF1234567890ABCDEF12345678";
const WALLET_ADDRESS = WALLET_CHECKSUM.toLowerCase();
const SHORT_ADDRESS = "0x1234…5678";

test.describe("SIWE login flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ address, chainIdHex }) => {
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

      const emit = (event: string, payload: unknown) => {
        const subs = listeners.get(event);
        if (!subs) {
          return;
        }
        for (const handler of subs) {
          handler(payload);
        }
      };

      const ethereum = {
        isMetaMask: true,
        selectedAddress: address,
        chainId: chainIdHex,
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case "eth_chainId":
              return ethereum.chainId;
            case "eth_requestAccounts":
            case "eth_accounts":
              ethereum.selectedAddress = address;
              return [address];
            case "wallet_switchEthereumChain": {
              const targetChain = (params?.[0] as { chainId?: string } | undefined)?.chainId ?? chainIdHex;
              ethereum.chainId = targetChain;
              emit("chainChanged", targetChain);
              return null;
            }
            case "wallet_addEthereumChain":
              return null;
            case "personal_sign":
            case "eth_sign":
              return `0x${"1".repeat(130)}`;
            default:
              return null;
          }
        },
        on: (event: string, handler: (...args: unknown[]) => void) => {
          const existing = listeners.get(event) ?? new Set();
          existing.add(handler);
          listeners.set(event, existing);
        },
        removeListener: (event: string, handler: (...args: unknown[]) => void) => {
          const subs = listeners.get(event);
          subs?.delete(handler);
        }
      };

      Object.defineProperty(window, "ethereum", {
        value: ethereum,
        configurable: true,
        writable: false
      });

      window.dispatchEvent(new Event("ethereum#initialized"));
    }, {
      address: WALLET_CHECKSUM,
      chainIdHex: "0x1"
    });
  });

  test("connect, verify SIWE and logout", async ({ page }) => {
    let sessionState: "unauthenticated" | "authenticated" = "unauthenticated";
    let verifyCalled = false;
    let logoutCalled = false;

    const sessionPayload = {
      walletAddress: WALLET_ADDRESS,
      addressChecksum: WALLET_CHECKSUM,
      needsRefresh: false,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    };

    await page.route("**/api/runtime/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chainId: 1,
          rpcUrl: "http://localhost:8545",
          devPort: 3000,
          defaultAccount: WALLET_ADDRESS,
          contracts: []
        })
      });
    });

    await page.route("**/api/auth/session", async (route) => {
      if (sessionState === "authenticated") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(sessionPayload)
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ code: "SESSION_EXPIRED" })
        });
      }
    });

    await page.route("**/api/auth/siwe/start", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          nonce: "nonce123",
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        })
      });
    });

    await page.route("**/api/auth/siwe/verify", async (route) => {
      verifyCalled = true;
      sessionState = "authenticated";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          user: {
            walletAddress: WALLET_ADDRESS,
            addressChecksum: WALLET_CHECKSUM
          }
        })
      });
    });

    await page.route("**/api/auth/logout", async (route) => {
      logoutCalled = true;
      sessionState = "unauthenticated";
      await route.fulfill({
        status: 204
      });
    });

    await page.goto("/");

    const connectButton = page.getByRole("button", { name: /connect wallet/i });
    await expect(connectButton).toBeVisible();
    await expect(page.getByText("Please sign in to continue.")).toBeVisible();

    await connectButton.click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    await page.getByRole("button", { name: /MetaMask/i }).click();

    const disconnectButton = page.getByRole("button", { name: /disconnect/i });
    await expect(disconnectButton).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Session active")).toBeVisible();
    await expect(page.getByText(SHORT_ADDRESS)).toBeVisible();
    expect(verifyCalled).toBeTruthy();

    await disconnectButton.click();
    await expect(page.getByRole("button", { name: /connect wallet/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Please sign in to continue.")).toBeVisible();
    expect(logoutCalled).toBeTruthy();
  });
});

