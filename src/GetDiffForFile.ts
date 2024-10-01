import OpenAI from "openai";
const openai = new OpenAI();

type Changes = {
  lineStart: number;
  lineEnd: number;
  shortDescription: string;
  longDescription: string;
  oldCode: string;
  newCode: string;
};

type GPTResultingData = {
  changes: Changes[];
  changed?: string;
  filename: string;
  original: string;
};

// Get code improvements from GPT
export async function getSuggestionsFromGPT(
  filename: string,
  code: string,
  {
    temperature = 0.5,
    max_tokens = 5000,
  }: { temperature: number; max_tokens: number }
): Promise<GPTResultingData> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `### Prompt

\`\`\`plaintext
You are a code assistant tasked with improving the quality of the provided code. You will receive a complete code file, and your job is to review it, suggest improvements, and output the changes.

Your output must include two files:
1. **changed**: The modified code file after applying your improvements.
2. **changes.json**: A JSON file with the resulting data from the changes.
   - **Line Start**: The starting line number of the change.
   - **Line End**: The ending line number of the change.
   - **Short Description**: A short description of the change.
   - **Long Description**: A short description of the change.
   - **Old Code**: The original code (before the change).
   - **New Code**: The updated code (after the change).

### Instructions:
1. Analyze the provided code.
2. Suggest improvements and apply the changes.
3. Generate the updated code in the \`changed\` file.
4. Record the changes in \`changes.json\` with the proper format:
   - **Line Start**: The starting line number of the change.
   - **Line End**: The ending line number of the change.
   - **Short Description**: A short explanation of what was changed and why.
   - **Long Description**: A short explanation of what was changed and why.
   - **Old Code**: The original code, formatted as a string.
   - **New Code**: The updated code, formatted as a string.

Here is the original code file:
\`\`\`
${code}
\`\`\`

Make sure to output both files as requested.
\`\`\`

`,
        },
      ],

      max_tokens: max_tokens,
      temperature: temperature,
    });

    const suggestions = completion.choices[0].message.content;
    console.log("Suggestions from GPT:", suggestions);
    if (suggestions) {
      const result = extractFromSuggestions(filename, suggestions);
      console.log("Result:", result);
      return result;
    } else {
      throw new Error("No suggestions received from GPT");
    }
  } catch (error) {
    console.error("Error fetching suggestions from GPT:", error);
    throw error;
  }
}

function extractFromSuggestions(
  filename: string,
  gptResponse: string
): GPTResultingData {
  // Regex for changed
  const changedRegex = /```changed([\s\S]*?)```/;
  const changesJsonRegex = /```changes\.json([\s\S]*?)```/;

  // Extract changed code
  const changedMatch = gptResponse.match(changedRegex);
  const changedContent = changedMatch ? changedMatch[1].trim() : undefined;

  // Extract changes.json
  const changesJsonMatch = gptResponse.match(changesJsonRegex);
  const changesJsonContent = changesJsonMatch
    ? changesJsonMatch[1].trim()
    : null;

  // Parse changes.json as JSON
  let changesJsonObject: Changes[] = [];
  if (changesJsonContent) {
    try {
      changesJsonObject = JSON.parse(changesJsonContent) as Changes[];
    } catch (error) {
      console.error("Error parsing changes.json:", error);
    }
  }
  return {
    filename,
    changed: changedContent,
    changes: changesJsonObject,
    original: gptResponse,
  };
}
