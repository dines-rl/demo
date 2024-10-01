import OpenAI from "openai";
const openai = new OpenAI();

// Get code improvements from GPT
export async function getSuggestionsFromGPT(
  fileName: string,
  code: string,
  {
    temperature = 0.5,
    max_tokens = 5000,
  }: { temperature: number; max_tokens: number }
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a code assistant tasked with improving the quality of the provided code. You will receive the entire content of a file, and your job is to review it, suggest improvements, and output a Git-style diff that reflects your changes. 

The improvements can include:
- Fixing any syntax errors.
- Refactoring code for better readability and maintainability.
- Optimizing performance if applicable.
- Ensuring modern best practices are followed.
- Adding comments where necessary to clarify complex logic.
- Ensuring proper variable/function naming conventions.

### Instructions:
1. **Analyze the code**: Understand the intent and function of the given code.
2. **Suggest improvements**: Make necessary code improvements. 
3. **Output a Git diff**: Present the diff in a format similar to the output of a \`git diff\` command.

Here is the code you need to improve:

\`\`\`
${code}
\`\`\`

Return the changes in the following format:

\`\`\`
diff --git a/${fileName} b/${fileName}
index <index>..<index> <file_permissions>
--- a/${fileName}
+++ b/${fileName}
@@ <line_number> <line_number> @@
- <original_code>
+ <suggested_code>
\`\`\`

Please make sure that the diff clearly highlights what has changed between the original code and your suggested improvements.
`,
        },
      ],

      max_tokens: max_tokens,
      temperature: temperature,
    });

    console.log("GPT Response:", JSON.stringify(completion, null, 4));
    const suggestions = completion.choices[0].message.content;
    if (suggestions) {
      return suggestions.trim();
    } else {
      throw new Error("No suggestions received from GPT");
    }
  } catch (error) {
    console.error("Error fetching suggestions from GPT:", error);
    throw error;
  }
}

// // Generate Git-like diff output between original and suggested code
// function generateDiff(originalCode: string, suggestedCode: string): string {
//   const patch = diff.createPatch("codefile", originalCode, suggestedCode);
//   return patch;
// }

// // Main function to process the file and output the diff
// async function processCodeFile(filePath: string) {
//   try {
//     const originalCode = await readCodeFile(filePath);
//     const suggestedCode = await getSuggestionsFromGPT(originalCode);

//     console.log("Original Code:\n", originalCode);
//     console.log("\nSuggested Code:\n", suggestedCode);

//     const diffOutput = generateDiff(originalCode, suggestedCode);
//     console.log("\nGit Diff of Suggestions:\n", diffOutput);
//   } catch (error) {
//     console.error("Error processing code file:", error);
//   }
// // }

// // Run the script with the code file path
// const filePath = process.argv[2]; // Pass the file path as a command-line argument
// if (filePath) {
//   processCodeFile(filePath);
// } else {
//   console.error("Please provide a file path as a command-line argument.");
// }
