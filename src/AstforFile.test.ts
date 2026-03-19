import { describe, expect, test, vi, beforeEach } from "vitest";

// Mock tree-sitter and related modules before importing the module under test
vi.mock("tree-sitter", () => {
  const MockParser = vi.fn().mockImplementation(() => ({
    setLanguage: vi.fn(),
    parse: vi.fn().mockReturnValue({
      rootNode: {
        tree: { type: "program", children: [] },
      },
    }),
  }));
  return { default: MockParser };
});

vi.mock("tree-sitter-javascript", () => ({
  default: { type: "javascript" },
}));

vi.mock("tree-sitter-typescript", () => ({
  default: { typescript: { type: "typescript" } },
}));

vi.mock("fs", () => ({
  readFileSync: vi.fn().mockReturnValue("const x = 1;"),
  writeFileSync: vi.fn(),
}));

import { ASTForFile, ASTForFileToFile } from "./AstforFile.js";
import { writeFileSync, readFileSync } from "fs";

describe("AstforFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ASTForFile", () => {
    test("parses a TypeScript file and returns JSON string", () => {
      const result = ASTForFile("example.ts");
      expect(typeof result).toBe("string");
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ type: "program", children: [] });
    });

    test("parses a JavaScript file and returns JSON string", () => {
      const result = ASTForFile("example.js");
      expect(typeof result).toBe("string");
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ type: "program", children: [] });
    });

    test("reads the file contents when parsing", () => {
      ASTForFile("example.ts");
      expect(readFileSync).toHaveBeenCalledWith("example.ts", "utf8");
    });

    test("throws an error for unsupported file extensions", () => {
      expect(() => ASTForFile("example.py")).toThrow("Unsupported file extension");
    });

    test("throws an error for files with no extension", () => {
      expect(() => ASTForFile("Makefile")).toThrow("Unsupported file extension");
    });

    test("throws an error for .tsx files", () => {
      expect(() => ASTForFile("component.tsx")).toThrow("Unsupported file extension");
    });

    test("returns pretty-printed JSON (indented with 2 spaces)", () => {
      const result = ASTForFile("example.ts");
      expect(result).toContain("\n");
    });
  });

  describe("ASTForFileToFile", () => {
    test("writes the AST JSON to the specified output file", () => {
      ASTForFileToFile("example.ts", "output.json");
      expect(writeFileSync).toHaveBeenCalledWith(
        "output.json",
        expect.stringContaining("program")
      );
    });

    test("calls ASTForFile and writes its result to disk", () => {
      ASTForFileToFile("example.js", "result.json");
      expect(readFileSync).toHaveBeenCalledWith("example.js", "utf8");
      expect(writeFileSync).toHaveBeenCalledOnce();
    });

    test("writes valid JSON to the output file", () => {
      ASTForFileToFile("example.ts", "ast.json");
      const writtenContent = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      expect(() => JSON.parse(writtenContent)).not.toThrow();
    });
  });
});
