import {BingAI} from "./bingai";

export namespace Cloudflare {
    export async function getKV(kv: KVNamespace, key: string): Promise<BingAI.Conversation | null> {
        if (!kv) {
            return null
        }
        return await kv.get(key, { type: "json" }) || null
    }

    export async function putKV(kv: KVNamespace, key: string, value: BingAI.Conversation, expiration: number | null = null) {
        if (!kv) {
            return
        }
        await kv.put(key, JSON.stringify(value), expiration ? {expiration: expiration} : {})
    }

    export async function deleteKV(kv: KVNamespace, key: string) {
        if (!kv) {
            return
        }
        await kv.delete(key)
    }
}
