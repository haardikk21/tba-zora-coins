import { Ether, Token, type Currency } from "@uniswap/sdk-core";
import { Pool, type PoolKey } from "@uniswap/v4-sdk";
import { erc20Abi, getContract, zeroAddress } from "viem";
import { base } from "viem/chains";
import { publicClient, stateView } from "./chain";

export async function loadData(key: PoolKey) {
    const [currency0, currency1] = await Promise.all([
        getCurrency(key.currency0),
        getCurrency(key.currency1)
    ])

    const poolId = Pool.getPoolId(currency0, currency1, key.fee, key.tickSpacing, key.hooks) as `0x${string}`;
    const [sqrtPriceX96, tick, _protocolFee, _lpFee] = await stateView.read.getSlot0([poolId]);
    const liquidity = await stateView.read.getLiquidity([poolId])


    const pool = new Pool(
        currency0,
        currency1,
        key.fee,
        key.tickSpacing,
        key.hooks,
        sqrtPriceX96.toString(),
        liquidity.toString(),
        tick,
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