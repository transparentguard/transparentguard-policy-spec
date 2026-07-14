/**
 * @transparentguard/sdk
 *
 * Lazy-init TypeScript SDK for TransparentGuard.
 * Wraps OpenAI or Anthropic clients with zero boilerplate — no `await init()` required.
 * Policy loads and license check happen transparently on the first API call.
 *
 * @example
 * ```typescript
 * import { tg } from "@transparentguard/sdk";
 * import OpenAI from "openai";
 *
 * const client = tg.wrap(new OpenAI(), {
 *   policy: "./policies/production-hipaa.yaml",
 *   apiKey: process.env.TG_API_KEY,
 * });
 *
 * // Policy loads on first call — no await needed
 * const response = await client.chat.completions.create({
 *   model: "gpt-4o",
 *   messages: [{ role: "user", content: "Hello" }],
 * });
 * ```
 */

import {
  TransparentGuard,
  TransparentGuardError,
  type TransparentGuardOptions,
  type EvaluateOptions,
  type PolicyTestSuiteResult,
  type OpenAIClientLike,
  type OpenAIChatCompletionCreateParams,
  type OpenAIChatCompletion,
  type OpenAIChatCompletionChunk,
  type AnthropicClientLike,
  type AnthropicCreateParams,
  type AnthropicResponse,
  type AnthropicStreamEvent,
  type WrappedOpenAIClient,
  type WrappedAnthropicClient,
} from "@transparentguard/runtime";

// Re-export core types for consumers
export type {
  TransparentGuardOptions,
  EvaluateOptions,
  PolicyTestSuiteResult,
  OpenAIClientLike,
  OpenAIChatCompletionCreateParams,
  OpenAIChatCompletion,
  OpenAIChatCompletionChunk,
  AnthropicClientLike,
  AnthropicCreateParams,
  AnthropicResponse,
  AnthropicStreamEvent,
};

export { TransparentGuardError, TransparentGuard };

// ---------------------------------------------------------------------------
// Lazy init state per wrapped client
// ---------------------------------------------------------------------------

interface LazyState {
  guard: TransparentGuard | null;
  initPromise: Promise<TransparentGuard> | null;
}

function getOrInit(state: LazyState, options: TransparentGuardOptions): Promise<TransparentGuard> {
  if (state.guard !== null) return Promise.resolve(state.guard);
  if (state.initPromise !== null) return state.initPromise;

  const p = TransparentGuard.init(options).then((guard: TransparentGuard) => {
    state.guard = guard;
    state.initPromise = null;
    return guard;
  });
  state.initPromise = p;
  return p;
}

// ---------------------------------------------------------------------------
// Lazy-wrapped OpenAI client
// ---------------------------------------------------------------------------

export class LazyWrappedOpenAIClient {
  private readonly inner: OpenAIClientLike;
  private readonly options: TransparentGuardOptions;
  private readonly state: LazyState = { guard: null, initPromise: null };

  constructor(inner: OpenAIClientLike, options: TransparentGuardOptions) {
    this.inner = inner;
    this.options = options;
  }

  get chat() {
    return {
      completions: {
        create: this.createCompletion.bind(this) as typeof this.createCompletion,
      },
    };
  }

  createCompletion(
    params: OpenAIChatCompletionCreateParams & { stream?: false },
    evaluateOptions?: EvaluateOptions,
  ): Promise<OpenAIChatCompletion>;
  createCompletion(
    params: OpenAIChatCompletionCreateParams & { stream: true },
    evaluateOptions?: EvaluateOptions,
  ): Promise<AsyncGenerator<OpenAIChatCompletionChunk>>;
  async createCompletion(
    params: OpenAIChatCompletionCreateParams,
    evaluateOptions: EvaluateOptions = {},
  ): Promise<OpenAIChatCompletion | AsyncGenerator<OpenAIChatCompletionChunk>> {
    const guard = await getOrInit(this.state, this.options);
    const wrapped: WrappedOpenAIClient = guard.wrap(this.inner);
    return wrapped.createCompletion(
      params as OpenAIChatCompletionCreateParams & { stream?: false },
      evaluateOptions,
    );
  }

  /**
   * Run all inline tests declared in the policy's `tests` section.
   * Useful in CI pipelines to validate policy before deployment.
   */
  async test(): Promise<PolicyTestSuiteResult> {
    const guard = await getOrInit(this.state, this.options);
    return guard.test();
  }

