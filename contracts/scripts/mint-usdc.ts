import { ethers } from "hardhat";

const ENTRY_ASSET_ADDRESS = (process.env.ENTRY_ASSET_ADDRESS ?? "0x5fbdb2315678afecb367f032d93f642f64180aa3").toLowerCase();
const TARGET_MINT_AMOUNT = process.env.TARGET_MINT_AMOUNT ?? "1000000"; // 1,000,000 tokens (without decimals)
const ENTRY_ASSET_DECIMALS = Number(process.env.ENTRY_ASSET_DECIMALS ?? 6);

async function main() {
  if (!ENTRY_ASSET_ADDRESS || ENTRY_ASSET_ADDRESS === "0x0000000000000000000000000000000000000000") {
    throw new Error("ENTRY_ASSET_ADDRESS is not configured");
  }

  const token = await ethers.getContractAt("MockERC20", ENTRY_ASSET_ADDRESS);
  const signers = await ethers.getSigners();
  const amount = ethers.parseUnits(TARGET_MINT_AMOUNT, ENTRY_ASSET_DECIMALS);

  console.log(`Minting ${TARGET_MINT_AMOUNT} tokens (decimals=${ENTRY_ASSET_DECIMALS}) to ${signers.length} accounts...`);

  for (const signer of signers) {
    const tx = await token.mint(signer.address, amount);
    await tx.wait();
    console.log(`  ✔ Minted to ${signer.address} (tx: ${tx.hash})`);
  }

  console.log("Done");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
