import {
  userIdentities,
  userIdentityStatusEnum,
  walletBindings,
  walletBindingRelations,
  userIdentityRelations,
  walletSourceEnum,
  type UserIdentity,
  type NewUserIdentity,
  type WalletBinding,
  type NewWalletBinding
} from './user-bindings.js';

export {
  userIdentities,
  userIdentityStatusEnum,
  walletBindings,
  walletBindingRelations,
  userIdentityRelations,
  walletSourceEnum,
  type UserIdentity,
  type NewUserIdentity,
  type WalletBinding,
  type NewWalletBinding
} from './user-bindings.js';

export const dbSchema = {
  userIdentities,
  walletBindings
};

export type DbSchema = typeof dbSchema;
