import OpenAI from "openai";
const openai = new OpenAI();

import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const Change = z.object({
  lineStart: z.number({
    description:
      "The starting line number of the change in the original code file.",
  }),
  shortDescription: z.string({
    description: "A short description of the change. Suitable for a title",
  }),
  longDescription: z.string({
    description: "A longer description of the change. Suitable for a body",
  }),
  oldCode: z.string({ description: "The original code (before the change)." }),
  newCode: z.string({ description: "The updated code (after the change)." }),
});

const CodeSuggestionsResult = z.object({
  changes: z.array(Change, { description: "The changes made to the code." }),
  changedFileContents: z
    .string({
      description:
        "The code representing the entire changed file after the changes have been made.",
    })
    .optional(),
});

type Changes = {
  lineStart: number;
  shortDescription: string;
  longDescription: string;
  oldCode: string;
  newCode: string;
};

type GPTResultingData = {
  changes: Changes[];
  changed?: string;
  filename: string;
};

// Get code improvements from GPT
export async function getSuggestionsFromGPT(
  filename: string,
  code: string,
  {
    model = "gpt-4o-2024-08-06",
    temperature = 0.5,
    max_tokens = 10000, // TODo this is a lot
  }: { model?: string; temperature?: number; max_tokens?: number }
): Promise<GPTResultingData> {
  try {
    const completion = await openai.beta.chat.completions.parse({
      model: model,
      response_format: zodResponseFormat(CodeSuggestionsResult, "result"),
      messages: [
        {
          role: "system",
          content: `You are a code assistant tasked with improving the quality of the provided code. You will receive a complete code file, and your job is to review it, suggest improvements, and output the changes. You are a senior developer with extensive experience and also very helpful in the reasoning behind your changes.

### Instructions:
1. Analyze the provided code.
2. Suggest improvements and apply the changes.

Make sure to output both files as requested.
\`\`\`

`,
        },
        { role: "user", content: `\`\`\`${code}\`\`\`` },
      ],

      max_tokens: max_tokens,
      temperature: temperature,
    });

    const suggestion = completion.choices[0].message.parsed;
    console.log("--------------------");
    console.log("Suggestions from GPT:", suggestion);
    console.log("--------------------");

    if (suggestion) {
      return { filename, ...suggestion };
    } else {
      throw new Error("No suggestions received from GPT");
    }
  } catch (error) {
    console.error("Error fetching suggestions from GPT:", error);
    throw error;
  }
}
