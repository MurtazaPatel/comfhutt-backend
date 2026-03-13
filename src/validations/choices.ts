import { z } from "zod";

export const choiceSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Please enter a valid email address"),
  intent: z.enum(["invest", "list-property"]).optional().default("invest"),
  nps: z.number().min(0).max(10).optional(),
  source: z.string().optional(),
  choices: z.array(z.string()).optional(),
});

export type ChoiceInput = z.infer<typeof choiceSchema>;
