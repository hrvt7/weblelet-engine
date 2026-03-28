import Anthropic from "@anthropic-ai/sdk";
import type { LLMAnalysis, TechnicalScan } from "@/lib/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts";

const MODEL = "claude-sonnet-4-20250514";

export async function runLLMAnalysis(params: {
  url: string;
  domain: string;
  businessType: string;
  technicalScan: TechnicalScan;
  geoScore: number;
  seoScore: number;
}): Promise<{ analysis: LLMAnalysis; tokensUsed: number }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const userPrompt = buildUserPrompt({
    url: params.url,
    domain: params.domain,
    businessType: params.businessType,
    technicalScan: params.technicalScan as unknown as Record<string, unknown>,
    geoScore: params.geoScore,
    seoScore: params.seoScore,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textContent = response.content.find(c => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("LLM válasz nem tartalmaz szöveget");
  }

  // Extract JSON from response (handle potential markdown wrapping)
  let jsonText = textContent.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: LLMAnalysis;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`LLM válasz nem valid JSON: ${(e as Error).message}\n\nVálasz: ${jsonText.substring(0, 500)}`);
  }

  const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  return { analysis: parsed, tokensUsed };
}
