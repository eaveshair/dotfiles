"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
class DocSymbolProvider {
    constructor(extension) {
        this.extension = extension;
    }
    provideDocumentSymbols(document, _token) {
        return new Promise((resolve, _reject) => {
            const references = this.extension.completer.reference.getReferenceItems(document.getText());
            resolve(Object.keys(references).map(key => {
                const reference = references[key];
                return new vscode.SymbolInformation(key, vscode.SymbolKind.Key, '', new vscode.Location(document.uri, reference.position));
            }));
        });
    }
}
exports.DocSymbolProvider = DocSymbolProvider;
//# sourceMappingURL=docsymbol.js.map