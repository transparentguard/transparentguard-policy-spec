"use strict";
/**
 * TransparentGuard — Anthropic Provider Adapter
 *
 * Covers: anthropic/claude-3-5-sonnet, anthropic/claude-3-haiku, etc.
 * API spec: https://docs.anthropic.com/en/api/messages
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.anthropicAdapter = void 0;
exports.anthropicAdapter = {
    providerId: "anthropic",
    displayName: "Anthropic",
    isOpenAICompat: false,
    auth: {
        headerName: "x-api-key",
        headerFormat: "{key}",
        additionalHeaders: {
            "anthropic-version": "2023-06-01",
        },
    },
    region: {
        regions: ["us-east-1", "eu-west-3"],
        jurisdiction: "US",
        trainingJurisdiction: "US",
    },
    capabilities: [
        "chat",
        "function_calling",
        "vision",
        "code",
        "streaming",
    ],
    normalizeRequest(raw) {
        const msgs = raw["messages"] ?? [];
        const model = String(raw["model"] ?? "");
        const systemPrompt = raw["system"] ? String(raw["system"]) : undefined;
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }
        for (const m of msgs) {
            const content = m["content"];
            let text;
            if (typeof content === "string") {
                text = content;
            }
            else if (Array.isArray(content)) {
                text = content
                    .filter((b) => b["type"] === "text")
                    .map((b) => String(b["text"] ?? ""))
                    .join("\n");
            }
            else {
                text = "";
            }
            messages.push({
                role: m["role"],
                content: text,
            });
        }
        return {
            messages,
            provider: `anthropic/${model}`,
            model,
            max_tokens: typeof raw["max_tokens"] === "number" ? raw["max_tokens"] : undefined,
        };
    },
    denormalizeRequest(payload, original) {
        const systemMsg = payload.messages.find((m) => m.role === "system");
        const bodyMessages = payload.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role, content: m.content ?? "" }));
        return {
            ...original,
            messages: bodyMessages,
            ...(systemMsg ? { system: systemMsg.content } : {}),
        };
    },
    normalizeResponse(raw, model) {
        const content = raw["content"] ?? [];
        const text = content
            .filter((b) => b["type"] === "text")
            .map((b) => String(b["text"] ?? ""))
            .join("\n");
        const usage = raw["usage"] ?? {};
        return {
            content: text,
            provider: `anthropic/${model}`,
            model,
            usage: {
                prompt_tokens: typeof usage["input_tokens"] === "number"
                    ? usage["input_tokens"]
                    : undefined,
                completion_tokens: typeof usage["output_tokens"] === "number"
                    ? usage["output_tokens"]
                    : undefined,
            },
        };
    },
    denormalizeResponse(payload, original) {
        return {
            ...original,
            content: [{ type: "text", text: payload.content }],
        };
    },
};
//# sourceMappingURL=anthropic.js.map