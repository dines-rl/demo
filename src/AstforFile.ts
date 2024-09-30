import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import Typescript from "tree-sitter-typescript";
import { readFileSync, writeFileSync } from "fs";

export function ASTForFile(fileName: string): string {
  const parser = new Parser();
  let language;
  if (fileName.endsWith(".ts")) {
    console.log("Parsing TypeScript file");
    language = Typescript.typescript;
  } else if (fileName.endsWith(".js")) {
    console.log("Parsing JavaScript file");
    language = JavaScript;
  } else {
    throw new Error("Unsupported file extension");
  }
  console.log(`Parsing ${fileName} with ${language}`);
  parser.setLanguage(language);
  const source = readFileSync(fileName, "utf8");
  const result = parser.parse(source);
  return JSON.stringify(result.rootNode.tree, null, 2);
}

export function ASTForFileToFile(fileName: string, writeASTToFile: string) {
  writeFileSync(writeASTToFile, ASTForFile(fileName));
  console.log(`Completed parsing saved AST to ${writeASTToFile}`);
}
