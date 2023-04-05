export namespace Telegram {
    export interface Update {
        update_id: string
        message?: Message
        inline_query?: InlineQuery
        callback_query?: CallbackQuery
    }

    export interface Message {
        message_id: string
        from: From
        chat: Chat
        text: string
        reply_to_message?: Message
    }

    export interface InlineQuery {
        id: string
        from: From
        query: string
    }

    export interface CallbackQuery {
        id: string
        inline_message_id: string
        chat_instance: string
        from: From
        data: string
    }

    export interface From {
        username: string
        id: string
    }

    export interface Chat {
        id: string
    }

    export function generateAnswerInlineQueryResponse(inlineQueryID: string, title: string, description: string, thumbURL: string, message: string, callback: string): Response {
        return new Response(JSON.stringify({
            "method": "answerInlineQuery",
            "inline_query_id": inlineQueryID,
            "results": [
                {
                    "type": "article",
                    "id": inlineQueryID,
                    "title": title,
                    "input_message_content": {
                        "message_text": `${message}`,
                        "parse_mode": "Markdown",
                    },
                    "reply_markup": {
                        "inline_keyboard": [
                            [
                                {
                                    "text": "Confirm?",
                                    "callback_data": callback
                                }
                            ]
                        ]
                    },
                    "description": description,
                    "thumb_url": thumbURL
                },
            ],
            "is_personal": true,
        }), {
            headers: {
                "content-type": "application/json",
            }
        })
    }

    export function generateAnswerCallbackQueryResponse(callbackQueryID: string, text: string): Response {
        return new Response(JSON.stringify({
            "method": "answerCallbackQuery",
            "callback_query_id": callbackQueryID,
            "text": text,
        }), {
            headers: {
                "content-type": "application/json",
            }
        })
    }

    export async function sendEditInlineMessageText(token: string, inlineMessageID: string, text: string): Promise<Response> {
        return fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                "inline_message_id": inlineMessageID,
                "text": text,
                "parse_mode": "Markdown",
            }),
        })
    }

    export function generateSendMessageResponse(chatID: string, data: string, additional_arguments?: { [key: string]: any }): Response {
        return new Response(JSON.stringify({
            "method": "sendMessage",
            "chat_id": chatID,
            "parse_mode": "Markdown",
            "text": data,
            ...additional_arguments
        }), {
            headers: {
                "content-type": "application/json",
            }
        })
    }

    export function sanitize(text: string): string {
        const split = text.split(/(```.*)/g)
        let inCodeBlock = false;
        for (const i in split) {
            const line = split[i]
            if (line.startsWith("```")) {
                inCodeBlock = !inCodeBlock
                continue
            }
            if (!inCodeBlock) {
                // ignore single line code blocks
                if (line.startsWith("`") && line.endsWith("`")) {
                    continue
                }
                split[i] = line.replaceAll("_", "\\_")
                    .replaceAll("*", "\\*")
                    .replaceAll("[", "｢")
                    .replaceAll("]", "｣")
                    .replaceAll("(", "❨")
                    .replaceAll(")", "❩")
            }
        }
        return split.join("")
    }
}

