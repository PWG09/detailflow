import { z } from 'zod';

export const vehicleAssessmentSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'unknown']),
  paintCondition: z.enum(['good', 'fair', 'poor', 'unknown']),
  interiorCondition: z.enum(['good', 'fair', 'poor', 'unknown']),
  notes: z.string().max(1000),
  recommendedChecks: z.array(z.string().max(120)).max(10),
  confidence: z.number().min(0).max(1),
});
export type VehicleAssessment = z.infer<typeof vehicleAssessmentSchema>;

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

function parseModelJson(content: unknown): VehicleAssessment {
  if (typeof content !== 'string') {
    throw new Error('NVIDIA returned an empty AI response.');
  }

  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('NVIDIA returned a non-JSON AI response.');
    try {
      value = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new Error('NVIDIA returned malformed JSON.');
    }
  }

  const parsed = vehicleAssessmentSchema.safeParse(value);
  if (!parsed.success) throw new Error('NVIDIA returned an invalid assessment format.');
  return parsed.data;
}

function mimeForImage(imageBytes: Uint8Array) {
  if (imageBytes[0] === 0x89 && imageBytes[1] === 0x50 && imageBytes[2] === 0x4e && imageBytes[3] === 0x47) return 'image/png';
  if (imageBytes[0] === 0xff && imageBytes[1] === 0xd8) return 'image/jpeg';
  return 'image/jpeg';
}

export async function assessVehicle(images: Uint8Array[], signal?: AbortSignal): Promise<VehicleAssessment> {
  if (signal?.aborted) throw new Error('AI assessment timed out.');
  if (!images.length) throw new Error('No vehicle photos were available for AI analysis.');

  const apiKey = process.env.AI_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || NVIDIA_BASE_URL).replace(/\/$/, '');
  const model = process.env.AI_MODEL || process.env.OPENAI_VISION_MODEL || NVIDIA_MODEL;

  if (!apiKey) throw new Error('AI API key is not configured in Vercel.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  const abortForwarder = signal ? () => controller.abort() : undefined;
  signal?.addEventListener('abort', abortForwarder!);

  try {
    const imageParts = images.slice(0, 4).map((bytes, index) => ({
      type: 'image_url',
      image_url: { url: `data:${mimeForImage(bytes)};base64,${Buffer.from(bytes).toString('base64')}` },
      ...(index === 0 ? {} : {}),
    }));

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: [
              'You are DetailFlow, an AI assistant for professional auto detailers.',
              'Analyze the provided vehicle photos for detailing intake only.',
              'Do not identify a person, infer hidden damage, or invent details that are not visible.',
              'If something cannot be determined from the photos, use unknown.',
              'Return ONLY one valid JSON object with exactly these fields:',
              'severity: low|medium|high|unknown',
              'paintCondition: good|fair|poor|unknown',
              'interiorCondition: good|fair|poor|unknown',
              'notes: string, maximum 1000 characters',
              'recommendedChecks: array of at most 10 short strings',
              'confidence: number from 0 to 1.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Assess these vehicle photos for an auto-detailing intake. Focus on visible paint, exterior/interior condition when visible, obvious cleaning/detailing needs, and useful inspection checks. Return JSON only.',
              },
              ...imageParts,
            ],
          },
        ],
        max_tokens: 1200,
        temperature: 0.2,
        top_p: 0.95,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      let detail = raw.slice(0, 500);
      try {
        const errorJson = JSON.parse(raw);
        detail = errorJson?.error?.message || errorJson?.message || detail;
      } catch {}
      throw new Error(`NVIDIA API ${response.status}: ${detail}`);
    }

    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error('NVIDIA returned an invalid HTTP response.');
    }

    return parseModelJson(json?.choices?.[0]?.message?.content);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('NVIDIA AI request timed out after 90 seconds.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal && abortForwarder) signal.removeEventListener('abort', abortForwarder);
  }
}
