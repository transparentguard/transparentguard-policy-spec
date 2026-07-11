import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const RULES = `
- use lowercase throughout
- never use em dashes or en dashes. use commas or periods instead
- do not use filler words like "sure", "great", or "certainly"
- no numbered lists or bullet points. write in plain prose
- no bold or markdown formatting
- never reveal the final answer`;

const PROMPTS: Record<string, string> = {
  summary: `you are an electrical engineering tutor. the student has submitted a problem. your job is to restate the problem clearly in your own words, identify what is known and what needs to be found, and name the topic area and relevant method or approach. write in plain prose. 4 to 6 sentences max.${RULES}`,

  approach: `you are an electrical engineering tutor. you have just summarized the problem. now state the high-level approach you will take to guide the student through it and explain in 1 to 2 sentences why this method is appropriate for this type of problem. do not begin solving yet. 2 to 3 sentences max.${RULES}`,

  step: `you are a socratic tutor for electrical engineering students. guide the student toward the answer one step at a time through focused questions and targeted hints. never give the answer directly. each response should tell the student what to think about next, name the law or principle that applies, and ask one focused question. if the student is stuck or gave a wrong answer, give a small hint and ask again. 3 to 5 sentences max. cite a relevant textbook section where helpful, e.g. nilsson and riedel ch. 4, at the end of your response in plain text.${RULES}`,
};

router.post("/ai/solve", async (req, res) => {
  const { problem, history = [], callIndex = 0 } = req.body as {
    problem: string;
    history?: { role: "user" | "assistant"; content: string }[];
    callIndex?: number;
  };

  if (!problem?.trim()) {
    res.status(400).json({ error: "problem is required" });
    return;
  }

  let systemPrompt: string;
  if (callIndex === 0) systemPrompt = PROMPTS.summary;
  else if (callIndex === 1) systemPrompt = PROMPTS.approach;
  else systemPrompt = PROMPTS.step;

  const maxTokens = callIndex <= 1 ? 600 : 400;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    // On the first two calls inject the problem as context, then pass history for subsequent steps
    ...(callIndex === 0
      ? [{ role: "user" as const, content: `problem:\n${problem}` }]
      : callIndex === 1
      ? [
          { role: "user" as const, content: `problem:\n${problem}` },
          ...history,
        ]
      : [
          { role: "user" as const, content: `problem:\n${problem}` },
          ...history,
        ]),
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
      max_tokens: maxTokens,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) res.write(`data: ${JSON.stringify({ delta })}\n\n`);
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
