import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import Typescript from "tree-sitter-typescript";
import { readFileSync, writeFileSync } from "fs";

function ASTForFile(fileName: string, writeASTToFile: string) {
  const parser = new Parser();
  let language;
  if (fileName.endsWith(".ts")) {
    language = Typescript;
  } else if (fileName.endsWith(".js")) {
    language = JavaScript;
  } else {
    throw new Error("Unsupported file extension");
  }
  parser.setLanguage(language);
  const source = readFileSync(fileName, "utf8");
  const result = parser.parse(source);
  if (writeASTToFile) {
    writeFileSync(writeASTToFile, JSON.stringify(result.rootNode, null, 2));
  }
  console.log("AST", result.rootNode.toString());
  console.log(`Completed parsing saved AST to ${writeASTToFile}`);
}

const fileName = process.argv[1];
const outputFile = process.argv[2];
console.log(`Parsing ${fileName} and writing AST to ${outputFile}`);
ASTForFile(fileName, outputFile);
