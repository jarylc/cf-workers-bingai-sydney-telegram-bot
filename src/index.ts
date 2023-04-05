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
		console.log(update)

		// user is not in whitelist
		const username = update.message?.from.username || update.inline_query?.from.username || update.callback_query?.from.username || ""
		if (env.TELEGRAM_USERNAME_WHITELIST && !env.TELEGRAM_USERNAME_WHITELIST.split(" ").includes(username)) {
			return new Response(null) // no action
		}

		// handle inline query confirmation flow
		if (update.inline_query) {
			if (update.inline_query.query.trim() === "") {
				return Telegram.generateAnswerInlineQueryResponse(update.inline_query?.id,
					"Start new Conversation with BingAI",
					"Clear context and start a new conversation",
					"https://gitlab.com/jarylc/cf-workers-bingai-sydney-telegram-bot/-/raw/master/cf-workers-bingai-sydney-telegram-bot.png",
					`Clear context and start a new conversation?`,
					'/clear')
			}
			const query = update.inline_query?.query
			return Telegram.generateAnswerInlineQueryResponse(update.inline_query?.id,
				"Query BingAI",
				"Send your query to BingAI (64 character limit, no context)",
				"https://gitlab.com/jarylc/cf-workers-bingai-sydney-telegram-bot/-/raw/master/cf-workers-bingai-sydney-telegram-bot.png",
				`Query: ${query}`,
				query)
		}

		// update is invalid
		if ((!update.message || !update.message.text) && (!update.callback_query)) {
			return new Response(null) // no action
		}
		const chatID = update.message?.chat.id || update.callback_query?.chat_instance || null
		if (chatID == null) {
			return new Response(null) // no action
		}
		const query = update.message?.text || update.callback_query?.data
		if (!query) {
			return new Response(null) // no action
		}

		// handle message only commands
		if (update.message && update.message.text) {
			// message starts with /start or /bingai
			if (query.startsWith("/start") || query.startsWith("/bingai") || query.startsWith("/sydney")) {
				return Telegram.generateSendMessageResponse(chatID, "Hi @"+ update.message.from.username+"! I'm a chatbot powered by Bing (a.k.a Sydney)! Reply your query to this message!",
					{
						"reply_markup": {
							"force_reply": true,
							"input_field_placeholder": "Ask me anything!",
							"selective": true,
						}
					}
				)
			}
		}
		// query starts with /clear
		if (query.startsWith("/clear")) {
			await Cloudflare.deleteKVChatSession(env.BINGAI_SYDNEY_TELEGRAM_BOT_KV, chatID)
			const content = "Context for the current chat (if it existed) has been cleared, starting a new conversation"
			if (update.callback_query) {
				await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, update.callback_query.inline_message_id, content)
				return Telegram.generateAnswerCallbackQueryResponse(update.callback_query.id, content)
			}
			return Telegram.generateSendMessageResponse(chatID, content, {
				"reply_markup": {
					"remove_keyboard": true,
				}
			})
		}

		// set temporary processing message if callback query
		if (update.callback_query) {
			await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, update.callback_query.inline_message_id, `Query: ${query}\n\nAnswer:\n(Processing...)`)
		}

		const session = await Cloudflare.getKVChatSession(env.BINGAI_SYDNEY_TELEGRAM_BOT_KV, chatID) || await BingAI.createConversation(env.BING_COOKIE)

		// generate message and respond accordingly
		let content = "Unexpected condition"
		let suggestions: string[] = []
		if (update.message) {
			if (typeof session !== "string") {
				[content, suggestions] = await complete(env, chatID, session, query)
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
		}
		if (update.callback_query) {
			const callbackQuery = update.callback_query
			ctx.waitUntil(new Promise(async _ => {
				// query OpenAPI with context
				if (typeof session !== "string") {
					[content, suggestions] = await complete(env, chatID, session, query)
				} else {
					content = session
				}

				// edit message with reply
				await Telegram.sendEditInlineMessageText(env.TELEGRAM_BOT_TOKEN, callbackQuery.inline_message_id, `Query: ${query}\n\nAnswer:\n${content}`)
			}))
			return Telegram.generateAnswerCallbackQueryResponse(callbackQuery.id, "Bing is processing...")
		}

		// other update
		return new Response(null) // no action (should never happen if allowed_updates is set correctly)
	},
}

enum CIRCLES {
	"RED" = "🔴",
	"AMBER" = "🟡",
	"GREEN" = "🟢"
}
async function complete(env: Env, chatID: string, session: BingAI.Conversation, query: string): Promise<[string, string[]]> {
	let response = await BingAI.complete(session, env.BING_CONVERSATION_STYLE, query)

	let content
	let suggestions: string[] = []

	if (typeof response !== "string") {
		content = BingAI.extractBody(response)
		content += "\n\n"
		if (response.item.throttling.numUserMessagesInConversation < response.item.throttling.maxNumUserMessagesInConversation) {
			session.currentIndex = response.item.throttling.numUserMessagesInConversation
			await Cloudflare.putKVChatSession(env.BINGAI_SYDNEY_TELEGRAM_BOT_KV, chatID, 21600, session) // conversations expire after 6h (or 21600 seconds)
			const percent = Math.round((response.item.throttling.numUserMessagesInConversation / response.item.throttling.maxNumUserMessagesInConversation))
			content += `${percent < 0.9 ? CIRCLES.GREEN : (percent < 1 ? CIRCLES.AMBER : CIRCLES.RED)} ${response.item.throttling.numUserMessagesInConversation} of ${response.item.throttling.maxNumUserMessagesInConversation} quota used for this conversation.`
			suggestions = BingAI.extractSuggestions(response)
		} else {
			await Cloudflare.deleteKVChatSession(env.BINGAI_SYDNEY_TELEGRAM_BOT_KV, chatID)
			content += "⚠️ This conversation has reached limits, forcing a new conversation."
		}
	} else {
		content = response
	}

	return [content, suggestions]
}
