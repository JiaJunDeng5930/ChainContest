export const priceSourceAbi = [
  {
    type: "function",
    name: "lastSnapshot",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        components: [
          { internalType: "int24", name: "meanTick", type: "int24" },
          { internalType: "uint160", name: "sqrtPriceX96", type: "uint160" },
          { internalType: "uint256", name: "priceE18", type: "uint256" },
          { internalType: "uint64", name: "updatedAt", type: "uint64" },
        ],
        internalType: "struct PriceSource.Snapshot",
        name: "",
        type: "tuple",
      },
    ],
  },
  {
    type: "function",
    name: "previewPriceImpact",
    stateMutability: "view",
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOut", type: "uint256" },
      { internalType: "bool", name: "zeroForOne", type: "bool" },
    ],
    outputs: [{ internalType: "int32", name: "", type: "int32" }],
  },
  {
    type: "function",
    name: "twapSeconds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ internalType: "uint32", name: "", type: "uint32" }],
  },
  {
    type: "event",
    name: "PriceUpdated",
    inputs: [
      { indexed: false, internalType: "int24", name: "meanTick", type: "int24" },
      { indexed: false, internalType: "uint160", name: "sqrtPriceX96", type: "uint160" },
      { indexed: false, internalType: "uint256", name: "priceE18", type: "uint256" },
      { indexed: false, internalType: "uint64", name: "updatedAt", type: "uint64" },
    ],
    anonymous: false,
  },
] as const;
