import { describe, expect, test } from "vitest";
import { ASTForFile } from "../dist/AstforFile.js";
describe("TreeSitter", () => {
  test("parses a file", () =>
    expect(ASTForFile("src/index.ts")).toMatchSnapshot());
});
