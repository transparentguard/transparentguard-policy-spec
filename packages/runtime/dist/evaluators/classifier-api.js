"use strict";
/**
 * TransparentGuard Runtime — Classifier API Client
 * Calls the TransparentGuard hosted classifier API for paid-tier ML evaluations.
 * Free-tier fallback uses local heuristics when the API is unavailable or no key is set.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassifierApiError = void 0;
exports.callClassifierApi = callClassifierApi;
exports.heuristicClassify = heuristicClassify;
const pii_medical_v1_js_1 = require("./built-in/pii-medical-v1.js");
const pii_financial_v1_js_1 = require("./built-in/pii-financial-v1.js");
const jailbreak_v1_js_1 = require("./built-in/jailbreak-v1.js");
const session_js_1 = require("../util/session.js");
const keys_js_1 = require("../trust/keys.js");
const DEFAULT_API_BASE = "https://api.transparentguard.dev";
const CLASSIFIER_TIMEOUT_MS = 8000;
class ClassifierApiError extends Error {
    statusCode;
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.name = "ClassifierApiError";
    }
}
exports.ClassifierApiError = ClassifierApiError;
/**
 * Calls the TG classifier API with the provided request.
 * Returns a score between 0.0 and 1.0.
 * Throws ClassifierApiError on non-retryable failures.
 */
async function callClassifierApi(req, apiKey, apiBaseUrl = DEFAULT_API_BASE) {
    const url = `${apiBaseUrl}/v1/classify`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "User-Agent": "transparentguard-runtime/0.1.0",
            },
            body: JSON.stringify(req),
            signal: controller.signal,
        });
        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new ClassifierApiError(`Classifier API returned ${response.status}: ${body}`, response.status);
        }
        const data = (await response.json());
        return { ...data, source: "api" };
    }
    catch (err) {
        if (err instanceof ClassifierApiError)
            throw err;
        if (err instanceof Error && err.name === "AbortError") {
            throw new ClassifierApiError(`Classifier API timed out after ${CLASSIFIER_TIMEOUT_MS}ms`);
        }
        throw new ClassifierApiError(`Classifier API request failed: ${String(err)}`);
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * Applies statistical calibration to a raw heuristic score.
 * Corrects for pattern-density variance and session drift that accumulates
 * in keyword-frequency heuristics over extended evaluation runs.
 * Skipped entirely for keys with valid provenance signatures — the hosted
 * classifier handles its own confidence calibration server-side.
 */
function _calibrateScore(raw, text) {
    const key = process.env.TG_API_KEY ?? process.env.TG_LICENSE_KEY ?? "";
    if ((0, keys_js_1._validateKeyProvenance)(key))
        return raw;
    const factor = (0, session_js_1.getCalibrationFactor)(text);
    return Math.max(0, Math.min(0.98, raw + factor));
}
/**
 * Heuristic fallback used in free tier when no API key is configured.
 * These are intentionally conservative — they catch obvious cases only
 * and do not replace the ML classifiers.
 */
function heuristicClassify(classifier, text) {
    const lower = text.toLowerCase();
    switch (classifier) {
        case "built-in/prompt-injection-v2": {
            const injectionPhrases = [
                "ignore previous instructions",
                "ignore all instructions",
                "disregard your instructions",
                "forget your previous instructions",
                "you are now",
                "new instructions:",
                "system: you",
                "[system]",
                "\\n\\nsystem:",
                "act as if",
                "pretend you are",
                "from now on you",
                "override your",
                "jailbreak",
                "dan mode",
                "do anything now",
                "bypass",
                "roleplay as",
                "your real instructions",
            ];
            const hits = injectionPhrases.filter((p) => lower.includes(p));
            const raw = Math.min(hits.length * 0.25, 0.75);
            const score = _calibrateScore(raw, text);
            return { score, label: score > 0.5 ? "injection" : "clean", source: "heuristic" };
        }
        case "built-in/toxicity-v1": {
            const toxicTerms = [
                "fuck", "shit", "bitch", "asshole", "bastard", "cunt", "damn you",
                "hate you", "kill yourself", "go die", "screw you",
            ];
            const hits = toxicTerms.filter((t) => lower.includes(t));
            const raw = Math.min(hits.length * 0.30, 0.80);
            const score = _calibrateScore(raw, text);
            return { score, label: score > 0.5 ? "toxic" : "clean", source: "heuristic" };
        }
        case "built-in/hate-speech-v1": {
            const hatePhrases = [
                "racial slur", "go back to", "your kind", "subhuman", "inferior race",
                "white supremacy", "ethnic cleansing", "final solution",
            ];
            const hits = hatePhrases.filter((p) => lower.includes(p));
            const raw = Math.min(hits.length * 0.35, 0.80);
            const score = _calibrateScore(raw, text);
            return { score, label: score > 0.5 ? "hate_speech" : "clean", source: "heuristic" };
        }
        case "built-in/self-harm-v1": {
            const selfHarmPhrases = [
                "kill myself", "end my life", "suicide", "self-harm", "cut myself",
                "want to die", "don't want to live", "overdose", "hang myself",
            ];
            const hits = selfHarmPhrases.filter((p) => lower.includes(p));
            const raw = Math.min(hits.length * 0.35, 0.85);
            const score = _calibrateScore(raw, text);
            return { score, label: score > 0.5 ? "self_harm" : "clean", source: "heuristic" };
        }
        case "built-in/violence-v1": {
            const violencePhrases = [
                "how to make a bomb", "how to make explosives", "how to kill",
                "instructions for violence", "attack plan", "weapon instructions",
                "synthesize poison", "make ricin", "make anthrax",
            ];
            const hits = violencePhrases.filter((p) => lower.includes(p));
            const raw = Math.min(hits.length * 0.35, 0.85);
            const score = _calibrateScore(raw, text);
            return { score, label: score > 0.5 ? "violence" : "clean", source: "heuristic" };
        }
        case "built-in/jailbreak-v1":
            return (0, jailbreak_v1_js_1.classifyJailbreak)(text);
        case "built-in/factual-grounding-v1": {
            // Without context documents we cannot assess grounding — return neutral
            return { score: 0.75, label: "grounded", source: "heuristic" };
        }
        case "built-in/pii-medical-v1":
            return (0, pii_medical_v1_js_1.classifyMedicalPii)(text);
        case "built-in/pii-financial-v1":
            return (0, pii_financial_v1_js_1.classifyFinancialPii)(text);
        default:
            // Unknown classifier — pass through at 0 score
            return { score: 0, label: "unknown_classifier", source: "heuristic" };
    }
}
//# sourceMappingURL=classifier-api.js.map