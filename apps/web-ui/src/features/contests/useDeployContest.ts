"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
  useQueryClient
} from "@tanstack/react-query";

import {
  submitContestCreation,
  type ContestCreationAggregate,
  type ContestCreationRequest
} from "./api/createContest";

export type DeployContestVariables = ContestCreationRequest;

export const useDeployContest = (
  options?: Omit<
    UseMutationOptions<ContestCreationAggregate, Error, DeployContestVariables>,
    "mutationFn"
  >
): UseMutationResult<ContestCreationAggregate, Error, DeployContestVariables> => {
  const queryClient = useQueryClient();

  return useMutation<ContestCreationAggregate, Error, DeployContestVariables>({
    mutationFn: submitContestCreation,
    ...options,
    onSuccess: async (data, variables, context) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contests"] }),
        queryClient.invalidateQueries({ queryKey: ["creator-contests"] }),
        queryClient.invalidateQueries({ queryKey: ["contest-requests"] })
      ]);

      if (options?.onSuccess) {
        await options.onSuccess(data, variables, context);
      }
    }
  });
};
