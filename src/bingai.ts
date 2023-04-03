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
    }

    export async function createConversation(cookie: string): Promise<Conversation | string> {
        const conversation = await fetch("https://edgeservices.bing.com/edgesvc/turing/conversation/create", {
            "headers": {
                "cookie": cookie,
                'accept': 'application/json',
                'content-type': 'application/json',
                'x-forwarded-for': '1.1.1.1',
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

    export async function complete(session: string | Conversation, style: string, message: string): Promise<string | Response> {
        return await new Promise(async (resolve) => {
            if (typeof session == "string") {
                session = await createConversation(session)
                if (typeof session == "string") {
                    resolve(session)
                    return
                }
            }

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
                if (msgString.includes("firstNewMessageIndex")) {
                    if (ws)
                        ws.close()

                    const data: Response = JSON.parse(msgString)
                    console.log(data)
                    resolve(data)
                }
            })

            ws.accept()

            ws.send(JSON.stringify({
                "protocol": "json",
                "version": 1,
            })+"")

            const obj = {
                arguments: [
                    {
                        source: 'cib',
                        optionsSets: [
                            'nlu_direct_response_filter',
                            'deepleo',
                            'responsible_ai_policy_235',
                            'enablemm',
                            style,
                            'dtappid',
                            'cricinfo',
                            'cricinfov2',
                            'dv3sugg',
                        ],
                        sliceIds: [
                            '222dtappid',
                            '225cricinfo',
                            '224locals0',
                        ],
                        traceId: [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
                        isStartOfSession: !session.currentIndex,
                        message: {
                            author: 'user',
                            text: message,
                            messageType: !session.currentIndex ? 'SearchQuery' : 'Chat',
                        },
                        conversationSignature: session.conversationSignature,
                        participant: {
                            id: session.clientId,
                        },
                        conversationId: session.conversationId,
                    },
                ],
                invocationId: session.currentIndex ? session.currentIndex.toString() : "0",
                target: 'chat',
                type: 4,
            };
            ws.send(JSON.stringify(obj)+"");
        })
    }

    export function extractBody(response: Response): string {
        const reply = response.item?.messages[response.item?.messages.length-1]
        let data = reply.text || reply.hiddenText || "No response."
        data = data.replace(/\[\^\d+\^]/g, "").trim()
        if (reply.sourceAttributions && reply.sourceAttributions.length > 0) {
            data += "\n\nSources:"
            for (const i in reply.sourceAttributions) {
                const sourceAttribution = reply.sourceAttributions[i]
                data += `\n${parseInt(i)+1}. [${sourceAttribution.providerDisplayName}](${sourceAttribution.seeMoreUrl})`
            }
        }
        return data
    }

    export function extractSuggestions(response: Response) {
        const reply = response.item?.messages[response.item?.messages.length-1]
        if (reply.suggestedResponses && reply.suggestedResponses.length > 0) {
            return reply.suggestedResponses.map(s => s.text)
        }
        return []
    }
}
