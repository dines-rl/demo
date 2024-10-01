import { describe, expect, test } from "vitest";
import { getSuggestionsFromGPT } from "../dist/GetDiffForFile.js";
import fs from "fs";
describe("GPTTest", () => {
  test("extracts the file changes and reasoning from the ai", async () => {
    const filename = "test/fixtures/testJSTFile.ts";
    const file = fs.readFileSync(filename, "utf-8");
    const result = await getSuggestionsFromGPT(filename, file, {
      temperature: 0.5,
      max_tokens: 500,
    });
    expect(result).toMatchSnapshot();
  });
});
