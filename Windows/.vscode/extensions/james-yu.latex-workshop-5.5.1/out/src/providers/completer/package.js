"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
class Package {
    constructor(extension) {
        this.suggestions = [];
        this.extension = extension;
    }
    initialize(defaultPackages) {
        Object.keys(defaultPackages).forEach(key => {
            const item = defaultPackages[key];
            const pack = new vscode.CompletionItem(item.package, vscode.CompletionItemKind.Module);
            this.suggestions.push(pack);
        });
    }
    provide() {
        return this.suggestions;
    }
}
exports.Package = Package;
//# sourceMappingURL=package.js.map