import { getExplorerLink } from '@safe-global/utils/utils/gateway'
import type { SafeVersion } from '@safe-global/types-kit'
import type { SingletonDeployment } from '@safe-global/safe-deployments'
import { getSafeMigrationDeployment, getSafeSingletonDeployment } from '@safe-global/safe-deployments'
import semverCoerce from 'semver/functions/coerce'
import semverGt from 'semver/functions/gt'
import semverSatisfies from 'semver/functions/satisfies'
import { LATEST_SAFE_VERSION } from '@safe-global/utils/config/constants'
import type { Chain } from '@safe-global/store/gateway/AUTO_GENERATED/chains'

export enum FEATURES {
  ERC721 = 'ERC721',
  SAFE_APPS = 'SAFE_APPS',
  DOMAIN_LOOKUP = 'DOMAIN_LOOKUP',
  SPENDING_LIMIT = 'SPENDING_LIMIT',
  EIP1559 = 'EIP1559',
  SAFE_TX_GAS_OPTIONAL = 'SAFE_TX_GAS_OPTIONAL',
  TX_SIMULATION = 'TX_SIMULATION',
  DEFAULT_TOKENLIST = 'DEFAULT_TOKENLIST',
  RELAYING = 'RELAYING',
  EIP1271 = 'EIP1271',
  RISK_MITIGATION = 'RISK_MITIGATION',
  PUSH_NOTIFICATIONS = 'PUSH_NOTIFICATIONS',
  NATIVE_WALLETCONNECT = 'NATIVE_WALLETCONNECT',
  RECOVERY = 'RECOVERY',
  COUNTERFACTUAL = 'COUNTERFACTUAL',
  DELETE_TX = 'DELETE_TX',
  SPEED_UP_TX = 'SPEED_UP_TX',
  SAP_BANNER = 'SAP_BANNER',
  NATIVE_SWAPS = 'NATIVE_SWAPS',
  NATIVE_SWAPS_USE_COW_STAGING_SERVER = 'NATIVE_SWAPS_USE_COW_STAGING_SERVER',
  NATIVE_SWAPS_FEE_ENABLED = 'NATIVE_SWAPS_FEE_ENABLED',
  NATIVE_SWAPS_COW = 'NATIVE_SWAPS_COW',
  ZODIAC_ROLES = 'ZODIAC_ROLES',
  STAKING = 'STAKING',
  STAKING_PROMO = 'STAKING_PROMO',
  MULTI_CHAIN_SAFE_CREATION = 'MULTI_CHAIN_SAFE_CREATION',
  MULTI_CHAIN_SAFE_ADD_NETWORK = 'MULTI_CHAIN_SAFE_ADD_NETWORK',
  PROPOSERS = 'PROPOSERS',
  TARGETED_SURVEY = 'TARGETED_SURVEY',
  BRIDGE = 'BRIDGE',
  RENEW_NOTIFICATIONS_TOKEN = 'RENEW_NOTIFICATIONS_TOKEN',
  TX_NOTES = 'TX_NOTES',
  NESTED_SAFES = 'NESTED_SAFES',
  MASS_PAYOUTS = 'MASS_PAYOUTS',
  SPACES = 'SPACES',
  EARN = 'EARN',
  EARN_PROMO = 'EARN_PROMO',
  MIXPANEL = 'MIXPANEL',
  POSITIONS = 'POSITIONS',
  PORTFOLIO_ENDPOINT = 'PORTFOLIO_ENDPOINT',
  NATIVE_COW_SWAP_FEE_V2 = 'NATIVE_COW_SWAP_FEE_V2',
  CSV_TX_EXPORT = 'CSV_TX_EXPORT',
  SAFE_LABS_TERMS_DISABLED = 'SAFE_LABS_TERMS_DISABLED',
  NO_FEE_NOVEMBER = 'NO_FEE_NOVEMBER',
  HYPERNATIVE = 'HYPERNATIVE',
  HYPERNATIVE_RELAX_GUARD_CHECK = 'HYPERNATIVE_RELAX_GUARD_CHECK',
  HYPERNATIVE_QUEUE_SCAN = 'HYPERNATIVE_QUEUE_SCAN',
  EURCV_BOOST = 'EURCV_BOOST',
}

