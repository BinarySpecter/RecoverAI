import type { AIProvider, FailureContext, AIAnalysisResult } from "@/lib/ai/provider"
import { buildDiagnosisPrompt, parseAnalysis } from "@/lib/ai/prompt"

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"

/** DeepSeek provider (OpenAI-compatible chat completions API). */
export class DeepSeekProvider implements AIProvider {
  readonly name = "deepseek"
  readonly model: string

  constructor(
    private apiKey: string,
    model = "deepseek-chat",
  ) {
    this.model = model
  }

  async analyzePaymentFailure(ctx: FailureContext): Promise<AIAnalysisResult> {
    const { system, user } = buildDiagnosisPrompt(ctx)
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS ?? 8000)),
    })
    if (!res.ok) throw new Error(`DeepSeek API error ${res.status}`)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = data.choices?.[0]?.message?.content ?? ""
    if (!text) throw new Error("Empty DeepSeek response")
    return parseAnalysis(text)
  }
}
