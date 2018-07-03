"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
class Environment {
    constructor(extension) {
        this.suggestions = [];
        this.extension = extension;
    }
    initialize(defaultEnvs) {
        Object.keys(defaultEnvs).forEach(key => {
            const item = defaultEnvs[key];
            const environment = new vscode.CompletionItem(item.text, vscode.CompletionItemKind.Module);
            this.suggestions.push(environment);
        });
    }
    provide() {
        return this.suggestions;
    }
}
exports.Environment = Environment;
//# sourceMappingURL=environment.js.map