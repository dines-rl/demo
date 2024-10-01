import { describe, expect, test } from "vitest";
import { getSuggestionsFromGPT } from "../dist/GetDiffForFile.js";
import fs from "fs";
describe.skip("GPTTest", () => {
  test.skip(
    "extracts the file changes and reasoning from the ai",
    async () => {
      const filename = "test/fixtures/testJSTFile.ts";
      const file = fs.readFileSync(filename, "utf-8");
      const result = await getSuggestionsFromGPT(filename, file, {
        temperature: 0.0,
        max_tokens: 500,
      });
      expect(result.changes).toMatchInlineSnapshot(`
        [
          {
            "Line End": 1,
            "Line Start": 1,
            "Long Description": "Changed the naming of the constant 'globalValue' to 'GLOBAL_VALUE' to follow the convention for constants in JavaScript.",
            "New Code": "const GLOBAL_VALUE = 1;",
            "Old Code": "const globalValue = 1;",
            "Short Description": "Renamed constant to uppercase",
          },
          {
            "Line End": 2,
            "Line Start": 2,
            "Long Description": "Changed the function name from 'MyFunction' to 'myFunction' to follow the JavaScript naming conventions for functions.",
            "New Code": "function myFunction(a: number, b: number): number {",
            "Old Code": "function MyFunction(a: number, b: number): number {",
            "Short Description": "Renamed function to camelCase",
          },
        ]
      `);
      expect(result.changed).toMatchInlineSnapshot(`
        "const GLOBAL_VALUE = 1; // Changed to uppercase to follow constant naming conventions
        function myFunction(a: number, b: number): number { // Changed function name to camelCase
          return a + b;
        }"
      `);
      expect(result.filename).toBe(filename);
    },
    { timeout: 200000 }
  );

  test.skip(
    "extracts a complicatedfile and reasoning from the ai",
    async () => {
      const filename = "src/GetDiffForFile.ts";
      const file = fs.readFileSync(filename, "utf-8");
      const result = await getSuggestionsFromGPT(filename, file, {
        temperature: 0.0,
        max_tokens: 5000,
      });

      expect(result.changes).toMatchInlineSnapshot(`
        [
          {
            "lineEnd": 1,
            "lineStart": 1,
            "longDescription": "Group and order imports for better readability and maintainability.",
            "newCode": "import { z } from "zod";
        import OpenAI from "openai";
        const openai = new OpenAI();
        import { zodResponseFormat } from "openai/helpers/zod";",
            "oldCode": "import OpenAI from "openai";
        const openai = new OpenAI();

        import { zodResponseFormat } from "openai/helpers/zod";
        import { z } from "zod";",
            "shortDescription": "Organize imports",
          },
          {
            "lineEnd": 20,
            "lineStart": 20,
            "longDescription": "Use a more descriptive name for the type representing changes to improve code clarity.",
            "newCode": "type ChangeDetail = {",
            "oldCode": "type Changes = {",
            "shortDescription": "Improve type definitions",
          },
          {
            "lineEnd": 21,
            "lineStart": 21,
            "longDescription": "Update the reference to the new type name for clarity.",
            "newCode": "  changes: ChangeDetail[];",
            "oldCode": "  changes: Changes[];",
            "shortDescription": "Update type reference",
          },
        ]
      `);
      expect(result.changed).toMatchInlineSnapshot(`undefined`);
      expect(result.filename).toBe(filename);
    },
    { timeout: 200000 }
  );
});
