import { ethers } from "hardhat";

async function main() {
  const contestAddress = process.env.CONTEST_ADDRESS ?? process.argv[2];
  const participantAddress = process.env.PARTICIPANT_ADDRESS ?? process.argv[3];

  if (!contestAddress || !contestAddress.startsWith("0x")) {
    throw new Error("Usage: hardhat run scripts/advance-contest.ts --network <network> <contestAddress> <participantAddress>");
  }

  if (!participantAddress || !participantAddress.startsWith("0x")) {
    throw new Error("Participant address is required");
  }

  const [defaultSigner, , participantSigner] = await ethers.getSigners();

  const contest = await ethers.getContractAt("Contest", contestAddress, defaultSigner);

  const timeline = await contest.getTimeline();
  const targetTimestamp = Number(timeline.claimEnds) + 120;

  await ethers.provider.send("evm_setNextBlockTimestamp", [targetTimestamp]);
  await ethers.provider.send("evm_mine", []);

  await (await contest.syncState()).wait();
  await (await contest.freeze()).wait();

  const settleTx = await contest.settle(participantAddress);
  const settleReceipt = await settleTx.wait();
  if (!settleReceipt?.status) {
    throw new Error("settle transaction failed");
  }

  const vaultId = await contest.participantVaults(participantAddress);
  const nav = await contest.vaultNavs(vaultId);
  const roiBps = await contest.vaultRoiBps(vaultId);

  await (
    await contest.updateLeaders([
      {
        vaultId,
        nav,
        roiBps
      }
    ])
  ).wait();

  await (await contest.seal()).wait();

  const participantContest = contest.connect(participantSigner);
  const claimTx = await participantContest.claim();
  const claimReceipt = await claimTx.wait();
  if (!claimReceipt?.status) {
    throw new Error("claim transaction failed");
  }

  console.log("Contest advanced to sealed state and reward claimed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
