import { firstValueFromWithSignal } from "@/utils"
import { toHex } from "@polkadot-api/utils"
import { map, mergeMap } from "rxjs"
import { ChainHead$ } from "@polkadot-api/observable-client"
import { CompatibilityHelper, IsCompatible } from "./runtime"

type CallOptions = Partial<{
  at: string
  signal: AbortSignal
}>

type WithCallOptions<Args extends Array<any>> = Args["length"] extends 0
  ? [options?: CallOptions]
  : [...args: Args, options?: CallOptions]

export interface RuntimeCall<Args extends Array<any>, Payload> {
  /**
   * Get `Payload` (Promise-based) for the runtime call.
   *
   * @param args  All keys needed for that runtime call.
   *              At the end, optionally set which block to target (latest
   *              known finalized is the default) and an AbortSignal.
   */
  (...args: WithCallOptions<Args>): Promise<Payload>
  /**
   * `isCompatible` enables you to check whether or not the call you're trying
   * to make is compatible with the descriptors you generated on dev time.
   * In this case the function waits for `Runtime` to load, and returns
   * asynchronously.
   */
  isCompatible: IsCompatible
}

const isOptionalArg = (lastArg: any) => {
  if (typeof lastArg !== "object") return false

  return Object.keys(lastArg).every(
    (k) =>
      (k === "at" && typeof lastArg.at === "string") ||
      (k === "signal" && lastArg.signal instanceof AbortSignal),
  )
}

export const createRuntimeCallEntry = (
  api: string,
  method: string,
  chainHead: ChainHead$,
  compatibilityHelper: CompatibilityHelper,
): RuntimeCall<any, any> => {
  const { isCompatible, compatibleRuntime$ } = compatibilityHelper((ctx) =>
    ctx.checksumBuilder.buildRuntimeCall(api, method),
  )
  const callName = `${api}_${method}`
  const checksumError = () =>
    new Error(`Incompatible runtime entry RuntimeCall(${callName})`)

  const fn = (...args: Array<any>) => {
    const lastArg = args[args.length - 1]
    const isLastArgOptional = isOptionalArg(lastArg)
    const { signal, at: _at }: CallOptions = isLastArgOptional ? lastArg : {}
    const at = _at ?? null

    const result$ = compatibleRuntime$(chainHead, at, checksumError).pipe(
      mergeMap((ctx) => {
        const codecs = ctx.dynamicBuilder.buildRuntimeCall(api, method)
        return chainHead
          .call$(at, callName, toHex(codecs.args.enc(args)))
          .pipe(map(codecs.value.dec))
      }),
    )

    return firstValueFromWithSignal(result$, signal)
  }

  return Object.assign(fn, { isCompatible })
}
