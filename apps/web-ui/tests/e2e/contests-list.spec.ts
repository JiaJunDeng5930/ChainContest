import { expect, test } from "@playwright/test";

const CONTEST_ID = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const TRUNCATED_CONTEST_ID = "0xabcd…abcd";

const CONTEST_RESPONSE = {
  contestId: CONTEST_ID,
  chainId: 11155111,
  phase: "registration",
  timeline: {
    registrationOpensAt: "2025-10-24T12:00:00.000Z",
    registrationClosesAt: "2025-10-30T12:00:00.000Z"
  },
  prizePool: {
    currentBalance: "10500000000000000000",
    accumulatedInflow: "2500000000000000000",
    valuationAnchor: {
      price: "1234.56",
      currency: "USD",
      observedAt: "2025-10-24T15:30:00.000Z"
    }
  },
  registrationCapacity: {
    registered: 150,
    maximum: 200,
    isFull: true
  },
  leaderboard: {
    version: "42",
    entries: [
      {
        rank: 1,
        walletAddress: "0x1111111111111111111111111111111111111111",
        score: "98.50"
      },
      {
        rank: 2,
        walletAddress: "0x2222222222222222222222222222222222222222",
        score: "92.10"
      }
    ]
  },
  derivedAt: {
    blockNumber: 123456,
    blockHash: "0x5555555555555555555555555555555555555555555555555555555555555555",
    timestamp: "2025-10-24T16:45:00.000Z"
  }
};

test.describe("Contest list to detail journey", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/runtime/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chainId: 11155111,
          rpcUrl: "http://localhost:8545",
          devPort: 3000,
          contracts: []
        })
      });
    });

    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          walletAddress: "0x9999999999999999999999999999999999999999",
          addressChecksum: "0x9999999999999999999999999999999999999999",
          needsRefresh: false,
          expiresAt: "2025-12-31T23:59:59.000Z"
        })
      });
    });

    await page.route(`**/api/contests/${CONTEST_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(CONTEST_RESPONSE)
      });
    });

    await page.route(/\/api\/contests(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [CONTEST_RESPONSE],
          nextCursor: null
        })
      });
    });
  });

  test("navigates from contests list to detail page", async ({ page }) => {
    await page.goto("/contests");

    const contestCard = page.locator("article").filter({ hasText: TRUNCATED_CONTEST_ID }).first();
    await expect(contestCard).toBeVisible();
    await expect(contestCard.getByText("Sepolia")).toBeVisible();
    await expect(contestCard.getByText("10.5 ETH")).toBeVisible();
    await expect(contestCard.getByText("150 / 200")).toBeVisible();

    await contestCard.getByRole("link", { name: /view details/i }).click();
    await page.waitForURL(`/contests/${CONTEST_ID}`);

    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText("Registration capacity reached")).toBeVisible();
    await expect(page.getByText(/Anchored on block #123456/)).toBeVisible();
    await expect(page.getByText(/Valuation anchor 1234\.56 USD/)).toBeVisible();
    await expect(page.getByText("#1 · 0x1111…1111")).toBeVisible();
    await expect(page.getByText("#2 · 0x2222…2222")).toBeVisible();
  });
});
