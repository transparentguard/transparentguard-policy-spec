import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const RULES = `
- speak directly to the person using "you" and "your". never refer to them in the third person
- never use the word "student". address the person directly
- use lowercase throughout for all prose
- never use em dashes or en dashes. use commas or periods instead
- do not use filler words like "sure", "great", or "certainly"
- no numbered lists or bullet points. write in plain prose
- no bold or markdown formatting in prose
- always write ALL mathematical expressions, equations, variables, and symbols in LaTeX notation. wrap inline math in $...$ and display equations on their own line in $...$. never write math in word form. for example write $\\frac{k}{s^2+k^2}$ not "k divided by s squared plus k squared", write $V_{th}$ not "Vth", write $\\omega_0 = \\frac{1}{\\sqrt{LC}}$ not "omega naught equals one over root LC"
- never reveal the final answer`;

const PROMPTS: Record<string, string> = {
  summary: `you are an electrical engineering tutor. someone has submitted a problem for you to help them work through. restate the problem clearly to them in your own words, tell them what is known and what needs to be found, and name the topic area and relevant method. write in plain prose addressed directly to the person. always end with a short question asking if they understand the problem and are ready to work through it. 4 to 6 sentences max.${RULES}`,

  approach: `you are an electrical engineering tutor. you have just summarized the problem. tell the person what high-level approach you will take to guide them through it and explain why this method fits. do not begin solving yet. always end with a question that asks them to confirm they are comfortable with this approach, or asks them what they already know about the method. 3 to 4 sentences max.${RULES}`,

  step: `you are a socratic tutor for electrical engineering. guide the person toward the answer one step at a time through focused questions and targeted hints. never give the answer directly. each response should tell them what to think about next, name the law or principle that applies, and always end with exactly one focused question for them to answer. if they are stuck or gave a wrong answer, give a small hint and end with a question. if this is the final step and the answer is reached, state the result clearly but still end with a question asking them to reflect on the method or check their understanding. 3 to 5 sentences max. cite a relevant textbook section where helpful, e.g. nilsson and riedel ch. 4, at the end before your question.${RULES}`,
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

  // Gemini 2.5 Flash for fast analysis cards; R1 for deep Socratic steps
  const model = callIndex <= 1 ? "google/gemini-2.5-flash" : "deepseek/deepseek-r1";
  const maxTokens = callIndex <= 1 ? 600 : 1024;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user" as const, content: `problem:\n${problem}` },
    ...history,
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const stream = await client.chat.completions.create({
      model,
      messages,
      stream: true,
      max_tokens: maxTokens,
    });

    for await (const chunk of stream) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delta = chunk.choices[0]?.delta as any;
      const content: string = delta?.content ?? "";
      const reasoning: string = delta?.reasoning_content ?? "";
      if (content) {
        res.write(`data: ${JSON.stringify({ delta: content })}\n\n`);
      } else if (reasoning) {
        // Keep connection alive during R1 thinking phase
        res.write(`: thinking\n\n`);
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

// POST /api/ai/title
// Returns a short 4-7 word title for the problem
router.post("/ai/title", async (req, res) => {
  const { problem } = req.body as { problem: string };
  if (!problem?.trim()) {
    res.status(400).json({ error: "problem is required" });
    return;
  }
  try {
    const completion = await client.chat.completions.create({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: "generate a short title of 4 to 7 words that describes this problem. lowercase only. no punctuation. no filler words. output only the title, nothing else.",
        },
        { role: "user", content: problem },
      ],
      max_tokens: 30,
      stream: false,
    });
    const title = completion.choices[0]?.message?.content?.trim() ?? "";
    res.json({ title });
  } catch (err) {
    const message = err instanceof Error ? err.message : "title generation failed";
    res.status(500).json({ error: message });
  }
});

export default router;
