import {BingAI} from "./bingai"
import {Telegram} from "./telegram"

export interface Env {
	TELEGRAM_BOT_TOKEN: string
	TELEGRAM_USERNAME_WHITELIST: string
	BING_COOKIE: string
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		if (request.cf?.asOrganization !== "Telegram Messenger Inc" || !request.url.endsWith(env.TELEGRAM_BOT_TOKEN)) {
			return new Response(null, {
				status: 401,
			})
		}

		const update: Telegram.Update = await request.json()

		// user is not in whitelist
		const username = update.message?.from.username || update.inline_query?.from.username || update.callback_query?.from.username || ""
		if (env.TELEGRAM_USERNAME_WHITELIST && !env.TELEGRAM_USERNAME_WHITELIST.split(" ").includes(username)) {
			return new Response(null) // no action
		}

		// handle inline query confirmation flow
		if (update.inline_query) {
			if (update.inline_query.query.trim() === "") {
				return new Response(null) // no action
			}
			return Telegram.generateAnswerInlineQueryResponse(update.inline_query?.id, update.inline_query?.query)
		}

		// update is invalid
		if ((!update.message || !update.message.text) && (!update.callback_query)) {
			return new Response(null) // no action
		}
		const query = update.message?.text || update.callback_query?.data
		if (!query) {
			return new Response(null) // no action
		}

		// set temporary processing message if callback query
		if (update.callback_query) {
			await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, update.callback_query.inline_message_id, query, "(Processing...)")
		}

		if (update.message && update.message.text) {
			// message starts with /start or /bingai
			if (query.startsWith("/start") || query.startsWith("/bingai") || query.startsWith("/sydney")) {
				return Telegram.generateSendMessageResponse(update.message.chat.id, "Hi @"+ update.message.from.username+"! I'm a chatbot powered by Bing (a.k.a Sydney)! Reply your query to this message!",
					{
						"reply_markup": {
							"force_reply": true,
							"input_field_placeholder": "Ask me anything!",
							"selective": true,
						}
					}
				)
			}

			// message starts with /clear
			if (query.startsWith("/clear")) {
				return Telegram.generateSendMessageResponse(update.message.chat.id, "ForcedReply keyboard cleared.", {
					"reply_markup": {
						"remove_keyboard": true,
					}
				})
			}
		}

		if (update.message) {
			// query OpenAPI with context
			const content = await BingAI.complete(env.BING_COOKIE, query)

			return Telegram.generateSendMessageResponse(update.message.chat.id, content, {
				"reply_to_message_id": update.message.message_id,
				"reply_markup": {
					"remove_keyboard": true,
				}
			})
		} else if (update.callback_query) {
			const callbackQuery = update.callback_query
			ctx.waitUntil(new Promise(async _ => {
				// query OpenAPI with context
				const content = await BingAI.complete(env.BING_COOKIE, query)

				// edit message with reply
				await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, callbackQuery.inline_message_id, query, content)
			}))
			return Telegram.generateAnswerCallbackQueryResponse(callbackQuery.id)
		}

		// other update
		return new Response(null) // no action (should never happen if allowed_updates is set correctly)
	},
}

const genRanHex = (size: number) => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
