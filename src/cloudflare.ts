import {BingAI} from "./bingai";

export namespace Cloudflare {
    export async function getKVChatSession(kv: KVNamespace, chat_id: string): Promise<BingAI.Conversation | null> {
        if (!kv) {
            return null
        }
        return await kv.get(chat_id, { type: "json" }) || null
    }

    export async function putKVChatSession(kv: KVNamespace, chat_id: string, context: BingAI.Conversation) {
        if (!kv) {
            return
        }
        await kv.put(chat_id, JSON.stringify(context))
    }

    export async function deleteKVChatSession(kv: KVNamespace, chat_id: string) {
        if (!kv) {
            return
        }
        await kv.delete(chat_id)
    }
}
