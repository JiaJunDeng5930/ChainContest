import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "dotenv/config";

const {
  SEPOLIA_RPC_PRIMARY,
  SEPOLIA_RPC_FALLBACK,
  DEPLOYER_PRIVATE_KEY,
  FORK_RPC_URL,
} = process.env;

const sepoliaUrl = SEPOLIA_RPC_PRIMARY || SEPOLIA_RPC_FALLBACK;
const deployerAccounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.21",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 31337,
      forking: FORK_RPC_URL
        ? {
            url: FORK_RPC_URL,
          }
        : undefined,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url: sepoliaUrl || "https://rpc.sepolia.example",
      accounts: deployerAccounts,
      chainId: 11155111,
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 400000,
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    token: "ETH",
    gasPrice: 25,
    reportFormats: ["text", "json"],
    outputFile: "gas-report.txt",
    showTimeSpent: true,
    noColors: true,
  },
};

export default config;
