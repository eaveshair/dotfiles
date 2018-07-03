"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const commander_1 = require("./commander");
const logger_1 = require("./components/logger");
const manager_1 = require("./components/manager");
const builder_1 = require("./components/builder");
const viewer_1 = require("./components/viewer");
const server_1 = require("./components/server");
const locator_1 = require("./components/locator");
const parser_1 = require("./components/parser");
const linter_1 = require("./components/linter");
const cleaner_1 = require("./components/cleaner");
const counter_1 = require("./components/counter");
const texmagician_1 = require("./components/texmagician");
const envpair_1 = require("./components/envpair");
const completion_1 = require("./providers/completion");
const codeactions_1 = require("./providers/codeactions");
const outline_1 = require("./providers/outline");
const hover_1 = require("./providers/hover");
const docsymbol_1 = require("./providers/docsymbol");
const projectsymbol_1 = require("./providers/projectsymbol");
const definition_1 = require("./providers/definition");
const latexformatter_1 = require("./providers/latexformatter");
function obsoleteConfigCheck() {
    const configuration = vscode.workspace.getConfiguration('latex-workshop');
    function renameConfig(originalConfig, newConfig) {
        if (!configuration.has(originalConfig)) {
            return;
        }
        const originalSetting = configuration.inspect(originalConfig);
        if (originalSetting && originalSetting.globalValue !== undefined) {
            configuration.update(newConfig, originalSetting.globalValue, true);
            configuration.update(originalConfig, undefined, true);
        }
        if (originalSetting && originalSetting.workspaceValue !== undefined) {
            configuration.update(newConfig, originalSetting.workspaceValue, false);
            configuration.update(originalConfig, undefined, false);
        }
    }
    renameConfig('latex.autoBuild.enabled', 'latex.autoBuild.onSave.enabled');
    renameConfig('viewer.zoom', 'view.pdf.zoom');
    renameConfig('viewer.hand', 'view.pdf.hand');
    renameConfig('debug.showUpdateMessage', 'message.update.show');
    if (configuration.has('version')) {
        configuration.update('version', undefined, true);
    }
    if (configuration.has('latex.toolchain') && !configuration.has('latex.recipes')) {
        vscode.window.showWarningMessage(`LaTeX Workshop has updated its original toolchain system to a new recipe system. Please change your "latex-workshop.latex.toolchain" setting.`, 'Auto-change', 'More info', 'Close')
            .then(option => {
            switch (option) {
                case 'Auto-change':
                    const toolchain = configuration.get('latex.toolchain').map((tool, idx) => {
                        tool.name = `Step ${idx + 1}: ${tool.command}`;
                        return tool;
                    });
                    configuration.update('latex.tools', toolchain, true);
                    configuration.update('latex.recipes', [{ name: 'toolchain', tools: toolchain.map(tool => tool.name) }], true);
                    configuration.update('latex.toolchain', undefined, true);
                    vscode.window.showInformationMessage(`A new recipe named "toolchain" is created. Please double check if it is correctly migrated in the configuration.`);
                    break;
                case 'More info':
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://github.com/James-Yu/LaTeX-Workshop#recipe'));
                    break;
                case 'Close':
                default:
            }
        });
    }
}
function conflictExtensionCheck() {
    function check(extensionID, name, suggestion) {
        if (vscode.extensions.getExtension(extensionID) !== undefined) {
            vscode.window.showWarningMessage(`LaTeX Workshop is incompatible with extension "${name}". ${suggestion}`);
        }
    }
    check('tomoki1207.pdf', 'vscode-pdf', 'All features of "vscode-pdf" are supported by LaTeX Workshop.');
}
function newVersionMessage(extensionPath, extension) {
    fs.readFile(`${extensionPath}${path.sep}package.json`, (err, data) => {
        if (err) {
            extension.logger.addLogMessage(`Cannot read package information.`);
            return;
        }
        extension.packageInfo = JSON.parse(data.toString());
        extension.logger.addLogMessage(`LaTeX Workshop version: ${extension.packageInfo.version}`);
        if (fs.existsSync(`${extensionPath}${path.sep}VERSION`) &&
            fs.readFileSync(`${extensionPath}${path.sep}VERSION`).toString() === extension.packageInfo.version) {
            return;
        }
        fs.writeFileSync(`${extensionPath}${path.sep}VERSION`, extension.packageInfo.version);
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        if (!configuration.get('message.update.show')) {
            return;
        }
        vscode.window.showInformationMessage(`LaTeX Workshop updated to version ${extension.packageInfo.version}.`, 'Change log', 'Star the project', 'Disable this message')
            .then(option => {
            switch (option) {
                case 'Change log':
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://github.com/James-Yu/LaTeX-Workshop/blob/master/CHANGELOG.md'));
                    break;
                case 'Star the project':
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://github.com/James-Yu/LaTeX-Workshop'));
                    break;
                case 'Disable this message':
                    configuration.update('message.update.show', false, true);
                    break;
                default:
                    break;
            }
        });
    });
}
function activate(context) {
    return __awaiter(this, void 0, void 0, function* () {
        const extension = new Extension();
        global['latex'] = extension;
        vscode.commands.registerCommand('latex-workshop.build', () => extension.commander.build());
        vscode.commands.registerCommand('latex-workshop.recipes', () => extension.commander.recipes());
        vscode.commands.registerCommand('latex-workshop.view', () => extension.commander.view());
        vscode.commands.registerCommand('latex-workshop.tab', () => extension.commander.tab());
        vscode.commands.registerCommand('latex-workshop.kill', () => extension.commander.kill());
        vscode.commands.registerCommand('latex-workshop.pdf', (uri) => extension.commander.pdf(uri));
        vscode.commands.registerCommand('latex-workshop.synctex', () => extension.commander.synctex());
        vscode.commands.registerCommand('latex-workshop.clean', () => extension.commander.clean());
        vscode.commands.registerCommand('latex-workshop.actions', () => extension.commander.actions());
        vscode.commands.registerCommand('latex-workshop.citation', () => extension.commander.citation());
        vscode.commands.registerCommand('latex-workshop.addtexroot', () => extension.commander.addTexRoot());
        vscode.commands.registerCommand('latex-workshop.wordcount', () => extension.commander.wordcount());
        vscode.commands.registerCommand('latex-workshop.compilerlog', () => extension.commander.compilerlog());
        vscode.commands.registerCommand('latex-workshop.log', () => extension.commander.log());
        vscode.commands.registerCommand('latex-workshop.code-action', (d, r, c, m) => extension.codeActions.runCodeAction(d, r, c, m));
        vscode.commands.registerCommand('latex-workshop.goto-section', (filePath, lineNumber) => extension.commander.gotoSection(filePath, lineNumber));
        vscode.commands.registerCommand('latex-workshop.navigate-envpair', () => extension.commander.navigateToEnvPair());
        vscode.commands.registerCommand('latex-workshop.select-envname', () => extension.commander.selectEnvName());
        vscode.commands.registerCommand('latex-workshop.multicursor-envname', () => extension.commander.multiCursorEnvName());
        vscode.commands.registerCommand('latex-workshop.close-env', () => extension.commander.closeEnv());
        context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((e) => {
            if (extension.manager.isTex(e.fileName)) {
                extension.linter.lintRootFileIfEnabled();
            }
            const configuration = vscode.workspace.getConfiguration('latex-workshop');
            if (configuration.get('latex.autoBuild.onSave.enabled') && !extension.builder.disableBuildAfterSave) {
                if (extension.manager.isTex(e.fileName)) {
                    extension.commander.build(true);
                }
            }
            if (extension.manager.isTex(e.fileName)) {
                extension.nodeProvider.refresh();
                extension.nodeProvider.update();
            }
        }));
        context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((e) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && e.kind) {
                const content = editor.document.getText(new vscode.Range(e.selections[0].start, e.selections[0].end));
                if (content.length > 0 || extension.completer.command.shouldClearSelection) {
                    extension.completer.command.selection = content;
                }
                extension.completer.command.shouldClearSelection = content.length === 0;
            }
        }));
        context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((e) => {
            if (extension.manager.isTex(e.fileName)) {
                obsoleteConfigCheck();
                extension.manager.findRoot();
            }
        }));
        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
            if (extension.manager.isTex(e.document.fileName)) {
                extension.linter.lintActiveFileIfEnabledAfterInterval();
            }
        }));
        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((e) => {
            if (!vscode.window.activeTextEditor) {
                extension.logger.status.hide();
            }
            else if (!vscode.window.activeTextEditor.document.fileName) {
                extension.logger.status.hide();
            }
            else if (!extension.manager.isTex(vscode.window.activeTextEditor.document.fileName)) {
                extension.logger.status.hide();
            }
            else {
                extension.logger.status.show();
            }
            if (vscode.window.activeTextEditor) {
                extension.manager.findRoot();
            }
            if (e && extension.manager.isTex(e.document.fileName)) {
                extension.linter.lintActiveFileIfEnabled();
            }
        }));
        context.subscriptions.push(vscode.workspace.createFileSystemWatcher('**/*.tex', true, false, true).onDidChange((e) => {
            if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.fileName === e.fsPath) {
                return;
            }
            const configuration = vscode.workspace.getConfiguration('latex-workshop');
            if (!configuration.get('latex.autoBuild.onTexChange.enabled')) {
                return;
            }
            extension.logger.addLogMessage(`${e.fsPath} changed. Auto build project.`);
            const rootFile = extension.manager.findRoot();
            if (rootFile !== undefined) {
                extension.logger.addLogMessage(`Building root file: ${rootFile}`);
                extension.builder.build(extension.manager.rootFile);
            }
            else {
                extension.logger.addLogMessage(`Cannot find LaTeX root file.`);
            }
        }));
        extension.manager.findRoot();
        const formatter = new latexformatter_1.LatexFormatterProvider(extension);
        vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: 'latex' }, formatter);
        vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file', language: 'bibtex' }, formatter);
        vscode.languages.registerDocumentRangeFormattingEditProvider({ scheme: 'file', language: 'latex' }, formatter);
        vscode.languages.registerDocumentRangeFormattingEditProvider({ scheme: 'file', language: 'bibtex' }, formatter);
        context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('latex-workshop-pdf', new viewer_1.PDFProvider(extension)));
        context.subscriptions.push(vscode.languages.registerHoverProvider({ scheme: 'file', language: 'latex' }, new hover_1.HoverProvider(extension)));
        context.subscriptions.push(vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'latex' }, new definition_1.DefinitionProvider(extension)));
        context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ scheme: 'file', language: 'latex' }, new docsymbol_1.DocSymbolProvider(extension)));
        context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new projectsymbol_1.ProjectSymbolProvider(extension)));
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'tex' }, extension.completer, '\\', '{'));
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'latex' }, extension.completer, '\\', '{', ',', '(', '['));
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ scheme: 'file', language: 'doctex' }, extension.completer, '\\', '{', ',', '(', '['));
        context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ scheme: 'file', language: 'latex' }, extension.codeActions));
        context.subscriptions.push(vscode.window.registerTreeDataProvider('latex-outline', extension.nodeProvider));
        extension.linter.lintRootFileIfEnabled();
        obsoleteConfigCheck();
        conflictExtensionCheck();
        newVersionMessage(context.extensionPath, extension);
    });
}
exports.activate = activate;
class Extension {
    constructor() {
        this.extensionRoot = path.resolve(`${__dirname}/../../`);
        this.logger = new logger_1.Logger(this);
        this.commander = new commander_1.Commander(this);
        this.manager = new manager_1.Manager(this);
        this.builder = new builder_1.Builder(this);
        this.viewer = new viewer_1.Viewer(this);
        this.server = new server_1.Server(this);
        this.locator = new locator_1.Locator(this);
        this.parser = new parser_1.Parser(this);
        this.completer = new completion_1.Completer(this);
        this.linter = new linter_1.Linter(this);
        this.cleaner = new cleaner_1.Cleaner(this);
        this.counter = new counter_1.Counter(this);
        this.codeActions = new codeactions_1.CodeActions(this);
        this.nodeProvider = new outline_1.SectionNodeProvider(this);
        this.texMagician = new texmagician_1.TeXMagician(this);
        this.envPair = new envpair_1.EnvPair(this);
        this.logger.addLogMessage(`LaTeX Workshop initialized.`);
    }
}
exports.Extension = Extension;
//# sourceMappingURL=main.js.map