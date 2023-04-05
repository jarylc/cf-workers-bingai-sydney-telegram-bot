import {BingAI} from "./bingai";

export namespace Cloudflare {
    export async function getKV(kv: KVNamespace, chat_id: string): Promise<BingAI.Conversation | null> {
        if (!kv) {
            return null
        }
        return await kv.get(chat_id, { type: "json" }) || null
    }

    export async function putKV(kv: KVNamespace, chat_id: string, expiration: number, context: BingAI.Conversation) {
        if (!kv) {
            return
        }
        await kv.put(chat_id, JSON.stringify(context), {expiration})
    }

    export async function deleteKV(kv: KVNamespace, chat_id: string) {
        if (!kv) {
            return
        }
        await kv.delete(chat_id)
    }
}
