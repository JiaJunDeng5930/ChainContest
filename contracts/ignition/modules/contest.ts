import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "ethers";

const ContestModule = buildModule("ContestModule", (m) => {
  const now = Math.floor(Date.now() / 1000);

  const contestId = m.getParameter("contestId", ethers.encodeBytes32String("contest-001"));
  const entryAsset = m.getParameter<string>("entryAsset");
  const entryAmount = m.getParameter<bigint>("entryAmount", 1_000_000n);
  const entryFee = m.getParameter<bigint>("entryFee", 0n);
  const initialPrizeAmount = m.getParameter<bigint>("initialPrizeAmount", 0n);
  const priceSource = m.getParameter<string>("priceSource");
  const swapPool = m.getParameter<string>("swapPool");
  const priceToleranceBps = m.getParameter<number>("priceToleranceBps", 50);
  const settlementWindow = m.getParameter<number>("settlementWindow", 1_800);
  const maxParticipants = m.getParameter<number>("maxParticipants", 1_024);
  const topK = m.getParameter<number>("topK", 8);
  const registeringEnds = m.getParameter<number>("registeringEnds", now + 3_600);
  const liveEnds = m.getParameter<number>("liveEnds", now + 7_200);
  const claimEnds = m.getParameter<number>("claimEnds", now + 14_400);
  const payoutSchedule = m.getParameter<number[]>(
    "payoutSchedule",
    Array.from({ length: 32 }, (_, index) => (index === 0 ? 10_000 : 0)),
  );
  const vaultImplementation = m.getParameter<string>("vaultImplementation");
  const vaultFactory = m.getParameter<string>("vaultFactory");
  const owner = m.getParameter<string>("owner", m.getAccount(0));

  const contest = m.contract("Contest");

  m.call(contest, "initialize", [
    {
      contestId,
      config: {
        entryAsset,
        entryAmount,
        entryFee,
        priceSource,
        swapPool,
        priceToleranceBps,
        settlementWindow,
        maxParticipants,
        topK,
      },
      timeline: {
        registeringEnds,
        liveEnds,
        claimEnds,
      },
      initialPrizeAmount,
      payoutSchedule,
      vaultImplementation,
      vaultFactory,
      owner,
    },
  ]);

  return {
    contest,
  };
});

export default ContestModule;
