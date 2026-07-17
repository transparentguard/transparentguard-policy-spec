"use strict";
/**
 * TransparentGuard — AWS Bedrock Provider Adapter
 *
 * Uses the Bedrock Converse API (unified interface across all Bedrock models).
 * Covers: bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0,
 *         bedrock/amazon.titan-text-premier-v1:0, etc.
 * API spec: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
 *
 * Bedrock Converse request format:
 * {
 *   "modelId": "anthropic.claude-3-sonnet-20240229-v1:0",
 *   "messages": [{ "role": "user", "content": [{ "text": "Hello" }] }],
 *   "system": [{ "text": "You are..." }],
 *   "inferenceConfig": { "maxTokens": 1024 }
 * }
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bedrockAdapter = void 0;
exports.bedrockAdapter = {
    providerId: "bedrock",
    displayName: "AWS Bedrock",
    isOpenAICompat: false,
    auth: {
        // Bedrock uses AWS SigV4 signing — the proxy handles auth at the transport layer.
        // This config covers the case where a pre-signed token or API key proxy is used.
        headerName: "Authorization",
        headerFormat: "AWS4-HMAC-SHA256 {key}",
        additionalHeaders: {
            "content-type": "application/json",
        },
    },
    region: {
        regions: [
            "us-east-1",
            "us-west-2",
            "eu-west-1",
            "eu-central-1",
            "ap-southeast-1",
            "ap-northeast-1",
        ],
        jurisdiction: "US",
        trainingJurisdiction: "US",
    },
    capabilities: [
        "chat",
        "function_calling",
        "vision",
        "code",
        "streaming",
        "embeddings",
    ],
    normalizeRequest(raw) {
        const messages = raw["messages"] ?? [];
        const system = raw["system"] ?? [];
        const modelId = String(raw["modelId"] ?? raw["model"] ?? "");
        const inferenceConfig = raw["inferenceConfig"] ?? {};
        const tpsMessages = [];
        // System blocks → single system message
        if (system.length > 0) {
            const sysText = system
                .filter((b) => typeof b.text === "string")
                .map((b) => b.text ?? "")
                .join("\n");
            if (sysText)
                tpsMessages.push({ role: "system", content: sysText });
        }
        for (const msg of messages) {
            const text = msg.content
                .filter((b) => typeof b.text === "string")
                .map((b) => b.text)
                .join("\n");
            tpsMessages.push({ role: msg.role, content: text });
        }
        return {
            messages: tpsMessages,
            provider: `bedrock/${modelId}`,
            model: modelId,
            max_tokens: typeof inferenceConfig["maxTokens"] === "number"
                ? inferenceConfig["maxTokens"]
                : undefined,
        };
    },
    denormalizeRequest(payload, original) {
        const systemMsg = payload.messages.find((m) => m.role === "system");
        const bodyMessages = payload.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
            role: m.role,
            content: [{ text: m.content ?? "" }],
        }));
        return {
            ...original,
            messages: bodyMessages,
            ...(systemMsg
                ? { system: [{ text: systemMsg.content ?? "" }] }
                : {}),
        };
    },
    normalizeResponse(raw, model) {
        const output = raw["output"] ?? {};
        const message = output["message"] ?? {};
        const content = message["content"] ?? [];
        const text = content
            .filter((b) => typeof b.text === "string")
            .map((b) => b.text)
            .join("\n");
        const usage = raw["usage"] ?? {};
        return {
            content: text,
            provider: `bedrock/${model}`,
            model,
            usage: {
                prompt_tokens: typeof usage["inputTokens"] === "number"
                    ? usage["inputTokens"]
                    : undefined,
                completion_tokens: typeof usage["outputTokens"] === "number"
                    ? usage["outputTokens"]
                    : undefined,
                total_tokens: typeof usage["totalTokens"] === "number"
                    ? usage["totalTokens"]
                    : undefined,
            },
        };
    },
    denormalizeResponse(payload, original) {
        const orig = original;
        const output = orig["output"] ?? {};
        const message = output["message"] ?? {};
        return {
            ...orig,
            output: {
                ...output,
                message: {
                    ...message,
                    content: [{ text: payload.content }],
                },
            },
        };
    },
};
//# sourceMappingURL=bedrock.js.map