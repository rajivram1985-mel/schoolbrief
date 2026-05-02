import { z } from 'zod';

// .default('') on optional string fields prevents Zod parse failures when
// Claude omits or nulls a field — LLMs inevitably drift from strict schemas.

export const ActionItemSchema = z.object({
  task: z.string().default(''),
  due_date: z.string().default(''),
  priority: z.string().default('medium'),
  applies_to: z.string().default(''),
  source_snippet: z.string().default(''),
});

export const EventSchema = z.object({
  name: z.string().default(''),
  date: z.string().default(''),
  time: z.string().default(''),
  location: z.string().default(''),
  source_snippet: z.string().default(''),
});

export const ThingToBringSchema = z.object({
  item: z.string().default(''),
  date_needed: z.string().default(''),
  source_snippet: z.string().default(''),
});

export const PaymentOrFormSchema = z.object({
  item: z.string().default(''),
  amount: z.string().default(''),
  due_date: z.string().default(''),
  source_snippet: z.string().default(''),
});

export const ExtractionSchema = z.object({
  title: z.string().default('School communication'),
  communication_type: z.enum([
    'newsletter',
    'excursion',
    'reminder',
    'payment',
    'event',
    'uniform',
    'general update',
    'other',
  ]).catch('other'),  // catch unknown values instead of throwing
  summary: z.array(z.string()).default([]),
  action_items: z.array(ActionItemSchema).default([]),
  events: z.array(EventSchema).default([]),
  things_to_bring: z.array(ThingToBringSchema).default([]),
  payments_or_forms: z.array(PaymentOrFormSchema).default([]),
  flags: z.array(z.string()).default([]),
  ambiguities: z.array(z.string()).default([]),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
