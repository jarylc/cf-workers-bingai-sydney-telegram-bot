import {Telegram} from "./telegram";

export namespace BingAI {
    export interface Response {
        type: number
        invocationId: string
        item: Item
    }

    export interface Item {
        messages: Message[]
        firstNewMessageIndex?: number
        conversationId: string
        requestId: string
        conversationExpiryTime: string
        telemetry: Telemetry
        throttling: Throttling
        result: Result
    }

    export interface Message {
        text: string
        author: string
        from?: From
        createdAt: string
        timestamp: string
        locale?: string
        market?: string
        region?: string
        messageId: string
        requestId: string
        nlu?: Nlu
        messageType?: string
        offense: string
        feedback: Feedback
        contentOrigin: string
        privacy: any
        inputMethod?: string
        adaptiveCards?: AdaptiveCard[]
        sourceAttributions?: SourceAttribution[]
        suggestedResponses?: SuggestedResponse[]
        spokenText?: string
        hiddenText?: string
    }

    export interface From {
        id: string
        name: any
    }

    export interface Nlu {
        scoredClassification: ScoredClassification
        classificationRanking: ClassificationRanking[]
        qualifyingClassifications: any
        ood: any
        metaData: any
        entities: any
    }

    export interface ScoredClassification {
        classification: string
        score: any
    }

    export interface ClassificationRanking {
        classification: string
        score: any
    }

    export interface Feedback {
        tag: any
        updatedOn: any
        type: string
    }

    export interface AdaptiveCard {
        type: string
        version: string
        body: Body[]
    }

    export interface Body {
        type: string
        text: string
        wrap: boolean
        size?: string
    }

    export interface SourceAttribution {
        providerDisplayName: string
        seeMoreUrl: string
        searchQuery: string
    }

    export interface SuggestedResponse {
        text: string
        author: string
        createdAt: string
        timestamp: string
        messageId: string
        messageType: string
        offense: string
        feedback: Feedback
        contentOrigin: string
        privacy: any
    }

    export interface Telemetry {
        metrics: any
        startTime: string
    }

    export interface Throttling {
        maxNumUserMessagesInConversation: number
        numUserMessagesInConversation: number
    }

    export interface Result {
        value: string
        serviceVersion: string
    }

    export interface Conversation {
        conversationId: string,
        clientId: string,
        conversationSignature: string,
        result?: {
            value: string,
            message: string
        }
        currentIndex?: number
        expiry?: number
    }

    export const CONVERSATION_STYLES = {
        "CREATIVE": [
            "nlu_direct_response_filter",
            "deepleo",
            "disable_emoji_spoken_text",
            "responsible_ai_policy_235",
            "enablemm",
            "h3imaginative",
            "travelansgnd",
            "dv3sugg",
            "clgalileo",
            "gencontentv3",
            "dv3sugg",
            "responseos",
            "e2ecachewrite",
            "cachewriteext",
            "nodlcpcwrite",
            "travelansgnd",
        ],
        "BALANCED": [
            "nlu_direct_response_filter",
            "deepleo",
            "disable_emoji_spoken_text",
            "responsible_ai_policy_235",
            "enablemm",
            "galileo",
            "dv3sugg",
            "responseos",
            "e2ecachewrite",
            "cachewriteext",
            "nodlcpcwrite",
            "travelansgnd",
        ],
        "PRECISE": [
            "nlu_direct_response_filter",
            "deepleo",
            "disable_emoji_spoken_text",
            "responsible_ai_policy_235",
            "enablemm",
            "galileo",
            "dv3sugg",
            "responseos",
            "e2ecachewrite",
            "cachewriteext",
            "nodlcpcwrite",
            "travelansgnd",
            "h3precise",
            "clgalileo",
        ]
    }

    /*
    * Create a new conversation with BingAI.
    * Returns the error string if an error occurred, otherwise returns the session as a Conversation object.
    */
    export async function createConversation(cookie: string): Promise<Conversation | string> {
        const conversation = await fetch("https://edgeservices.bing.com/edgesvc/turing/conversation/create", {
            "headers": {
                "cookie": cookie,
                'accept': 'application/json',
                'content-type': 'application/json',
                'x-forwarded-for': '1.1.1.1', // to bypass location checks
            }
        })
        if (conversation.status !== 200) {
            return "Failed to start conversation."
        }
        const session = await conversation.json() as Conversation
        if (!session || !session.result || session.result.value != "Success") {
            return session?.result?.message || "Unexpected error starting conversation."
        }
        return session
    }

