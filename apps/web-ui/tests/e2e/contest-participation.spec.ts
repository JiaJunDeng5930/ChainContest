import { expect, test } from "@playwright/test";

const WALLET_CHECKSUM = "0x1234567890ABCDEF1234567890ABCDEF12345678";
const WALLET_ADDRESS = WALLET_CHECKSUM.toLowerCase();
const SHORT_ADDRESS = "0x1234…5678";

const CONTEST_ID = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const TRUNCATED_CONTEST_ID = "0xabcd…abcd";

type ContestPhase = "registration" | "active" | "settled";

type ParticipationHistoryState = {
  contestPhase: ContestPhase;
  participations: Array<{
    contestId: string;
    walletAddress: string;
    amount: string;
    occurredAt: string;
  }>;
  rewardClaims: Array<{
    contestId: string;
    walletAddress: string;
    amount: string;
    claimedAt: string;
  }>;
  lastActivity: string | null;
};

test.describe("Contest participation journey", () => {
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
      chainIdHex: "0xaa36a7" // 11155111 in hex
    });

    let sessionState: "unauthenticated" | "authenticated" = "unauthenticated";
    let contestPhase: ContestPhase = "registration";
    let detailVersion = 0;

    const historyState: ParticipationHistoryState = {
      contestPhase,
      participations: [],
      rewardClaims: [],
      lastActivity: null
    };

    let currentTimestamp = new Date("2025-10-24T15:00:00.000Z").getTime();
    const advanceTime = (seconds: number) => {
      currentTimestamp += seconds * 1000;
      return new Date(currentTimestamp).toISOString();
    };

    const buildContestSnapshot = () => {
      const derivedAt = advanceTime(15);
      return {
        contestId: CONTEST_ID,
        chainId: 11155111,
        phase: contestPhase,
        timeline: {
          registrationOpensAt: "2025-10-20T12:00:00.000Z",
          registrationClosesAt: "2025-10-28T12:00:00.000Z"
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
          registered: contestPhase === "registration" ? 150 : 151,
          maximum: 220,
          isFull: false
        },
        leaderboard: {
          version: String(detailVersion + 1),
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
          blockNumber: 123456 + detailVersion,
          blockHash: "0x5555555555555555555555555555555555555555555555555555555555555555",
          timestamp: derivedAt
        }
      };
    };

    const buildAnchor = (blockOffset: number) => ({
      blockNumber: 130000 + blockOffset,
      blockHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
      timestamp: advanceTime(20)
    });

    const updateHistoryContestPhase = () => {
      historyState.contestPhase = contestPhase;
    };

    await page.route("**/api/runtime/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chainId: 11155111,
          rpcUrl: "http://localhost:8545",
          devPort: 3000,
          defaultAccount: WALLET_ADDRESS,
          contracts: [
            {
              id: "contest-factory",
              name: "Contest Factory",
              address: "0x9999999999999999999999999999999999999999",
              abiPath: "/contracts/ContestFactory.json",
              tags: ["factory"]
            }
          ]
        })
      });
    });

    await page.route("**/api/auth/session", async (route) => {
      if (sessionState === "authenticated") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            walletAddress: WALLET_ADDRESS,
            addressChecksum: WALLET_CHECKSUM,
            needsRefresh: false,
            expiresAt: advanceTime(300)
          })
        });
        return;
      }

      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: "SESSION_EXPIRED" })
      });
    });

    await page.route("**/api/auth/siwe/start", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          nonce: "nonce-participation",
          expiresAt: advanceTime(120)
        })
      });
    });

    await page.route("**/api/auth/siwe/verify", async (route) => {
      sessionState = "authenticated";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok"
        })
      });
    });

    await page.route("**/api/auth/logout", async (route) => {
      sessionState = "unauthenticated";
      await route.fulfill({
        status: 204
      });
    });

    await page.route(`**/api/contests/${CONTEST_ID}`, async (route) => {
      detailVersion += 1;
      updateHistoryContestPhase();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildContestSnapshot())
      });
    });

    await page.route(`**/api/contests/${CONTEST_ID}/registration-plan`, async (route) => {
      historyState.lastActivity = advanceTime(30);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ready",
          checks: [
            {
              rule: "capacity",
              passed: true,
              message: "Contest capacity available",
              severity: "info"
            },
            {
              rule: "network",
              passed: true,
              message: "Wallet on supported network",
              severity: "info"
            }
          ],
          requiredApprovals: [
            {
              tokenAddress: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
              spender: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
              amount: "2500000000000000000",
              symbol: "ETH",
              reason: "Registration vault allowance"
            }
          ],
          transaction: {
            to: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
            data: `0x${"a1".repeat(32)}`,
            value: "0"
          },
          estimatedFees: {
            currency: "ETH",
            estimatedCost: "0.0021"
          },
          rejectionReason: null,
          derivedAt: buildAnchor(1)
        })
      });
    });

    await page.route(`**/api/contests/${CONTEST_ID}/execute/register`, async (route) => {
      contestPhase = "active";
      const occurredAt = advanceTime(45);
      historyState.participations.push({
        contestId: CONTEST_ID,
        walletAddress: WALLET_ADDRESS,
        amount: "2.50 ETH",
        occurredAt
      });
      historyState.lastActivity = occurredAt;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "executed",
          transaction: {
            to: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
            data: `0x${"b2".repeat(32)}`,
            value: "0"
          },
          requiredApprovals: [],
          reason: {
            message: "Submitted to mempool"
          },
          derivedAt: buildAnchor(2)
        })
      });
    });

    await page.route(`**/api/contests/${CONTEST_ID}/rebalance-plan`, async (route) => {
      historyState.lastActivity = advanceTime(40);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "pending",
          checks: [
            {
              rule: "liquidity",
              passed: true,
              message: "Sufficient pool liquidity",
              severity: "info"
            }
          ],
          transaction: {
            to: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
            data: `0x${"c3".repeat(32)}`,
            value: "0"
          },
          rollbackAdvice: null,
          rejectionReason: null,
          derivedAt: buildAnchor(3)
        })
      });
    });

    await page.route(`**/api/contests/${CONTEST_ID}/execute/rebalance`, async (route) => {
      historyState.lastActivity = advanceTime(20);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "executed",
          transaction: {
            to: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
            data: `0x${"d4".repeat(32)}`,
            value: "0"
          },
          rollbackAdvice: {
            note: "Monitor vault delta for next epoch"
          },
          reason: null,
          derivedAt: buildAnchor(4)
        })
      });
    });

    await page.route(`**/api/contests/${CONTEST_ID}/settlement`, async (route) => {
      contestPhase = "settled";
      historyState.lastActivity = advanceTime(35);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "applied",
          settlementCall: {
            to: "0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE",
            data: `0x${"e5".repeat(32)}`,
            value: "0"
          },
          detail: {
            totalWinners: 42,
            vaultSnapshotId: "snapshot-99"
          },
          rejectionReason: null,
          frozenAt: buildAnchor(5)
        })
      });
    });

    await page.route(`**/api/contests/${CONTEST_ID}/principal-redemption`, async (route) => {
      historyState.lastActivity = advanceTime(30);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ready",
          payout: {
            amount: "2.50",
            currency: "ETH",
            destination: WALLET_ADDRESS
          },
          claimCall: {
            to: "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
            data: `0x${"f6".repeat(32)}`,
            value: "0"
          },
          reason: null,
          derivedAt: buildAnchor(6)
        })
      });
    });

    await page.route(`**/api/contests/${CONTEST_ID}/execute/principal-redemption`, async (route) => {
      historyState.lastActivity = advanceTime(25);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "executed",
          payout: {
            amount: "2.50",
            currency: "ETH",
            destination: WALLET_ADDRESS
          },
          claimCall: {
            to: "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
            data: `0x${"f7".repeat(32)}`,
            value: "0"
          },
          reason: null,
          derivedAt: buildAnchor(7)
        })
      });
    });

    await page.route(`**/api/contests/${CONTEST_ID}/reward-claim`, async (route) => {
      historyState.lastActivity = advanceTime(30);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          payout: {
            amount: "1.25",
            currency: "ETH",
            destination: WALLET_ADDRESS
          },
          claimCall: {
            to: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            data: `0x${"f8".repeat(32)}`,
            value: "0"
          },
          reason: null,
          derivedAt: buildAnchor(8)
        })
      });
    });

    await page.route(`**/api/contests/${CONTEST_ID}/execute/reward-claim`, async (route) => {
      const claimedAt = advanceTime(20);
      historyState.rewardClaims.push({
        contestId: CONTEST_ID,
        walletAddress: WALLET_ADDRESS,
        amount: "1.25 ETH",
        claimedAt
      });
      historyState.lastActivity = claimedAt;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "executed",
          payout: {
            amount: "1.25",
            currency: "ETH",
            destination: WALLET_ADDRESS
          },
          claimCall: {
            to: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            data: `0x${"f9".repeat(32)}`,
            value: "0"
          },
          reason: {
            message: "Reward claimed successfully"
          },
          derivedAt: buildAnchor(9)
        })
      });
    });

    await page.route(/\/api\/me\/contests(\?.*)?$/, async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("kind") !== "participated") {
        await route.continue();
        return;
      }

      const contestSnapshot = buildContestSnapshot();

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "participated",
          items: [
            {
              contest: {
                ...contestSnapshot,
                phase: historyState.contestPhase
              },
              participations: historyState.participations,
              rewardClaims: historyState.rewardClaims,
              lastActivity: historyState.lastActivity
            }
          ],
          nextCursor: null
        })
      });
    });
  });

  test("executes registration, postgame actions, and verifies interaction summary", async ({ page }) => {
    await page.goto(`/contests/${CONTEST_ID}`);

    const connectButton = page.getByRole("button", { name: /connect wallet/i });
    await expect(connectButton).toBeVisible();
    await connectButton.click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: /MetaMask/i }).click();

    const disconnectButton = page.getByRole("button", { name: /disconnect/i });
    await expect(disconnectButton).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(SHORT_ADDRESS)).toBeVisible();

    const registrationPanel = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Registration" }) })
      .first();

    const generatePlanButton = registrationPanel.getByRole("button", { name: /generate plan/i });
    await generatePlanButton.click();
    await expect(registrationPanel.getByText("Ready")).toBeVisible();
    await expect(registrationPanel.getByText("Contest capacity available")).toBeVisible();
    await expect(registrationPanel.getByText("Estimated network fee: 0.0021 ETH")).toBeVisible();

    const executeRegistrationButton = registrationPanel.getByRole("button", { name: /^Execute$/i });
    await executeRegistrationButton.click();
    await expect(
      registrationPanel.locator("span").filter({ hasText: "Executed" })
    ).toBeVisible();
    await expect(registrationPanel.getByText("Submitted to mempool")).toBeVisible();

    const rebalanceSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Portfolio Rebalance" }) })
      .first();

    await rebalanceSection.getByLabel("Sell Asset").fill("0xaaaa000000000000000000000000000000000000");
    await rebalanceSection.getByLabel("Buy Asset").fill("0xbbbb000000000000000000000000000000000000");
    await rebalanceSection.getByLabel("Amount").fill("1000000000000000000");
    await rebalanceSection.getByLabel("Minimum Received").fill("950000000000000000");
    await rebalanceSection.getByLabel("Quote ID").fill("quote-42");

    await rebalanceSection.getByRole("button", { name: /generate plan/i }).click();
    await expect(rebalanceSection.getByText("Pending")).toBeVisible();
    await expect(rebalanceSection.getByText("Sufficient pool liquidity")).toBeVisible();

    await rebalanceSection.getByRole("button", { name: /^Execute$/i }).click();
    await expect(rebalanceSection.getByText("Monitor vault delta for next epoch")).toBeVisible();
    await expect(
      rebalanceSection.locator("span").filter({ hasText: "Executed" })
    ).toBeVisible();

    const settlementSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Contest Settlement" }) })
      .first();
    await settlementSection.getByRole("button", { name: /^Execute$/i }).click();
    await expect(settlementSection.getByText("Applied")).toBeVisible();
    await expect(settlementSection.getByText("snapshot-99")).toBeVisible();

    const principalSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Principal Redemption" }) })
      .first();
    await principalSection.getByRole("button", { name: /generate plan/i }).click();
    await expect(principalSection.getByText("Ready")).toBeVisible();
    await expect(principalSection.getByText("2.50 ETH")).toBeVisible();
    await principalSection.getByRole("button", { name: /^Execute$/i }).click();
    await expect(principalSection.getByText("Executed")).toBeVisible();

    const rewardSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Reward Claim" }) })
      .first();
    await rewardSection.getByRole("button", { name: /generate plan/i }).click();
    await expect(rewardSection.getByText("Success")).toBeVisible();
    await expect(rewardSection.getByText("1.25 ETH")).toBeVisible();
    await rewardSection.getByRole("button", { name: /^Execute$/i }).click();
    await expect(rewardSection.getByText("Executed")).toBeVisible();
    await expect(rewardSection.getByText("Reward claimed successfully")).toBeVisible();

    await page.getByRole("link", { name: "My Participation" }).click();
    await page.waitForURL("/profile/participation");

    const summary = page.locator("section").filter({ has: page.getByRole("heading", { name: "Recent Interaction" }) });
    await expect(summary.getByText(TRUNCATED_CONTEST_ID)).toBeVisible();
    await expect(summary.getByText("Reward claim")).toBeVisible();
    await expect(summary.getByText("1.25 ETH")).toBeVisible();

    const historyCard = page.locator("article").filter({ has: page.getByText(TRUNCATED_CONTEST_ID) }).first();
    await expect(historyCard.getByText("Registration History")).toBeVisible();
    await expect(historyCard.getByText("Registered amount: 2.50 ETH")).toBeVisible();
    await expect(historyCard.getByText("Reward History")).toBeVisible();
    await expect(historyCard.getByText("Reward claimed: 1.25 ETH")).toBeVisible();
  });
});
