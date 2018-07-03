"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
function tokenizer(document, position) {
    const startResult = document.getText(new vscode.Range(new vscode.Position(position.line, 0), position)).match(/[\\{,\s](?=[^\\{,\s]*$)/);
    const endResult = document.getText(new vscode.Range(position, new vscode.Position(position.line, 65535))).match(/[{}\[\],\s]/);
    if (startResult === null || endResult === null ||
        startResult.index === undefined || endResult.index === undefined ||
        startResult.index < 0 || endResult.index < 0) {
        return undefined;
    }
    return document.getText(new vscode.Range(new vscode.Position(position.line, startResult.index + 1), new vscode.Position(position.line, position.character + endResult.index)));
}
exports.tokenizer = tokenizer;
//# sourceMappingURL=tokenizer.js.map