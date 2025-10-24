import { createContestCreationGateway, type ContestCreationGateway } from '@chaincontest/chain';

let gateway: ContestCreationGateway | null = null;

export const getCreationGateway = (): ContestCreationGateway => {
  if (!gateway) {
    gateway = createContestCreationGateway();
  }
  return gateway;
};

export const __resetCreationGateway = (): void => {
  gateway = null;
};
