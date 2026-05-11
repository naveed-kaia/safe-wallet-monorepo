import type { TransactionData } from '@safe-global/store/gateway/AUTO_GENERATED/transactions'
import { Safe_migration__factory } from '@safe-global/utils/types/contracts'
import { getCompatibilityFallbackHandlerDeployments, getSafeMigrationDeployment } from '@safe-global/safe-deployments'
import { hasMatchingDeployment } from '@safe-global/utils/services/contracts/deployments'
import { type MetaTransactionData, OperationType, type SafeVersion } from '@safe-global/types-kit'
import type { Chain } from '@safe-global/store/gateway/AUTO_GENERATED/chains'

import { SAFE_TO_L2_MIGRATION_VERSION } from '@safe-global/utils/config/constants'
import {
  getTargetVersionForSafeMigration,
  resolveSafeMigrationDeploymentForChain,
} from '@safe-global/utils/utils/chains'
import { sameAddress } from '@safe-global/utils/utils/addresses'

export const createUpdateMigration = (
  chain: Chain,
  safeVersion: string,
  fallbackHandler?: string,
): MetaTransactionData => {
  console.log('[SafeMigration] createUpdateMigration called', {
    chainId: chain.chainId,
    safeVersion,
    recommendedMasterCopyVersion: chain.recommendedMasterCopyVersion,
  })
  const migrationVersion = getTargetVersionForSafeMigration(chain)
  console.log('[SafeMigration] resolved migrationVersion:', migrationVersion)
  const deployment = resolveSafeMigrationDeploymentForChain(migrationVersion, chain.chainId)
  console.log('[SafeMigration] deployment found:', !!deployment, 'networkAddresses:', deployment?.networkAddresses)

  if (!deployment) {
    throw new Error('Migration deployment not found')
  }

  const migrationTo = deployment.networkAddresses[String(chain.chainId)] ?? deployment.defaultAddress
  console.log('[SafeMigration] migrationTo (final to address):', migrationTo)

  // Keep fallback handler if it's not a default one
  const keepFallbackHandler =
    !!fallbackHandler &&
    !hasMatchingDeployment(getCompatibilityFallbackHandlerDeployments, fallbackHandler, chain.chainId, [
      safeVersion as SafeVersion,
    ])

  const method = (
    keepFallbackHandler
      ? chain.l2
        ? 'migrateL2Singleton'
        : 'migrateSingleton'
      : chain.l2
        ? 'migrateL2WithFallbackHandler'
        : 'migrateWithFallbackHandler'
  ) as 'migrateSingleton' // apease typescript

  const interfce = Safe_migration__factory.createInterface()

  const tx: MetaTransactionData = {
    operation: OperationType.DelegateCall, // delegate call required
    data: interfce.encodeFunctionData(method),
    to: migrationTo,
    value: '0',
  }

  return tx
}

export const createMigrateToL2 = (chain: Chain) => {
  // Use the highest deployed SafeMigration version so that migrateL2Singleton lands
  // on the latest supported L2 singleton (e.g. v1.5.0 when deployed on a custom chain).
  // Falls back to SAFE_TO_L2_MIGRATION_VERSION (1.4.1) when v1.5.0 is not yet deployed.
  const migrationVersion = getTargetVersionForSafeMigration(chain)
  console.log('[SafeMigration] createMigrateToL2 migrationVersion:', migrationVersion, 'chain:', chain.chainId)
  const deployment = resolveSafeMigrationDeploymentForChain(migrationVersion, chain.chainId)

  if (!deployment) {
    throw new Error('Migration deployment not found')
  }

  const migrationTo = deployment.networkAddresses[String(chain.chainId)] ?? deployment.defaultAddress
  console.log('[SafeMigration] createMigrateToL2 migrationTo:', migrationTo)

  const interfce = Safe_migration__factory.createInterface()

  const tx: MetaTransactionData = {
    operation: OperationType.DelegateCall, // delegate call required
    data: interfce.encodeFunctionData('migrateL2Singleton'),
    to: migrationTo,
    value: '0',
  }

  return tx
}

export const isMigrateL2SingletonCall = (txData: TransactionData): boolean => {
  // We always use the 1.4.1 version for this contract as it is only deployed for 1.4.1 Safes
  const safeMigrationDeployment = getSafeMigrationDeployment({ version: SAFE_TO_L2_MIGRATION_VERSION })
  const safeMigrationAddress = safeMigrationDeployment?.defaultAddress
  const safeMigrationInterface = Safe_migration__factory.createInterface()

  return (
    txData.hexData !== undefined &&
    txData.hexData !== null &&
    txData.hexData.startsWith(safeMigrationInterface.getFunction('migrateL2Singleton').selector) &&
    sameAddress(txData.to.value, safeMigrationAddress)
  )
}
