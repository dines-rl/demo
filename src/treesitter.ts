import { ASTForFileToFile } from "./AstforFile.js";

const fileName = process.argv[1];
const outputFile = process.argv[2];
console.log(`Parsing ${fileName} and writing AST to ${outputFile}`);
if (!fileName || !outputFile) {
  console.warn("Usage: node treesitter.js <filename> <outputfile>");
} else {
  ASTForFileToFile(fileName, outputFile);
}
