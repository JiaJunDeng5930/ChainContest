import { ethers } from "hardhat";

const parseAddress = (label: string, value: string | undefined): string => {
  if (!value || !value.startsWith("0x") || value.length !== 42) {
    throw new Error(`${label} must be a 0x-prefixed 20-byte address`);
  }
  return value;
};

async function main(): Promise<void> {
  const contestAddress = parseAddress("CONTEST_ADDRESS", process.env.CONTEST_ADDRESS ?? process.argv[2]);
  const participantAddress = parseAddress("PARTICIPANT_ADDRESS", process.env.PARTICIPANT_ADDRESS ?? process.argv[3]);

  const participantSigner = await ethers.getSigner(participantAddress);
  const contest = await ethers.getContractAt("Contest", contestAddress, participantSigner);

  const tx = await contest.register();
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1n) {
    console.error(
      JSON.stringify(
        {
          contestAddress,
          participantAddress,
          transactionHash: receipt?.hash ?? tx.hash,
          status: receipt?.status ?? null,
          gasUsed: receipt?.gasUsed?.toString() ?? null,
          blockNumber: receipt?.blockNumber ?? null
        },
        null,
        2
      )
    );
    throw new Error("Registration transaction failed");
  }

  console.log(
    JSON.stringify(
      {
        contestAddress,
        participantAddress,
        transactionHash: receipt.hash,
        gasUsed: receipt.gasUsed?.toString() ?? null,
        blockNumber: receipt.blockNumber
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
