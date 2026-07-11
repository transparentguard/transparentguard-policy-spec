import { createRequire } from "module";
import { Router, type IRouter } from "express";
import multer from "multer";
import OpenAI from "openai";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfParse = require("pdf-parse") as (buf: Buffer, opts?: { max?: number }) => Promise<{ text: string }>;

const router: IRouter = Router();

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

// POST /api/extract
// Accepts multipart/form-data with field "files" (up to 5 files)
// Returns { text: string } — extracted content ready to be used as problem context
router.post(
  "/extract",
  upload.array("files", 5),
  async (req, res) => {
    const files = (req.files ?? []) as Express.Multer.File[];

    if (files.length === 0) {
      res.status(400).json({ error: "no files provided" });
      return;
    }

    const parts: string[] = [];

    for (const file of files) {
      try {
        if (file.mimetype === "application/pdf") {
          // Extract text — hard limit of 3 pages
          const data = await pdfParse(file.buffer, { max: 3 });
          const text = data.text.replace(/\s+/g, " ").trim();
          if (text.length > 0) {
            parts.push(`[from pdf "${file.originalname}"]\n${text}`);
          } else {
            // Scanned PDF with no extractable text — fall back to vision
            const base64 = file.buffer.toString("base64");
            const response = await client.chat.completions.create({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:application/pdf;base64,${base64}`,
                      },
                    },
                    {
                      type: "text",
                      text: "transcribe everything visible in this document exactly as it appears. include all text, numbers, equations, labels, and questions verbatim. describe any diagrams or visual elements clearly in plain language. do not add commentary or assume what kind of problem it is.",
                    },
                  ],
                },
              ],
              max_tokens: 2048,
            });
            const desc = response.choices[0]?.message?.content?.trim() ?? "";
            parts.push(`[from scanned pdf "${file.originalname}"]\n${desc}`);
          }
        } else if (file.mimetype.startsWith("image/")) {
          // Vision model reads the image and transcribes the problem precisely
          const base64 = file.buffer.toString("base64");
          const response = await client.chat.completions.create({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${file.mimetype};base64,${base64}`,
                    },
                  },
                  {
                    type: "text",
                    text: "transcribe everything in this image exactly as it appears. include all text, numbers, equations, answer choices, and questions verbatim. if there is a diagram, figure, or circuit, describe it clearly in plain language. do not add numbered sections, headers, or commentary. output plain continuous text only.",
                  },
                ],
              },
            ],
            max_tokens: 2048,
          });
          const desc = response.choices[0]?.message?.content?.trim() ?? "";
          if (desc) {
            parts.push(`[from image "${file.originalname}"]\n${desc}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "extraction failed";
        parts.push(`[could not read "${file.originalname}": ${msg}]`);
      }
    }

    res.json({ text: parts.join("\n\n") });
  }
);

export default router;
