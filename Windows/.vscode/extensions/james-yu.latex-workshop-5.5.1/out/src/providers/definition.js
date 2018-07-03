"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const tokenizer_1 = require("./tokenizer");
class DefinitionProvider {
    constructor(extension) {
        this.extension = extension;
    }
    provideDefinition(document, position, _token) {
        return new Promise((resolve, _reject) => {
            const token = tokenizer_1.tokenizer(document, position);
            if (token === undefined) {
                resolve();
                return;
            }
            if (token in this.extension.completer.reference.referenceData) {
                const ref = this.extension.completer.reference.referenceData[token];
                resolve(new vscode.Location(vscode.Uri.file(ref.file), ref.item.position));
                return;
            }
            if (token in this.extension.completer.citation.citationData) {
                const cite = this.extension.completer.citation.citationData[token];
                resolve(new vscode.Location(vscode.Uri.file(cite.file), cite.position));
                return;
            }
            if (token in this.extension.completer.command.newcommandData) {
                const command = this.extension.completer.command.newcommandData[token];
                resolve(new vscode.Location(vscode.Uri.file(command.file), command.position));
                return;
            }
            if (vscode.window.activeTextEditor && token.indexOf('.') > -1) {
                const absolutePath = path.join(path.dirname(vscode.window.activeTextEditor.document.fileName), token);
                if (fs.existsSync(absolutePath)) {
                    resolve(new vscode.Location(vscode.Uri.file(absolutePath), new vscode.Position(0, 0)));
                    return;
                }
            }
            resolve();
        });
    }
}
exports.DefinitionProvider = DefinitionProvider;
//# sourceMappingURL=definition.js.map