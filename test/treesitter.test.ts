import { describe, expect, test } from "vitest";
import { ASTForFile } from "../dist/AstforFile.js";
describe("TreeSitter", () => {
  test.skip("parses a file", () =>
    expect(ASTForFile("test/fixtures/testJSTFile.ts")).toMatchSnapshot());
});
