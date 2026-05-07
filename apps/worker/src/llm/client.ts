import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

export function gemini() {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set. Add to pookie/.env");
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

export const MODELS = {
  /** Form Q&A — high volume, latency-sensitive. Thinking disabled in callers. */
  forms: "gemini-2.5-flash" as const,
  /** Resume picker — single-shot classification. Thinking disabled in callers. */
  picker: "gemini-2.5-flash" as const,
  /** Cover letters — short generative writing. Small thinking budget for taste. */
  cover: "gemini-2.5-flash" as const,
};