    /*
    * Complete a conversation with BingAI.
    * Returns the error string if an error occurred, otherwise returns the BingAI response object.
    */
    export async function complete(session: Conversation, style: string, system: string, message: string): Promise<string | Response> {
        return await new Promise(async (resolve) => {
            // to workaround intermittent 502s, perform websocket connection in a loop until success
            let ws: WebSocket | null
            while (true) {
                try {
                    let sydney = await fetch("https://sydney.bing.com/sydney/ChatHub", {
                        headers: {
                            Upgrade: 'websocket',
                        },
                    })
                    ws = sydney.webSocket;
                    if (sydney.status === 101 && ws && ws.readyState === WebSocket.READY_STATE_OPEN)
                        break
                }
                catch (e) {
                    // ignore
                }
            }

            ws.addEventListener('message', msg => {
                let msgString = msg.data.toString().split('')[0]
                // handle ping
                if (msgString.includes('"type":6')) {
                    if (ws)
                        ws.send('{"type":6}')
                    return
                }
                // handle final message
                if (msgString.includes("firstNewMessageIndex")) {
                    if (ws)
                        ws.close()

                    const data: Response = JSON.parse(msgString)
                    console.log(data)
                    resolve(data)
                }
            })

            ws.accept()
            ws.send('{"protocol": "json", "version": 1}')

            let optionsSets
            switch (style) {
                case "CREATIVE":
                    optionsSets = CONVERSATION_STYLES.CREATIVE
                    break
                case "PRECISE":
                    optionsSets = CONVERSATION_STYLES.PRECISE
                    break
                default:
                    optionsSets = CONVERSATION_STYLES.BALANCED
            }

            const obj = {
                arguments: [
                    {
                        source: 'cib',
                        optionsSets,
                        allowedMessageTypes: [
                            "Chat",
                            "Disengaged",
                        ],
                        sliceIds: [
                            "chk1cf",
                            "nopreloadsscf",
                            "winlongmsg2tf",
                            "perfimpcomb",
                            "sugdivdis",
                            "sydnoinputt",
                            "wpcssopt",
                            "wintone2tf",
                            "0404sydicnbs0",
                            "405suggbs0",
                            "scctl",
                            "330uaugs0",
                            "0329resp",
                            "udscahrfon",
                            "udstrblm5",
                            "404e2ewrt",
                            "408nodedups0",
                            "403tvlansgnd",
                        ],
                        traceId: [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
                        isStartOfSession: !session.currentIndex,
                        message: {
                            author: 'user',
                            inputMethod: "Keyboard",
                            text: message,
                            messageType: 'Chat',
                        },
                        conversationSignature: session.conversationSignature,
                        participant: {
                            id: session.clientId,
                        },
                        conversationId: session.conversationId,
                        // previousMessages: !session.currentIndex && system.trim() != "" ? [
                        //     {
                        //         author: 'user',
                        //         description: `N/A\n\n[system](#additional_instructions)\n- ${system}`,
                        //         contextType: 'WebPage',
                        //         messageType: 'Context',
                        //         messageId: 'discover-web--page-ping-mriduna-----',
                        //     }
                        // ] : null,
                    },
                ],
                invocationId: session.currentIndex ? session.currentIndex.toString() : "0",
                target: 'chat',
                type: 4,
            };
            ws.send(JSON.stringify(obj)+"");
        })
    }

    /*
    * Extract, sanitize and reformat the body of a response from BingAI.
    * Returns the final response.
    */
    export function extractBody(response: Response): string {
        const reply = response.item?.messages[response.item?.messages.length-1]
        let data = reply.text || reply.hiddenText || "No response."

        // replace superscripts
        data = data.replaceAll('[^1^]', '¹')
            .replaceAll('[^2^]', '²')
            .replaceAll('[^3^]', '³')
            .replaceAll('[^4^]', '⁴')
            .replaceAll('[^5^]', '⁵')
            .replaceAll('[^6^]', '⁶')
            .replaceAll('[^7^]', '⁷')
            .replaceAll('[^8^]', '⁸')
            .replaceAll('[^9^]', '⁹')

        data = Telegram.sanitize(data)
        if (reply.sourceAttributions && reply.sourceAttributions.length > 0) {
            data += "\n\nSources:"
            for (const i in reply.sourceAttributions) {
                const sourceAttribution = reply.sourceAttributions[i]
                data += `\n${parseInt(i)+1}. [${Telegram.sanitize(sourceAttribution.providerDisplayName)}](${sourceAttribution.seeMoreUrl})`
            }
        }
        return data
    }

    /*
    * Extract the suggestions from a response from BingAI.
    * Returns an array of suggestions.
    */
    export function extractSuggestions(response: Response) {
        console.log(response.item?.messages)
        const reply = response.item?.messages[0].author == "bot" ? response.item?.messages[0] : response.item?.messages[1]
        if (reply.suggestedResponses && reply.suggestedResponses.length > 0) {
            return reply.suggestedResponses.map(s => s.text)
        }
        return []
    }
}