const MIN_SAFE_VERSION = '1.3.0'

/** Prefer at least this SafeMigration library when resolving delegate-call upgrades (stale CGW / env can stay on 1.4.1). */
const SAFE_MIGRATION_LIBRARY_MIN_VERSION = '1.5.0' as const

export const hasFeature = (chain: Pick<Chain, 'features'>, feature: FEATURES): boolean => {
  return (chain.features as string[]).includes(feature)
}

export const getBlockExplorerLink = (
  chain: Pick<Chain, 'blockExplorerUriTemplate'>,
  address: string,
): { href: string; title: string } | undefined => {
  if (chain.blockExplorerUriTemplate) {
    return getExplorerLink(address, chain.blockExplorerUriTemplate)
  }
}
/** This version is used if a network does not have the LATEST_SAFE_VERSION deployed yet */
const FALLBACK_SAFE_VERSION = '1.3.0' as const

/**
 * Same as `getSafeMigrationDeployment` but falls back when `network` is absent from the registry yet — required for
 * chains (e.g. Kaia Kairos 1001) where v1.5.0 `networkAddresses` may lag v1.4.1 (same pattern as mapping `to` in safe-migrations.ts).
 */
export const resolveSafeMigrationDeploymentForChain = (
  version: string,
  chainId: string | number | bigint | undefined,
): SingletonDeployment | undefined => {
  const id = chainId === undefined || chainId === null || chainId === '' ? undefined : String(chainId)
  if (!id) {
    return getSafeMigrationDeployment({ version, released: true })
  }
  return (
    getSafeMigrationDeployment({ version, released: true, network: id }) ??
    getSafeMigrationDeployment({ version, released: true })
  )
}

/** True when we can resolve a SafeMigration `to` address for this version + chain (see resolveSafeMigrationDeploymentForChain). */
const hasSafeMigrationDeploymentOnChain = (version: string, chainId: string | number | bigint | undefined): boolean => {
  const deployment = resolveSafeMigrationDeploymentForChain(version, chainId)
  if (!deployment) {
    return false
  }
  const id = chainId === undefined || chainId === null || chainId === '' ? undefined : String(chainId)
  if (!id) {
    return !!deployment.defaultAddress
  }
  return !!(deployment.networkAddresses?.[id] ?? deployment.defaultAddress)
}

const capVersionByDeployedSingleton = (
  chainId: string | number | bigint | undefined,
  candidateVersion: string,
): SafeVersion => {
  const net = chainId === undefined || chainId === null || chainId === '' ? undefined : String(chainId)
  const latestDeploymentVersion = (getSafeSingletonDeployment({ network: net, released: true })?.version ??
    FALLBACK_SAFE_VERSION) as SafeVersion

  if (semverSatisfies(latestDeploymentVersion, `<=${candidateVersion}`)) {
    return latestDeploymentVersion
  } else {
    return candidateVersion as SafeVersion
  }
}

export const getLatestSafeVersion = (
  chain: Pick<Chain, 'recommendedMasterCopyVersion' | 'chainId'> | undefined,
): SafeVersion => {
  const latestSafeVersion = chain?.recommendedMasterCopyVersion || LATEST_SAFE_VERSION

  return capVersionByDeployedSingleton(chain?.chainId, latestSafeVersion)
}

/**
 * Version used to resolve the SafeMigration library for upgrades. Takes the higher of
 * `recommendedMasterCopyVersion` and build-time `NEXT_PUBLIC_SAFE_VERSION` / `LATEST_SAFE_VERSION`
 * so a wallet build targeting a newer singleton still migrates via the matching SafeMigration when CGW lags.
 *
 * If `safe-deployments` lists a SafeMigration deployment for that target on this chain,
 * we use it — even when singleton metadata for the chain still tops out at an older release (common on custom
 * networks). Otherwise we fall back to the same cap as {@link getLatestSafeVersion} (max singleton in the package).
 *
 * Additionally enforces {@link SAFE_MIGRATION_LIBRARY_MIN_VERSION} so CGW `recommendedMasterCopyVersion` and
 * `NEXT_PUBLIC_SAFE_VERSION` pinned to **1.4.1** do not prevent using the **1.5.0** SafeMigration library when it is
 * deployed on-chain (common on Kaia / fork stacks).
 */
