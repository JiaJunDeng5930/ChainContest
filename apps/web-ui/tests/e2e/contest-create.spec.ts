import { expect, test } from "@playwright/test";

const ORGANIZER_ADDRESS = "0x7777777777777777777777777777777777777777";

test.describe("Contest creation journey", () => {
  test.beforeEach(async ({ page }) => {
    const creatorItems: Array<Record<string, unknown>> = [];

    await page.route("**/api/runtime/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chainId: 1,
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
          walletAddress: ORGANIZER_ADDRESS,
          addressChecksum: ORGANIZER_ADDRESS,
          needsRefresh: false,
          expiresAt: "2025-12-31T23:59:59.000Z"
        })
      });
    });

    await page.route("**/api/me/contests**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("kind") !== "created") {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "created",
          items: creatorItems,
          nextCursor: null
        })
      });
    });

    await page.route("**/api/contests/create", async (route) => {
      const payload = JSON.parse(route.request().postData() ?? "{}") as {
        networkId: number;
        payload: Record<string, unknown>;
      };

      const now = new Date("2025-10-24T15:00:00.000Z");
      const isoNow = now.toISOString();
      const requestId = "req-create-1";
      const artifactId = "artifact-const-1";
      const contestId = "contest-velocity-1";

      const artifact = {
        artifactId,
        requestId,
        contestId,
        networkId: payload.networkId,
        registrarAddress: "0x1111111111111111111111111111111111111111",
        treasuryAddress: "0x2222222222222222222222222222222222222222",
        settlementAddress: "0x3333333333333333333333333333333333333333",
        rewardsAddress: "0x4444444444444444444444444444444444444444",
        metadata: { seedDigest: "0xabc123" },
        createdAt: isoNow,
        updatedAt: isoNow
      };

      creatorItems.splice(0, creatorItems.length, {
        status: "accepted",
        request: {
          requestId,
          userId: "user-creator-1",
          networkId: payload.networkId,
          payload: payload.payload,
          createdAt: isoNow,
          updatedAt: isoNow
        },
        artifact,
        contest: {
          contestId,
          chainId: payload.networkId,
          contractAddress: "0x5555555555555555555555555555555555555555",
          status: "registration",
          originTag: "factory",
          timeWindowStart: isoNow,
          timeWindowEnd: new Date("2025-11-01T15:00:00.000Z").toISOString(),
          metadata: { slug: "velocity-cup" },
          createdAt: isoNow,
          updatedAt: isoNow
        }
      });

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "accepted",
          request: {
            requestId,
            userId: "user-creator-1",
            networkId: payload.networkId,
            payload: payload.payload,
            createdAt: isoNow,
            updatedAt: isoNow
          },
          artifact,
          receipt: {
            status: "accepted",
            requestId,
            organizer: ORGANIZER_ADDRESS,
            networkId: payload.networkId,
            acceptedAt: isoNow,
            metadata: { payloadDigest: "digest-123" }
          }
        })
      });
    });
  });

  test("submits a contest creation and lists the deployment", async ({ page }) => {
    await page.goto("/contests/create");

    await expect(page.getByRole("heading", { name: "Create a contest" })).toBeVisible();
    await expect(page.getByText("No contest creation requests found yet.")).toBeVisible();

    const payload = {
      name: "Velocity Cup 2045",
      registrationWindow: {
        opensAt: "2025-10-24T12:00:00.000Z",
        closesAt: "2025-10-31T12:00:00.000Z"
      },
      prizeToken: {
        symbol: "VEL",
        decimals: 18
      }
    };

    await page.getByRole("textbox", { name: /contest payload/i }).fill(JSON.stringify(payload, null, 2));

    const submitButton = page.getByRole("button", { name: /submit creation request/i });
    const postResponse = page.waitForResponse(
      (response) => response.url().includes("/api/contests/create") && response.request().method() === "POST"
    );
    await submitButton.click();
    await postResponse;

    await expect(page.getByRole("heading", { name: "Creation result" })).toBeVisible();
    await expect(page.getByText(/Latest status: Accepted/i)).toBeVisible();
    await expect(page.getByText("req-create-1")).toBeVisible();
    await expect(page.getByText("0x1111111111111111111111111111111111111111")).toBeVisible();

    await expect(page.getByRole("heading", { name: "My contest deployments" })).toBeVisible();
    const statusBadge = page.locator("li").filter({ hasText: "req-create-1" }).getByText("Accepted");
    await expect(statusBadge).toBeVisible();

    const contestSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Contest" }) })
      .first();
    await expect(contestSection.getByText("0x5555555555555555555555555555555555555555")).toBeVisible();
    await expect(contestSection.getByText("factory")).toBeVisible();

    const requestSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Request" }) })
      .first();
    const payloadToggle = requestSection.getByText("View payload");
    await payloadToggle.click();
    await expect(page.getByText("Velocity Cup 2045", { exact: false })).toBeVisible();

    const metadataToggle = contestSection.getByText("View metadata");
    await metadataToggle.click();
    await expect(page.getByText("velocity-cup", { exact: false })).toBeVisible();
  });
});
