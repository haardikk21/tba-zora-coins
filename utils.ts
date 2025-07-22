import { Ether, Token, type Currency } from "@uniswap/sdk-core";
import { Pool, type PoolKey } from "@uniswap/v4-sdk";
import { erc20Abi, getContract, zeroAddress } from "viem";
import { base } from "viem/chains";
import { publicClient, stateView } from "./chain";
import { Tick, TickMath } from "@uniswap/v3-sdk";



export async function loadData(key: PoolKey) {
    const [currency0, currency1] = await Promise.all([
        getCurrency(key.currency0),
        getCurrency(key.currency1)
    ])

    const poolId = Pool.getPoolId(currency0, currency1, key.fee, key.tickSpacing, key.hooks) as `0x${string}`;
    const [sqrtPriceX96, tick, _protocolFee, _lpFee] = await stateView.read.getSlot0([poolId]);
    const liquidity = await stateView.read.getLiquidity([poolId])

    function tickToWord(tick: number): number {
        let compressed = Math.floor(tick / key.tickSpacing)
        if (tick < 0 && tick % key.tickSpacing !== 0) {
            compressed -= 1
        }
        return compressed >> 8
    }

    const minWord = tickToWord(TickMath.MIN_TICK)
    const maxWord = tickToWord(TickMath.MAX_TICK)

    const bitmapPromises: Promise<bigint>[] = [];
    const wordPosIndices: number[] = [];
    for (let i = minWord; i <= maxWord; i++) {
        wordPosIndices.push(i)
        bitmapPromises.push(stateView.read.getTickBitmap([poolId, i]))
    }
    const bitmaps = await Promise.all(bitmapPromises)

    const tickIndices: number[] = []
    for (let j = 0; j < wordPosIndices.length; j++) {
        const ind = wordPosIndices[j]!;
        const bitmap = bitmaps[j]!;

        if (bitmap !== 0n) {
            for (let i = 0; i < 256; i++) {
                const bit = 1n
                const initialized = (bitmap & (bit << BigInt(i))) !== 0n
                if (initialized) {
                    const tickIndex = (ind * 256 + i) * key.tickSpacing
                    tickIndices.push(tickIndex)
                }
            }
        }
    }

    const tickInfoPromises: Promise<readonly [bigint, bigint, bigint, bigint]>[] = [];
    for (const index of tickIndices) {
        tickInfoPromises.push(stateView.read.getTickInfo([poolId, index]))
    }
    const tickInfos = await Promise.all(tickInfoPromises)
    const allTicks: Tick[] = []

    for (let i = 0; i < tickIndices.length; i++) {
        const index = tickIndices[i]!
        const tickInfo = tickInfos[i]!
        const tick = new Tick({
            index,
            liquidityGross: tickInfo[0].toString(),
            liquidityNet: tickInfo[1].toString()
        })
        allTicks.push(tick)
    }

    const pool = new Pool(
        currency0,
        currency1,
        key.fee,
        key.tickSpacing,
        key.hooks,
        sqrtPriceX96.toString(),
        liquidity.toString(),
        tick,
        allTicks
    )
    return pool;
}

export async function getCurrency(address: string): Promise<Currency> {
    if (address === zeroAddress) {
        return Ether.onChain(base.id);
    }

    const erc20 = getContract({
        abi: erc20Abi,
        address: address as `0x${string}`,
        client: publicClient
    })

    const [name, symbol, decimals] = await Promise.all([
        erc20.read.name(),
        erc20.read.symbol(),
        erc20.read.decimals()
    ])

    return new Token(base.id, address, decimals, symbol, name)
}