export const getTargetVersionForSafeMigration = (
  chain: Pick<Chain, 'recommendedMasterCopyVersion' | 'chainId'> | undefined,
): SafeVersion => {
  console.log('[SafeMigration] getTargetVersionForSafeMigration called', {
    chainId: chain?.chainId,
    recommendedMasterCopyVersion: chain?.recommendedMasterCopyVersion,
    LATEST_SAFE_VERSION,
    SAFE_MIGRATION_LIBRARY_MIN_VERSION,
  })
  const trimmed = chain?.recommendedMasterCopyVersion?.trim()
  const configuredLatest = (() => {
    if (!trimmed) {
      return LATEST_SAFE_VERSION
    }
    const a = semverCoerce(trimmed)
    const b = semverCoerce(LATEST_SAFE_VERSION)
    if (!a || !b) {
      return trimmed
    }
    return semverGt(b, a) ? LATEST_SAFE_VERSION : trimmed
  })()

  const migrationLibraryVersion = (() => {
    const min = semverCoerce(SAFE_MIGRATION_LIBRARY_MIN_VERSION)
    const cur = semverCoerce(configuredLatest)
    if (!min || !cur) {
      return configuredLatest
    }
    return semverGt(min, cur) ? SAFE_MIGRATION_LIBRARY_MIN_VERSION : configuredLatest
  })()

  console.log('[SafeMigration] versions computed', { configuredLatest, migrationLibraryVersion })

  const hasDeployment = hasSafeMigrationDeploymentOnChain(migrationLibraryVersion, chain?.chainId)
  console.log('[SafeMigration] hasSafeMigrationDeploymentOnChain', {
    migrationLibraryVersion,
    chainId: chain?.chainId,
    hasDeployment,
  })

  if (hasDeployment) {
    console.log('[SafeMigration] -> returning', migrationLibraryVersion)
    return migrationLibraryVersion as SafeVersion
  }

  const cappedSingletonVersion = capVersionByDeployedSingleton(chain?.chainId, migrationLibraryVersion)
  console.log('[SafeMigration] cappedSingletonVersion', cappedSingletonVersion)

  /**
   * Singleton registry may still top out at 1.4.1 for a chain while SafeMigration **library** 1.5.0 is already
   * available (canonical default). In that case {@link capVersionByDeployedSingleton} returns 1.4.1 — too low for
   * migrating to a 1.5.0 singleton; prefer {@link SAFE_MIGRATION_LIBRARY_MIN_VERSION} when it resolves on-chain.
   */
  const minLib = semverCoerce(SAFE_MIGRATION_LIBRARY_MIN_VERSION)
  const cappedSingleton = semverCoerce(cappedSingletonVersion)

  if (
    minLib &&
    cappedSingleton &&
    semverGt(minLib, cappedSingleton) &&
    hasSafeMigrationDeploymentOnChain(SAFE_MIGRATION_LIBRARY_MIN_VERSION, chain?.chainId)
  ) {
    console.log('[SafeMigration] -> fallback to SAFE_MIGRATION_LIBRARY_MIN_VERSION', SAFE_MIGRATION_LIBRARY_MIN_VERSION)
    return SAFE_MIGRATION_LIBRARY_MIN_VERSION as SafeVersion
  }

  console.log('[SafeMigration] -> returning cappedSingletonVersion', cappedSingletonVersion)
  return cappedSingletonVersion
}

export const isNonCriticalUpdate = (version?: string | null) => {
  return version && semverSatisfies(version, `>= ${MIN_SAFE_VERSION}`)
}
