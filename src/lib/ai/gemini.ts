import type { AIProvider, FailureContext, AIAnalysisResult } from "@/lib/ai/provider"
import { buildDiagnosisPrompt, parseAnalysis } from "@/lib/ai/prompt"

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"

/** Google Gemini provider (REST, no SDK dependency). */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini"
  readonly model: string

  constructor(
    private apiKey: string,
    model = "gemini-2.0-flash",
  ) {
    this.model = model
  }

  async analyzePaymentFailure(ctx: FailureContext): Promise<AIAnalysisResult> {
    const { system, user } = buildDiagnosisPrompt(ctx)
    const res = await fetch(`${GEMINI_URL}/${this.model}:generateContent?key=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS ?? 8000)),
    })
    if (!res.ok) throw new Error(`Gemini API error ${res.status}`)
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
    if (!text) throw new Error("Empty Gemini response")
    return parseAnalysis(text)
  }
}
