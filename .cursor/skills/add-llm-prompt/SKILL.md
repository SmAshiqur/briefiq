---
name: add-llm-prompt
description: Add a new structured-output LLM prompt to the BriefIQ NestJS backend using Vercel AI SDK + Zod + OpenRouter. Use when adding a new AI step (e.g., extracting structured facts from text, classifying user input, summarizing changes), writing a new generateObject call, or wiring an LLM into a service.
---

# Add an LLM Prompt

## When to use

You are adding a new AI step to BriefIQ — query understanding, snapshot extraction, delta verdict, briefing summarization, or anything that turns text into structured data.

## Workflow

```
- [ ] 1. Define the Zod schema for the output
- [ ] 2. Write the system prompt + 1 worked example
- [ ] 3. Add the method to the appropriate service
- [ ] 4. Wire it into the caller (controller / processor)
- [ ] 5. Write a unit test with a mocked model
- [ ] 6. Add error handling: 429 backoff + cascade to free-model fallback
```

## Step 1: Zod schema

Colocate the schema with the service file that uses it.

```ts
import { z } from 'zod';

export const QueryUnderstanding = z.object({
  intent: z.enum(['trend', 'event', 'policy', 'listing', 'price']),
  signal_definition: z.string().describe('What counts as a meaningful change.'),
  suggested_sources: z.array(z.string()).max(5),
  suggested_frequency: z.enum(['hourly', 'daily', 'weekly']),
});
export type QueryUnderstanding = z.infer<typeof QueryUnderstanding>;
```

`.describe()` on each field doubles as documentation for the LLM.

## Step 2: System prompt

Put the prompt as a `const` at the top of the service file. Include 1 worked example for fragile tasks.

```ts
const SYSTEM_PROMPT = `You analyze natural-language tracking queries.
Identify intent, define what counts as a meaningful change, suggest credible
sources, and pick a check frequency.

EXAMPLE
Input: "Track dollar rate in Bangladesh"
Output: {
  intent: "trend",
  signal_definition: "Notify on rate change > 1 BDT or material policy news",
  suggested_sources: ["Bangladesh Bank", "The Daily Star"],
  suggested_frequency: "daily"
}`;
```

## Step 3: Service method

```ts
@Injectable()
export class LlmService {
  constructor(private readonly router: OpenAIProvider) {}

  async understandQuery(text: string): Promise<QueryUnderstanding> {
    const { object } = await generateObject({
      model: this.router(process.env.LLM_MODEL!),
      schema: QueryUnderstanding,
      system: SYSTEM_PROMPT,
      prompt: text,
    });
    return object;
  }
}
```

## Step 4: Error handling

Wrap LLM calls in the shared helper that:

- Retries 429 with exponential backoff (1s, 2s, 4s)
- Cascades through `FREE_MODEL_CASCADE` (`deepseek-chat:free` → `qwen3-coder-480b:free` → `gpt-oss-20b:free`)
- Throws `LlmExhaustedError` if all fail; the caller logs and degrades the cycle to "no fresh briefing"

```ts
const result = await withFreeTierFallback(() =>
  this.llm.understandQuery(text)
);
```

## Step 5: Test

```ts
it('returns parsed QueryUnderstanding for a price query', async () => {
  const fake = mockGenerateObject({ intent: 'price', /* ... */ });
  const out = await service.understandQuery('Track iPhone price in BD');
  expect(out.intent).toBe('price');
  expect(out.suggested_frequency).toBe('daily');
});
```

## Anti-patterns

- Calling `generateText` and JSON-parsing yourself. Always `generateObject`.
- Hard-coding model names. Read from `process.env.LLM_MODEL`.
- Inlining prompts in controllers. Keep them in the service file.
- Skipping the test. LLM behavior silently regresses.
- Forgetting `.describe()` on schema fields — the LLM uses them as field hints.
