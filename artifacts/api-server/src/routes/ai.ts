import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// POST /api/ai/solve
// Body: { problem: string, context?: string, history?: { role: string, content: string }[] }
// Streams back newline-delimited JSON chunks: { delta: string } or { done: true }
router.post("/ai/solve", async (req, res) => {
  const { problem, context, history = [] } = req.body as {
    problem: string;
    context?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };

  if (!problem?.trim()) {
    res.status(400).json({ error: "problem is required" });
    return;
  }

  const systemPrompt = `you are a socratic tutor for electrical engineering students. your job is to guide students to the answer through questions and hints — never give the answer directly. be concise, precise, and encouraging. use lowercase. when referencing equations, wrap them in backticks. cite relevant textbook sections when helpful (e.g. nilsson & riedel ch. 4).

rules:
- ask one focused question at a time
- if the student is stuck, give a small hint then ask again
- never reveal the final answer
- keep responses short — 2-4 sentences max per card`;

  const userContent = context
    ? `problem: ${problem}\n\nadditional context: ${context}`
    : `problem: ${problem}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userContent },
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const stream = await client.chat.completions.create({
      model: "deepseek/deepseek-r1",
      messages,
      stream: true,
      max_tokens: 512,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "ai error";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

export default router;
