import { ethers } from "hardhat";

const DEFAULT_MINT_MULTIPLIER = 2_000_000n;

const parseAddress = (label: string, value: string | undefined): string => {
  if (!value || !value.startsWith("0x") || value.length !== 42) {
    throw new Error(`${label} must be a 0x-prefixed 20-byte address`);
  }
  return value;
};

const parseMultiplier = (value: string | undefined): bigint => {
  if (!value) {
    return DEFAULT_MINT_MULTIPLIER;
  }
  const parsed = BigInt(value);
  if (parsed <= 0) {
    throw new Error("Mint multiplier must be positive");
  }
  return parsed;
};

async function main(): Promise<void> {
  const tokenAddress = parseAddress("ENTRY_TOKEN_ADDRESS", process.env.ENTRY_TOKEN_ADDRESS ?? process.argv[2]);
  const participantAddress = parseAddress("PARTICIPANT_ADDRESS", process.env.PARTICIPANT_ADDRESS ?? process.argv[3]);
  const contestAddress = parseAddress("CONTEST_ADDRESS", process.env.CONTEST_ADDRESS ?? process.argv[4]);
  const mintMultiplier = parseMultiplier(process.env.MINT_MULTIPLIER ?? process.argv[5]);

  const [organizerSigner] = await ethers.getSigners();
  const participantSigner = await ethers.getSigner(participantAddress);

  const erc20 = await ethers.getContractAt("MockERC20", tokenAddress, organizerSigner);
  const decimals = BigInt(await erc20.decimals());
  const unit = 10n ** decimals;
  const mintAmount = mintMultiplier * unit;
  const allowanceTarget = mintAmount;

  console.log(
    JSON.stringify(
      {
        tokenAddress,
        participantAddress,
        contestAddress,
        decimals: Number(decimals),
        mintAmount: mintAmount.toString(),
        allowanceAmount: allowanceTarget.toString()
      },
      null,
      2
    )
  );

  const mintTx = await erc20.mint(participantAddress, mintAmount);
  await mintTx.wait();

  const approveTx = await erc20.connect(participantSigner).approve(contestAddress, allowanceTarget);
  await approveTx.wait();

  console.log("Participant funded and allowance granted");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
