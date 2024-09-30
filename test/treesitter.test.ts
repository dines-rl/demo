import { describe, expect, test } from "vitest";
import { ASTForFile } from "../dist/AstforFile.js";
describe("TreeSitter", () => {
  test("parses a file", () =>
    expect(ASTForFile("./fixtures/testJSTFile.ts")).toMatchSnapshot());
});
