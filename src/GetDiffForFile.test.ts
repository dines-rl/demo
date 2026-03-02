import { describe, expect, test, vi, beforeEach } from "vitest";

const mockParse = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    beta: {
      chat: {
        completions: {
          parse: mockParse,
        },
      },
    },
  })),
}));

vi.mock("openai/helpers/zod", () => ({
  zodResponseFormat: vi.fn().mockReturnValue({ type: "json_schema" }),
}));

import { getSuggestionsFromGPT } from "./GetDiffForFile.js";

const SAMPLE_CODE = [
  "const globalValue = 1;",
  "function MyFunction(a: number, b: number): number {",
  "  return a + b;",
  "}",
].join("\n");

function makeOpenAIResponse(changes: object[], changedFileContents?: string) {
  return {
    choices: [
      {
        message: {
          parsed: { changes, changedFileContents },
        },
      },
    ],
  };
}

describe("GetDiffForFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSuggestionsFromGPT", () => {
    test("returns suggestions with correct shape for a successful response", async () => {
      mockParse.mockResolvedValue(
        makeOpenAIResponse(
          [
            {
              shortDescription: "Rename constant",
              longDescription: "Use UPPER_CASE for constants",
              oldCode: "const globalValue = 1;",
              newCode: "const GLOBAL_VALUE = 1;",
            },
          ],
          "const GLOBAL_VALUE = 1;\nfunction MyFunction(a: number, b: number): number {\n  return a + b;\n}"
        )
      );

      const result = await getSuggestionsFromGPT("test.ts", SAMPLE_CODE, {});

      expect(result.filename).toBe("test.ts");
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].shortDescription).toBe("Rename constant");
      expect(result.changes[0].longDescription).toBe("Use UPPER_CASE for constants");
      expect(result.changes[0].oldCode).toBe("const globalValue = 1;");
      expect(result.changes[0].newCode).toBe("const GLOBAL_VALUE = 1;");
      expect(result.changed).toContain("GLOBAL_VALUE");
    });

    test("resolves the correct line number for old code (determineLineStart)", async () => {
      mockParse.mockResolvedValue(
        makeOpenAIResponse([
          {
            shortDescription: "Rename function",
            longDescription: "camelCase functions",
            oldCode: "function MyFunction(a: number, b: number): number {",
            newCode: "function myFunction(a: number, b: number): number {",
          },
        ])
      );

      const result = await getSuggestionsFromGPT("test.ts", SAMPLE_CODE, {});

      // "function MyFunction..." is on line 2 of SAMPLE_CODE
      expect(result.changes[0].oldCodeLineStart).toBe(2);
    });

    test("returns -1 for oldCodeLineStart when old code is not found in the file", async () => {
      mockParse.mockResolvedValue(
        makeOpenAIResponse([
          {
            shortDescription: "Ghost change",
            longDescription: "Some change",
            oldCode: "this code does not exist in the file",
            newCode: "new code",
          },
        ])
      );

      const result = await getSuggestionsFromGPT("test.ts", SAMPLE_CODE, {});

      expect(result.changes[0].oldCodeLineStart).toBe(-1);
    });

    test("handles empty changes array", async () => {
      mockParse.mockResolvedValue(makeOpenAIResponse([]));

      const result = await getSuggestionsFromGPT("test.ts", SAMPLE_CODE, {});

      expect(result.changes).toHaveLength(0);
      expect(result.filename).toBe("test.ts");
    });

    test("returns undefined for changed when changedFileContents is absent", async () => {
      mockParse.mockResolvedValue(makeOpenAIResponse([]));

      const result = await getSuggestionsFromGPT("test.ts", SAMPLE_CODE, {});

      expect(result.changed).toBeUndefined();
    });

    test("throws when parsed response is null", async () => {
      mockParse.mockResolvedValue({
        choices: [{ message: { parsed: null } }],
      });

      await expect(
        getSuggestionsFromGPT("test.ts", SAMPLE_CODE, {})
      ).rejects.toThrow("No suggestions received from GPT");
    });

    test("propagates errors from the OpenAI API", async () => {
      mockParse.mockRejectedValue(new Error("API rate limit exceeded"));

      await expect(
        getSuggestionsFromGPT("test.ts", SAMPLE_CODE, {})
      ).rejects.toThrow("API rate limit exceeded");
    });

    test("uses default model when none is specified", async () => {
      mockParse.mockResolvedValue(makeOpenAIResponse([]));

      await getSuggestionsFromGPT("test.ts", SAMPLE_CODE, {});

      expect(mockParse).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4o-2024-08-06" })
      );
    });

    test("uses default temperature of 0.5 when none is specified", async () => {
      mockParse.mockResolvedValue(makeOpenAIResponse([]));

      await getSuggestionsFromGPT("test.ts", SAMPLE_CODE, {});

      expect(mockParse).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.5 })
      );
    });

    test("uses default max_tokens of 10000 when none is specified", async () => {
      mockParse.mockResolvedValue(makeOpenAIResponse([]));

      await getSuggestionsFromGPT("test.ts", SAMPLE_CODE, {});

      expect(mockParse).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 10000 })
      );
    });

    test("accepts custom model, temperature, and max_tokens", async () => {
      mockParse.mockResolvedValue(makeOpenAIResponse([]));

      await getSuggestionsFromGPT("test.ts", SAMPLE_CODE, {
        model: "gpt-4o-mini",
        temperature: 0.0,
        max_tokens: 500,
      });

      expect(mockParse).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4o-mini",
          temperature: 0.0,
          max_tokens: 500,
        })
      );
    });

    test("includes the code in the user message sent to OpenAI", async () => {
      mockParse.mockResolvedValue(makeOpenAIResponse([]));

      await getSuggestionsFromGPT("example.ts", SAMPLE_CODE, {});

      const callArgs = mockParse.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
      expect(userMessage.content).toContain(SAMPLE_CODE);
    });

    test("handles multiple changes and correctly resolves all line numbers", async () => {
      mockParse.mockResolvedValue(
        makeOpenAIResponse([
          {
            shortDescription: "Rename constant",
            longDescription: "Use UPPER_CASE",
            oldCode: "const globalValue = 1;",
            newCode: "const GLOBAL_VALUE = 1;",
          },
          {
            shortDescription: "Rename function",
            longDescription: "Use camelCase",
            oldCode: "function MyFunction(a: number, b: number): number {",
            newCode: "function myFunction(a: number, b: number): number {",
          },
        ])
      );

      const result = await getSuggestionsFromGPT("test.ts", SAMPLE_CODE, {});

      expect(result.changes).toHaveLength(2);
      expect(result.changes[0].oldCodeLineStart).toBe(1);
      expect(result.changes[1].oldCodeLineStart).toBe(2);
    });
  });
});
