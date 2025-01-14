import { CompatibilityFunctions, CompatibilityToken } from "@/compatibility"
import { SystemEvent } from "@polkadot-api/observable-client"
import { PolkadotSigner } from "@polkadot-api/polkadot-signer"
import {
  Binary,
  Enum,
  HexString,
  SS58String,
} from "@polkadot-api/substrate-bindings"
import { Observable } from "rxjs"

export type TxEvent = TxSigned | TxBroadcasted | TxBestBlocksState | TxFinalized
export type TxBroadcastEvent =
  | TxSigned
  | TxBroadcasted
  | TxBestBlocksState
  | TxFinalized

export type TxSigned = { type: "signed"; txHash: HexString }

export type TxBroadcasted = { type: "broadcasted"; txHash: HexString }

export type TxBestBlocksState = {
  type: "txBestBlocksState"
  txHash: HexString
} & (TxInBestBlocksNotFound | TxInBestBlocksFound)

export type TxInBestBlocksNotFound = {
  found: false
  isValid: boolean
}

export type TxInBestBlocksFound = {
  found: true
} & TxEventsPayload

export type TxEventsPayload = {
  /**
   * Verify if extrinsic was successful, i.e. check if `System.ExtrinsicSuccess`
   * is found.
   */
  ok: boolean
  /**
   * Array of all events emitted by the tx. Ordered as they are emitted
   * on-chain.
   */
  events: Array<SystemEvent["event"]>
  /**
   * Block information where the tx is found. `hash` of the block, `number` of
   * the block, `index` of the tx in the block.
   */
  block: { hash: string; number: number; index: number }
} & (
  | {
      ok: true
      dispatchError?: undefined
    }
  | {
      ok: false
      dispatchError: {
        type: string
        value: unknown
      }
    }
)

export type TxFinalized = {
  type: "finalized"
  txHash: HexString
} & TxEventsPayload

export type TxOptions<Asset> = Partial<
  void extends Asset
    ? {
        /**
         * Block to target the transaction against. Default: `"finalized"`
         */
        at: HexString | "best" | "finalized"
        /**
         * Tip in fundamental units. Default: `0`
         */
        tip: bigint
        /**
         * Mortality of the transaction. Default: `{ mortal: true, period: 64 }`
         */
        mortality: { mortal: false } | { mortal: true; period: number }
        /**
         * Custom nonce for the transaction. Default: retrieve from latest known
         * finalized block.
         */
        nonce: number
      }
    : {
        /**
         * Block to target the transaction against. Default: `"finalized"`
         */
        at: HexString | "best" | "finalized"
        /**
         * Tip in fundamental units. Default: `0`
         */
        tip: bigint
        /**
         * Mortality of the transaction. Default: `{ mortal: true, period: 64 }`
         */
        mortality: { mortal: false } | { mortal: true; period: number }
        /**
         * Asset information to pay fees, tip, etc. By default it'll use the
         * native token of the chain.
         */
        asset: Asset
        /**
         * Custom nonce for the transaction. Default: retrieve from latest known
         * finalized block.
         */
        nonce: number
      }
>

export type TxFinalizedPayload = Omit<TxFinalized, "type">
export type TxPromise<Asset> = (
  from: PolkadotSigner,
  txOptions?: TxOptions<Asset>,
) => Promise<TxFinalizedPayload>

export type TxObservable<Asset> = (
  from: PolkadotSigner,
  txOptions?: TxOptions<Asset>,
) => Observable<TxEvent>

export interface TxCall {
  /**
   * SCALE-encoded callData of the transaction.
   *
   * @returns Promise resolving in the encoded data.
   */
  (): Promise<Binary>
  /**
   * SCALE-encoded callData of the transaction.
   *
   * @param compatibilityToken  Token from got with `await
   *                            typedApi.compatibilityToken`
   * @returns Synchronously returns encoded data.
   */
  (compatibilityToken: CompatibilityToken): Binary
}

export type TxSignFn<Asset> = (
  from: PolkadotSigner,
  txOptions?: TxOptions<Asset>,
) => Promise<HexString>

export type Transaction<
  Arg extends {} | undefined,
  Pallet extends string,
  Name extends string,
  Asset,
> = {
  /**
   * Pack the transaction, sends it to the signer, and return the signature
   * asynchronously. If the signer fails (or the user cancels the signature)
   * it'll throw an error.
   *
   * @param from       `PolkadotSigner`-compliant signer.
   * @param txOptions  Optionally pass any number of txOptions.
   * @returns Encoded `SignedExtrinsic` ready for broadcasting.
   */
  sign: TxSignFn<Asset>
  /**
   * Observable-based all-in-one transaction submitting. It will sign,
   * broadcast, and track the transaction. The observable is singlecast, i.e.
   * it will sign, broadcast, etc at every subscription. It will complete once
   * the transaction is found in a `finalizedBlock`.
   *
   * @param from       `PolkadotSigner`-compliant signer.
   * @param txOptions  Optionally pass any number of txOptions.
   * @returns Observable to the transaction.
   */
  signSubmitAndWatch: TxObservable<Asset>
  /**
   * Pack the transaction, sends it to the signer, broadcast, and track the
   * transaction. The promise will resolve as soon as the transaction in found
   * in a `finalizedBlock`. If the signer fails (or the user cancels the
   * signature), or the transaction becomes invalid it'll throw an error.
   *
   * @param from       `PolkadotSigner`-compliant signer.
   * @param txOptions  Optionally pass any number of txOptions.
   * @returns Finalized transaction information.
   */
  signAndSubmit: TxPromise<Asset>
  /**
   * SCALE-encoded callData of the transaction.
   */
  getEncodedData: TxCall
  /**
   * Estimate fees against the latest known `finalizedBlock`
   *
   * @param from       Public key or address from the potencial sender.
   * @param txOptions  Optionally pass any number of txOptions.
   * @returns Fees in fundamental units.
   */
  getEstimatedFees: (
    from: Uint8Array | SS58String,
    txOptions?: TxOptions<Asset>,
  ) => Promise<bigint>
  /**
   * PAPI way of expressing an extrinsic with arguments.
   * It's useful to pass as a parameter to extrinsics that accept calls.
   */
  decodedCall: Enum<{ [P in Pallet]: Enum<{ [N in Name]: Arg }> }>
}

export interface TxEntry<
  D,
  Arg extends {} | undefined,
  Pallet extends string,
  Name extends string,
  Asset,
> extends CompatibilityFunctions<D> {
  /**
   * Synchronously create the transaction object ready to sign, submit, estimate
   * fees, etc.
   *
   * @param args  All parameters required by the transaction.
   * @returns Transaction object.
   */
  (
    ...args: Arg extends undefined ? [] : [data: Arg]
  ): Transaction<Arg, Pallet, Name, Asset>
}
