'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const ioRunManager_1 = require("./ioRunManager");
const analytics = require("./analytics");
function activate(context) {
    console.log('"io-run" is now active!');
    let config = vscode.workspace.getConfiguration('io-run');
    analytics.updateConfig(config);
    analytics.send("Extension", "activate");
    analytics.send("Platform", process.platform);
    let ioRunManager = new ioRunManager_1.IORunManager(config);
    vscode.workspace.onDidChangeConfiguration(() => {
        config = vscode.workspace.getConfiguration('io-run');
        ioRunManager.updateConfig(config);
        analytics.updateConfig(config);
    });
    let run = vscode.commands.registerCommand('io-run.run', () => {
        ioRunManager.run();
    });
    let run1input = vscode.commands.registerCommand('io-run.run-1-input', () => {
        ioRunManager.run(false);
    });
    let stop = vscode.commands.registerCommand('io-run.stop', () => {
        ioRunManager.stop();
    });
    let addInputOutput = vscode.commands.registerCommand('io-run.add-input-output', () => {
        ioRunManager.addInputOutput();
    });
    context.subscriptions.push(run);
    context.subscriptions.push(run1input);
    context.subscriptions.push(stop);
    context.subscriptions.push(addInputOutput);
}
exports.activate = activate;
function deactivate() {
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map