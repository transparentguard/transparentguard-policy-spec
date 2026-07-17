"use strict";
/**
 * TransparentGuard — OpenAI Provider Adapter
 *
 * Covers: openai/gpt-4o, openai/gpt-4-turbo, openai/gpt-3.5-turbo, etc.
 * API spec: https://platform.openai.com/docs/api-reference/chat
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.openAIAdapter = void 0;
exports.openAIAdapter = {
    providerId: "openai",
    displayName: "OpenAI",
    isOpenAICompat: true,
    auth: {
        headerName: "Authorization",
        headerFormat: "Bearer {key}",
    },
    region: {
        regions: ["us-east-1", "eu-west-1", "ap-southeast-1"],
        jurisdiction: "US",
        trainingJurisdiction: "US",
    },
    capabilities: [
        "chat",
        "function_calling",
        "vision",
        "embeddings",
        "audio",
        "code",
        "streaming",
        "realtime",
    ],
    normalizeRequest(raw) {
        const msgs = raw["messages"] ?? [];
        const model = String(raw["model"] ?? "");
        return {
            messages: msgs.map((m) => ({
                role: m["role"],
                content: typeof m["content"] === "string" ? m["content"] : null,
                name: m["name"],
                tool_call_id: m["tool_call_id"],
            })),
            provider: `openai/${model}`,
            model,
            max_tokens: typeof raw["max_tokens"] === "number" ? raw["max_tokens"] : undefined,
        };
    },
    denormalizeRequest(payload, original) {
        return {
            ...original,
            messages: payload.messages.map((m) => ({
                role: m.role,
                content: m.content,
                ...(m.name ? { name: m.name } : {}),
                ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
            })),
        };
    },
    normalizeResponse(raw, model) {
        const choices = raw["choices"] ?? [];
        const firstChoice = choices[0] ?? {};
        const message = firstChoice["message"] ?? {};
        const usage = raw["usage"] ?? {};
        return {
            content: String(message["content"] ?? ""),
            provider: `openai/${model}`,
            model,
            usage: {
                prompt_tokens: typeof usage["prompt_tokens"] === "number"
                    ? usage["prompt_tokens"]
                    : undefined,
                completion_tokens: typeof usage["completion_tokens"] === "number"
                    ? usage["completion_tokens"]
                    : undefined,
                total_tokens: typeof usage["total_tokens"] === "number"
                    ? usage["total_tokens"]
                    : undefined,
            },
        };
    },
    denormalizeResponse(payload, original) {
        const orig = original;
        const choices = orig["choices"] ?? [];
        return {
            ...orig,
            choices: choices.map((choice, i) => {
                if (i === 0) {
                    return {
                        ...choice,
                        message: {
                            ...(choice["message"] ?? {}),
                            content: payload.content,
                        },
                    };
                }
                return choice;
            }),
        };
    },
};
//# sourceMappingURL=openai.js.map