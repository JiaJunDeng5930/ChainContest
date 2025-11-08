import { finalizeContestDeployment } from "../lib/contests/deploymentService";

async function main() {
  const result = await finalizeContestDeployment({
    requestId: "93eda3f7-a5a8-413e-81da-026a5d364486",
    transactionHash: "0xcec423aff132e74339fb19fa5374fe064fa2136661749436b10c7a288cb60dde",
    userId: "548ea0d7-0e1c-43ed-8ffa-ed6237780a52",
    organizerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  });

  console.log("status", result.request.status);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
