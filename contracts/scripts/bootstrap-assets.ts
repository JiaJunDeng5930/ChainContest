import { ethers } from "hardhat";

const USDC_DECIMALS = 6n;
const WETH_DECIMALS = 18n;

const formatUnits = (value: bigint, decimals: bigint): string => {
  const divisor = 10n ** decimals;
  const whole = value / divisor;
  const fraction = value % divisor;
  if (fraction === 0n) {
    return whole.toString();
  }
  return `${whole}.${fraction.toString().padStart(Number(decimals), "0")}`;
};

async function main() {
  const [organizer, participant, , poolOperator] = await ethers.getSigners();

  const mockErc20Factory = await ethers.getContractFactory("MockERC20");
  const mockPoolFactory = await ethers.getContractFactory("MockUniswapV3Pool");

  const usdc = await mockErc20Factory.deploy("USD Coin", "USDC", Number(USDC_DECIMALS));
  await usdc.waitForDeployment();

  const weth = await mockErc20Factory.deploy("Wrapped Ether", "WETH", Number(WETH_DECIMALS));
  await weth.waitForDeployment();

  const pool = await mockPoolFactory.deploy(await usdc.getAddress(), await weth.getAddress(), 0);
  await pool.waitForDeployment();

  const organizerMint = 5_000_000n * 10n ** USDC_DECIMALS;
  const participantMint = 2_000_000n * 10n ** USDC_DECIMALS;
  const poolUsdcFloat = 50_000_000n * 10n ** USDC_DECIMALS;
  const poolWethFloat = 50_000n * 10n ** WETH_DECIMALS;

  await usdc.mint(await organizer.getAddress(), organizerMint);
  await usdc.mint(await participant.getAddress(), participantMint);
  await usdc.mint(await pool.getAddress(), poolUsdcFloat);

  await weth.mint(await organizer.getAddress(), 5_000n * 10n ** WETH_DECIMALS);
  await weth.mint(await participant.getAddress(), 1_000n * 10n ** WETH_DECIMALS);
  await weth.mint(await poolOperator.getAddress(), 2_000n * 10n ** WETH_DECIMALS);
  await weth.mint(await pool.getAddress(), poolWethFloat);

  const snapshot = {
    network: {
      chainId: 31337,
      rpcUrl: "http://hardhat-node:8545"
    },
    assets: {
      usdc: {
        address: await usdc.getAddress(),
        decimals: Number(USDC_DECIMALS),
        organizerBalance: formatUnits(organizerMint, USDC_DECIMALS),
        participantBalance: formatUnits(participantMint, USDC_DECIMALS),
        poolLiquidity: formatUnits(poolUsdcFloat, USDC_DECIMALS)
      },
      weth: {
        address: await weth.getAddress(),
        decimals: Number(WETH_DECIMALS),
        organizerBalance: formatUnits(5_000n * 10n ** WETH_DECIMALS, WETH_DECIMALS),
        participantBalance: formatUnits(1_000n * 10n ** WETH_DECIMALS, WETH_DECIMALS),
        poolLiquidity: formatUnits(poolWethFloat, WETH_DECIMALS)
      }
    },
    pool: {
      address: await pool.getAddress(),
      tick: 0
    },
    accounts: {
      organizer: await organizer.getAddress(),
      participant: await participant.getAddress(),
      poolOperator: await poolOperator.getAddress()
    }
  };

  console.log(JSON.stringify(snapshot, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
