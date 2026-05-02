import Anthropic from '@anthropic-ai/sdk';
import { ExtractionSchema, type Extraction } from '@/lib/schema';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT =
  'You are a careful assistant that reads school communications for busy parents. ' +
  'Your task is to extract only the information that matters to a parent. ' +
  'Return valid JSON only. Do not include commentary, markdown, or backticks.';

function buildUserMessage(text: string, todayDate: string): string {
  return `Today's date is ${todayDate}.

Read this school communication and extract what matters. Return valid JSON matching this schema exactly:
{
  "title": "short descriptive title",
  "communication_type": "newsletter|excursion|reminder|payment|event|uniform|general update|other",
  "summary": ["bullet point 1", "bullet point 2"],
  "action_items": [{"task": "", "due_date": "", "priority": "high|medium|low", "applies_to": "", "source_snippet": ""}],
  "events": [{"name": "", "date": "", "time": "", "location": "", "source_snippet": ""}],
  "things_to_bring": [{"item": "", "date_needed": "", "source_snippet": ""}],
  "payments_or_forms": [{"item": "", "amount": "", "due_date": "", "source_snippet": ""}],
  "flags": [],
  "ambiguities": []
}

Rules:
- Do not invent details not present in the text
- Use empty arrays [] for fields with no content — never null or missing keys
- source_snippet must be a verbatim short phrase (5–15 words) copied directly from the original text — do not paraphrase or summarise
- For dates, use the most specific form available (e.g. "14 May 2026" not "next week")
- Return JSON only — no other text before or after

School communication:
${text}`;
}

function cleanJsonText(raw: string): string {
  let s = raw.trim();
  // Strip markdown code fences
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  // If still not starting with {, find the first JSON object
  if (!s.startsWith('{')) {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start !== -1 && end > start) s = s.slice(start, end + 1);
  }
  return s;
}

export async function extractFromEmail(text: string, todayDate: string): Promise<Extraction> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(text, todayDate) }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected non-text response from Claude');

  const jsonText = cleanJsonText(block.text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(
      `Claude returned invalid JSON. Raw response (first 200 chars): ${block.text.slice(0, 200)}`
    );
  }

  return ExtractionSchema.parse(parsed);
}
