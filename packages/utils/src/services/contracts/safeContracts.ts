import type { SafeState } from '@safe-global/store/gateway/AUTO_GENERATED/safes'
import { type GetContractProps } from '@safe-global/protocol-kit'
import type { SafeVersion } from '@safe-global/types-kit'
import { assertValidSafeVersion } from '@safe-global/utils/services/contracts/utils'
import { getSafeMigrationDeployment } from '@safe-global/safe-deployments'
import { SAFE_TO_L2_MIGRATION_VERSION } from '@safe-global/utils/config/constants'
import type { BytecodeComparisonResult } from './bytecodeComparison'
import semverGt from 'semver/functions/gt'
import semverValid from 'semver/functions/valid'

/**
 * The highest Safe contract version whose bindings are included in the installed
 * @safe-global/protocol-kit. Safe 1.5.0+ are ABI-compatible with 1.4.1, so calls that
 * need a protocol-kit contract instance can safely use the 1.4.1 bindings.
 * Remove the capping logic below once protocol-kit ships 1.5.0 support.
 */
const PROTOCOL_KIT_MAX_SUPPORTED_VERSION: SafeVersion = '1.4.1'

// `UNKNOWN` is returned if the mastercopy does not match supported ones
// @see https://github.com/safe-global/safe-client-gateway/blob/main/src/routes/safes/handlers/safes.rs#L28-L31
//      https://github.com/safe-global/safe-client-gateway/blob/main/src/routes/safes/converters.rs#L77-L79
export const isValidMasterCopy = (implementationVersionState: SafeState['implementationVersionState']): boolean => {
  return implementationVersionState !== 'UNKNOWN'
}

/**
 * Checks if an unsupported mastercopy can be migrated based on bytecode comparison
 * with supported L2 contracts (1.3.0+L2 and 1.4.1+L2)
 *
 * @param safe - The Safe state object
 * @param bytecodeComparisonResult - Optional result from bytecode comparison
 * @returns boolean indicating if migration is possible
 */
export const canMigrateUnsupportedMastercopy = (
  safe: SafeState,
  bytecodeComparisonResult?: BytecodeComparisonResult,
): boolean => {
  // Must be an unsupported mastercopy
  if (isValidMasterCopy(safe.implementationVersionState)) {
    return false
  }

  // Must have bytecode comparison result with a match
  if (!bytecodeComparisonResult || !bytecodeComparisonResult.isMatch) {
    return false
  }

  // Check if migration contract is deployed on this chain
  return Boolean(
    getSafeMigrationDeployment({ network: safe.chainId, version: SAFE_TO_L2_MIGRATION_VERSION })?.networkAddresses[
      safe.chainId
    ],
  )
}

export const _getValidatedGetContractProps = (
  safeVersion: SafeState['version'],
): Pick<GetContractProps, 'safeVersion'> => {
  assertValidSafeVersion(safeVersion)

  // SDK request here: https://github.com/safe-global/safe-core-sdk/issues/261
  // Remove '+L2'/'+Circles' metadata from version
  const [noMetadataVersion] = safeVersion.split('+')

  // Safe 1.5.0+ contracts are ABI-compatible with 1.4.1. Cap the version passed to
  // protocol-kit's getSafeContractInstance until protocol-kit ships 1.5.0 bindings.
  const effectiveVersion =
    semverValid(noMetadataVersion) && semverGt(noMetadataVersion, PROTOCOL_KIT_MAX_SUPPORTED_VERSION)
      ? PROTOCOL_KIT_MAX_SUPPORTED_VERSION
      : (noMetadataVersion as SafeVersion)

  return {
    safeVersion: effectiveVersion,
  }
}
export const isMigrationToL2Possible = (safe: SafeState): boolean => {
  return (
    safe.nonce === 0 &&
    Boolean(
      getSafeMigrationDeployment({ network: safe.chainId, version: SAFE_TO_L2_MIGRATION_VERSION })?.networkAddresses[
        safe.chainId
      ],
    )
  )
}