  async flushAudit(): Promise<void> {
    if (this.state.guard !== null) await this.state.guard.flushAudit();
  }
}

// ---------------------------------------------------------------------------
// Lazy-wrapped Anthropic client
// ---------------------------------------------------------------------------

export class LazyWrappedAnthropicClient {
  private readonly inner: AnthropicClientLike;
  private readonly options: TransparentGuardOptions;
  private readonly state: LazyState = { guard: null, initPromise: null };

  constructor(inner: AnthropicClientLike, options: TransparentGuardOptions) {
    this.inner = inner;
    this.options = options;
  }

  get messages() {
    return {
      create: this.createMessage.bind(this) as typeof this.createMessage,
    };
  }

  createMessage(
    params: AnthropicCreateParams & { stream?: false },
    evaluateOptions?: EvaluateOptions,
  ): Promise<AnthropicResponse>;
  createMessage(
    params: AnthropicCreateParams & { stream: true },
    evaluateOptions?: EvaluateOptions,
  ): Promise<AsyncGenerator<AnthropicStreamEvent>>;
  async createMessage(
    params: AnthropicCreateParams,
    evaluateOptions: EvaluateOptions = {},
  ): Promise<AnthropicResponse | AsyncGenerator<AnthropicStreamEvent>> {
    const guard = await getOrInit(this.state, this.options);
    const wrapped: WrappedAnthropicClient = guard.wrap(this.inner);
    return wrapped.createMessage(
      params as AnthropicCreateParams & { stream?: false },
      evaluateOptions,
    );
  }

  async test(): Promise<PolicyTestSuiteResult> {
    const guard = await getOrInit(this.state, this.options);
    return guard.test();
  }

  async flushAudit(): Promise<void> {
    if (this.state.guard !== null) await this.state.guard.flushAudit();
  }
}

// ---------------------------------------------------------------------------
// SDK options
// ---------------------------------------------------------------------------

export interface SdkWrapOptions extends TransparentGuardOptions {
  policy: TransparentGuardOptions["policy"];
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isOpenAIClient(client: unknown): client is OpenAIClientLike {
  return (
    typeof client === "object" &&
    client !== null &&
    "chat" in client &&
    typeof (client as Record<string, unknown>)["chat"] === "object"
  );
}

function isAnthropicClient(client: unknown): client is AnthropicClientLike {
  return (
    typeof client === "object" &&
    client !== null &&
    "messages" in client &&
    typeof (client as Record<string, unknown>)["messages"] === "object"
  );
}

// ---------------------------------------------------------------------------
// Public API — wrap() factory
// ---------------------------------------------------------------------------

function wrap(client: OpenAIClientLike, options: SdkWrapOptions): LazyWrappedOpenAIClient;
function wrap(client: AnthropicClientLike, options: SdkWrapOptions): LazyWrappedAnthropicClient;
function wrap(
  client: OpenAIClientLike | AnthropicClientLike,
  options: SdkWrapOptions,
): LazyWrappedOpenAIClient | LazyWrappedAnthropicClient {
  const resolvedOptions: TransparentGuardOptions = {
    ...options,
    // Fall back to TG_API_KEY env var — accessed via globalThis for Node/Edge compat
    apiKey: options.apiKey ??
      (typeof process !== "undefined" ? process.env["TG_API_KEY"] : undefined),
  };

  if (isOpenAIClient(client)) {
    return new LazyWrappedOpenAIClient(client, resolvedOptions);
  }
  if (isAnthropicClient(client)) {
    return new LazyWrappedAnthropicClient(client, resolvedOptions);
  }
  throw new TransparentGuardError(
    "tg.wrap(): unrecognized client type. " +
    "Supported: OpenAI, Anthropic. " +
    "For other providers, use @transparentguard/runtime directly.",
    "policy_violation",
  );
}

/**
 * The TransparentGuard SDK entry point.
 *
 * @example
 * ```typescript
 * import { tg } from "@transparentguard/sdk";
 * import OpenAI from "openai";
 *
 * const client = tg.wrap(new OpenAI(), { policy: "./prod.yaml" });
 * ```
 */
export const tg = { wrap } as const;

export default tg;
