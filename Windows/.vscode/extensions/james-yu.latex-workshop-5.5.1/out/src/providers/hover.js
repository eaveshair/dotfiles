"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const tokenizer_1 = require("./tokenizer");
class HoverProvider {
    constructor(extension) {
        this.extension = extension;
    }
    provideHover(document, position, _token) {
        return new Promise((resolve, _reject) => {
            const token = tokenizer_1.tokenizer(document, position);
            if (token === undefined) {
                resolve();
                return;
            }
            if (token in this.extension.completer.reference.referenceData) {
                resolve(new vscode.Hover({ language: 'latex',
                    value: this.extension.completer.reference.referenceData[token].text
                }));
                return;
            }
            if (token in this.extension.completer.citation.citationData) {
                resolve(new vscode.Hover(this.extension.completer.citation.citationData[token].text));
                return;
            }
            resolve();
        });
    }
}
exports.HoverProvider = HoverProvider;
//# sourceMappingURL=hover.js.map