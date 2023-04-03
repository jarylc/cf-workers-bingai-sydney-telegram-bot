import {BingAI} from "./bingai"
import {Telegram} from "./telegram"
import {Cloudflare} from "./cloudflare";

export interface Env {
	BINGAI_SYDNEY_TELEGRAM_BOT_KV: KVNamespace
	TELEGRAM_BOT_TOKEN: string
	TELEGRAM_USERNAME_WHITELIST: string
	BING_COOKIE: string
	BING_CONVERSATION_STYLE: string
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
				await Cloudflare.deleteKVChatSession(env.BINGAI_SYDNEY_TELEGRAM_BOT_KV, update.message.chat.id)
				return Telegram.generateSendMessageResponse(update.message.chat.id, "Context for the current chat (if it existed) has been cleared.", {
					"reply_markup": {
						"remove_keyboard": true,
					}
				})
			}
		}

		if (update.message) {
			// query OpenAPI with context
			let content = "Unexpected error"
			let suggestions: string[] = []
			const session = await Cloudflare.getKVChatSession(env.BINGAI_SYDNEY_TELEGRAM_BOT_KV, update.message.chat.id) || await BingAI.createConversation(env.BING_COOKIE)
			if (typeof session !== "string") {
				let response = await BingAI.complete(session, env.BING_CONVERSATION_STYLE, query)
				if (typeof response !== "string") {
					content = BingAI.extractBody(response)
					content += "\n\n"
					if (response.item.throttling.numUserMessagesInConversation < response.item.throttling.maxNumUserMessagesInConversation) {
						session.currentIndex = response.item.throttling.numUserMessagesInConversation
						await Cloudflare.putKVChatSession(env.BINGAI_SYDNEY_TELEGRAM_BOT_KV, update.message.chat.id, session)
						content += `(${response.item.throttling.numUserMessagesInConversation} / ${response.item.throttling.maxNumUserMessagesInConversation})`
					} else {
						await Cloudflare.deleteKVChatSession(env.BINGAI_SYDNEY_TELEGRAM_BOT_KV, update.message.chat.id)
						content += "NOTE: This conversation has reached limits, forcing a new conversation."
					}

					suggestions = BingAI.extractSuggestions(response)
				}
			} else {
				content = session
			}

			if (suggestions.length > 0) {
				return Telegram.generateSendMessageResponse(update.message.chat.id, content, {
					"reply_to_message_id": update.message.message_id,
					"reply_markup": {
						"keyboard": suggestions.map(suggestion => [{text: suggestion}]),
						"one_time_keyboard": true,
						"selective": true,
					}
				})
			}

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
				let content = await BingAI.complete(env.BING_COOKIE, env.BING_CONVERSATION_STYLE, query)
				if (typeof content !== "string") {
					content = BingAI.extractBody(content)
				}

				// edit message with reply
				await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, callbackQuery.inline_message_id, query, content)
			}))
			return Telegram.generateAnswerCallbackQueryResponse(callbackQuery.id)
		}

		// other update
		return new Response(null) // no action (should never happen if allowed_updates is set correctly)
	},
}
