import type { TransactionData } from '@safe-global/store/gateway/AUTO_GENERATED/transactions'
import type { SafeContractImplementationType } from '@safe-global/protocol-kit/dist/src/types/contracts'
import type { MetaTransactionData, SafeVersion } from '@safe-global/types-kit'
import { OperationType } from '@safe-global/types-kit'
import type { Chain } from '@safe-global/store/gateway/AUTO_GENERATED/chains'
import { type SafeState } from '@safe-global/store/gateway/AUTO_GENERATED/safes'
import semverSatisfies from 'semver/functions/satisfies'
import { getReadOnlyFallbackHandlerContract, getReadOnlyGnosisSafeContract } from '@/services/contracts/safeContracts'
import { SAFE_FEATURES } from '@safe-global/protocol-kit/dist/src/utils/safeVersions'
import { hasSafeFeature } from '@/utils/safe-versions'
import { createUpdateMigration } from '@/utils/safe-migrations'
import { isMultiSendCalldata } from '@/utils/transaction-calldata'
import { decodeMultiSendData } from '@safe-global/protocol-kit/dist/src/utils'
import { Gnosis_safe__factory } from '@safe-global/utils/types/contracts/factories/@safe-global/safe-deployments/dist/assets/v1.1.1'
import { sameAddress } from '@safe-global/utils/utils/addresses'
import { determineMasterCopyVersion } from '@safe-global/utils/utils/safe'
import { getLatestSafeVersion, resolveSafeMigrationDeploymentForChain } from '@safe-global/utils/utils/chains'
import { assertValidSafeVersion } from '@safe-global/utils/services/contracts/utils'

/** Safe singletons from 1.3.0 onward use the standard proxy + SafeMigration delegate-call path (see SafeMigration.sol). */
const shouldMigrateViaSafeMigrationContract = (safeVersion: string): boolean => {
  const base = safeVersion.split('+')[0]
  return semverSatisfies(base, '>=1.3.0 <1.5.0')
}

const getChangeFallbackHandlerCallData = async (
  safeContractInstance: SafeContractImplementationType,
  chain: Chain,
): Promise<string> => {
  if (!hasSafeFeature(SAFE_FEATURES.SAFE_FALLBACK_HANDLER, getLatestSafeVersion(chain))) {
    return '0x'
  }

  const fallbackHandlerAddress = (await getReadOnlyFallbackHandlerContract(getLatestSafeVersion(chain))).getAddress()
  // @ts-ignore
  return safeContractInstance.encode('setFallbackHandler', [fallbackHandlerAddress])
}

/**
 * For Safes on singleton >=1.3.0 and <1.5.0, performs a delegate call to the SafeMigration deployment for the target version (chain.recommendedMasterCopyVersion / LATEST_SAFE_VERSION).
 *
 * For older (<1.3.0) Safes, creates two transactions:
 * - change the mastercopy address
 * - set the fallback handler address
 */
export const createUpdateSafeTxs = async (safe: SafeState, chain: Chain): Promise<MetaTransactionData[]> => {
  assertValidSafeVersion(safe.version)

  console.log('[SafeMigration] createUpdateSafeTxs called', {
    safeVersion: safe.version,
    chainId: chain.chainId,
    recommendedMasterCopyVersion: chain.recommendedMasterCopyVersion,
    shouldMigrate: shouldMigrateViaSafeMigrationContract(safe.version),
  })

  if (shouldMigrateViaSafeMigrationContract(safe.version)) {
    return [createUpdateMigration(chain, safe.version, safe.fallbackHandler?.value)]
  }

  // Legacy (<1.3.0) Safes: changeMasterCopy + setFallbackHandler
  const latestMasterCopyAddress = (await getReadOnlyGnosisSafeContract(chain, getLatestSafeVersion(chain))).getAddress()
  const currentReadOnlySafeContract = await getReadOnlyGnosisSafeContract(chain, safe.version)

  const updatedReadOnlySafeContract = await getReadOnlyGnosisSafeContract(chain, getLatestSafeVersion(chain))

  // @ts-expect-error this was removed in 1.3.0 but we need to support it for older safe versions
  const changeMasterCopyCallData = currentReadOnlySafeContract.encode('changeMasterCopy', [latestMasterCopyAddress])
  const changeFallbackHandlerCallData = await getChangeFallbackHandlerCallData(updatedReadOnlySafeContract, chain)

  const txs: MetaTransactionData[] = [
    {
      to: safe.address.value,
      value: '0',
      data: changeMasterCopyCallData,
      operation: OperationType.Call,
    },
    {
      to: safe.address.value,
      value: '0',
      data: changeFallbackHandlerCallData,
      operation: OperationType.Call,
    },
  ]

  return txs
}
const SAFE_1_1_1_INTERFACE = Gnosis_safe__factory.createInterface()

export const extractTargetVersionFromUpdateSafeTx = (
  txData: TransactionData | undefined,
  safe: SafeState,
): SafeVersion | undefined => {
  if (!txData) {
    return
  }
  const data = txData.hexData ?? '0x'
  let migrationTxData: MetaTransactionData = {
    to: txData.to.value,
    data,
    value: txData.value ?? '0',
    operation: txData.operation as number,
  }
  if (isMultiSendCalldata(data)) {
    // Decode multisend and check the first call
    const txs = decodeMultiSendData(data)
    if (txs.length === 2) {
      // First tx is the upgrade. Second sets the fallback handler
      migrationTxData = txs[0]
    }
  }

  // Below Safe 1.3.0 the call will be to the Safe itself and call changeMasterCopy
  if (
    sameAddress(migrationTxData.to, safe.address.value) &&
    migrationTxData.data.startsWith(SAFE_1_1_1_INTERFACE.getFunction('changeMasterCopy').selector)
  ) {
    // Decode call and check which Safe version it is
    const decodedData = SAFE_1_1_1_INTERFACE.decodeFunctionData('changeMasterCopy', migrationTxData.data)
    return determineMasterCopyVersion(decodedData[0], safe.chainId)
  }

  const migrationVersions = ['1.5.0', '1.4.1', '1.3.0'] as SafeVersion[]

  for (const mv of migrationVersions) {
    const deployment = resolveSafeMigrationDeploymentForChain(mv, safe.chainId)
    const addr = deployment?.networkAddresses[String(safe.chainId)] ?? deployment?.defaultAddress

    if (migrationTxData.operation === 1 && addr && sameAddress(addr, migrationTxData.to)) {
      return mv
    }
  }
}
