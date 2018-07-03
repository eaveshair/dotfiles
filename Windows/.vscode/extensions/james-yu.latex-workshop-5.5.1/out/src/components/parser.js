"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const latexPattern = /^Output\swritten\son\s(.*)\s\(.*\)\.$/gm;
const latexFatalPattern = /Fatal error occurred, no output PDF file produced!/gm;
const latexError = /^(?:(.*):(\d+):|!)(?: (.+) Error:)? (.+?)\.?$/;
const latexBox = /^((?:Over|Under)full \\[vh]box \([^)]*\)) in paragraph at lines (\d+)--(\d+)$/;
const latexWarn = /^((?:(?:Class|Package) \S+)|LaTeX) (Warning|Info):\s+(.*?)(?: on input line (\d+))?\.$/;
const bibEmpty = /^Empty `thebibliography' environment/;
const latexmkPattern = /^Latexmk:\sapplying\srule/gm;
const latexmkLog = /^Latexmk:\sapplying\srule/;
const latexmkLogLatex = /^Latexmk:\sapplying\srule\s'(pdf|lua|xe)?latex'/;
const latexmkUpToDate = /^Latexmk: All targets \(.*\) are up-to-date/;
const texifyPattern = /^running\s(pdf|lua|xe)?latex/gm;
const texifyLog = /^running\s((pdf|lua|xe)?latex|miktex-bibtex)/;
const texifyLogLatex = /^running\s(pdf|lua|xe)?latex/;
const truncatedLine = /(.{78}(\w|\s|\d|\\|\/))(\r\n|\n)/g;
const DIAGNOSTIC_SEVERITY = {
    'typesetting': vscode.DiagnosticSeverity.Hint,
    'warning': vscode.DiagnosticSeverity.Warning,
    'error': vscode.DiagnosticSeverity.Error,
};
class Parser {
    constructor(extension) {
        this.buildLog = [];
        this.buildLogRaw = '';
        this.compilerDiagnostics = vscode.languages.createDiagnosticCollection('LaTeX');
        this.linterDiagnostics = vscode.languages.createDiagnosticCollection('ChkTeX');
        this.extension = extension;
    }
    parse(log) {
        this.isLaTeXmkSkipped = false;
        // clean truncated lines and canonicalize line-endings
        log = log.replace(truncatedLine, '$1').replace(/(\r\n)|\r/g, '\n');
        if (log.match(latexmkPattern)) {
            log = this.trimLaTeXmk(log);
        }
        else if (log.match(texifyPattern)) {
            log = this.trimTexify(log);
        }
        if (log.match(latexPattern) || log.match(latexFatalPattern)) {
            this.parseLaTeX(log);
        }
        else if (this.latexmkSkipped(log)) {
            this.isLaTeXmkSkipped = true;
        }
    }
    trimLaTeXmk(log) {
        const lines = log.split('\n');
        let startLine = -1;
        let finalLine = -1;
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            let result = line.match(latexmkLogLatex);
            if (result) {
                startLine = index;
            }
            result = line.match(latexmkLog);
            if (result) {
                finalLine = index;
            }
        }
        if (finalLine <= startLine) {
            return lines.slice(startLine).join('\n');
        }
        else {
            return lines.slice(startLine, finalLine).join('\n');
        }
    }
    trimTexify(log) {
        const lines = log.split('\n');
        let startLine = -1;
        let finalLine = -1;
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            let result = line.match(texifyLogLatex);
            if (result) {
                startLine = index;
            }
            result = line.match(texifyLog);
            if (result) {
                finalLine = index;
            }
        }
        if (finalLine <= startLine) {
            return lines.slice(startLine).join('\n');
        }
        else {
            return lines.slice(startLine, finalLine).join('\n');
        }
    }
    latexmkSkipped(log) {
        const lines = log.split('\n');
        if (lines[0].match(latexmkUpToDate)) {
            this.showCompilerDiagnostics();
            return true;
        }
        return false;
    }
    parseLaTeX(log) {
        this.buildLogRaw = log;
        const lines = log.split('\n');
        this.buildLog = [];
        let searchesEmptyLine = false;
        let currentResult = { type: '', file: '', text: '', line: undefined };
        const fileStack = [this.extension.manager.rootFile];
        let nested = 0;
        for (const line of lines) {
            // Compose the current file
            const filename = path.resolve(this.extension.manager.rootDir, fileStack[fileStack.length - 1]);
            // append the read line, since we have a corresponding result in the making
            if (searchesEmptyLine) {
                currentResult.text = currentResult.text + ' ' + line;
                if (line.trim() === '') {
                    currentResult.text = currentResult.text + '\n';
                    searchesEmptyLine = false;
                }
                continue;
            }
            let result = line.match(latexBox);
            if (result) {
                if (currentResult.type !== '') {
                    this.buildLog.push(currentResult);
                }
                currentResult = {
                    type: 'typesetting',
                    file: filename,
                    line: parseInt(result[2], 10),
                    text: result[1]
                };
                searchesEmptyLine = true;
                continue;
            }
            result = line.match(latexWarn);
            if (result) {
                if (currentResult.type !== '') {
                    this.buildLog.push(currentResult);
                }
                currentResult = {
                    type: 'warning',
                    file: filename,
                    line: parseInt(result[4], 10),
                    text: result[3]
                };
                searchesEmptyLine = true;
                continue;
            }
            result = line.match(latexError);
            if (result) {
                if (currentResult.type !== '') {
                    this.buildLog.push(currentResult);
                }
                currentResult = {
                    type: 'error',
                    text: (result[3] && result[3] !== 'LaTeX') ? `${result[3]}: ${result[4]}` : result[4],
                    file: result[1] ? path.resolve(this.extension.manager.rootDir, result[1]) : filename,
                    line: result[2] ? parseInt(result[2], 10) : undefined
                };
                searchesEmptyLine = true;
                continue;
            }
            nested = this.parseLaTeXFileStack(line, fileStack, nested);
            if (fileStack.length === 0) {
                fileStack.push(this.extension.manager.rootFile);
            }
        }
        // push final result
        if (currentResult.type !== '' && !currentResult.text.match(bibEmpty)) {
            this.buildLog.push(currentResult);
        }
        this.extension.logger.addLogMessage(`LaTeX log parsed with ${this.buildLog.length} messages.`);
        this.showCompilerDiagnostics();
    }
    parseLaTeXFileStack(line, fileStack, nested) {
        const result = line.match(/(\(|\))/);
        if (result && result.index !== undefined && result.index > -1) {
            line = line.substr(result.index + 1);
            if (result[1] === '(') {
                const pathResult = line.match(/((?:(?:[a-zA-Z]:|\.|\/)?(?:\/|\\\\?))?[\w\-. \/\\#]*)/);
                if (pathResult) {
                    fileStack.push(pathResult[1].trim());
                }
                else {
                    nested += 1;
                }
            }
            else {
                if (nested > 0) {
                    nested -= 1;
                }
                else {
                    fileStack.pop();
                }
            }
            nested = this.parseLaTeXFileStack(line, fileStack, nested);
        }
        return nested;
    }
    parseLinter(log, singleFileOriginalPath) {
        const re = /^(.*?):(\d+):(\d+):(\d+):(.*?):(\d+):(.*?)$/gm;
        const linterLog = [];
        let match = re.exec(log);
        while (match) {
            // this log may be for a single file in memory, in which case we override the
            // path with what is provided
            const filePath = singleFileOriginalPath ? singleFileOriginalPath : match[1];
            linterLog.push({
                file: path.isAbsolute(filePath) ? filePath : path.resolve(this.extension.manager.rootDir, filePath),
                line: parseInt(match[2]),
                position: parseInt(match[3]),
                length: parseInt(match[4]),
                type: match[5].toLowerCase(),
                code: parseInt(match[6]),
                text: `${match[6]}: ${match[7]}`
            });
            match = re.exec(log);
        }
        this.extension.logger.addLogMessage(`Linter log parsed with ${linterLog.length} messages.`);
        if (singleFileOriginalPath === undefined) {
            // A full lint of the project has taken place - clear all previous results.
            this.linterDiagnostics.clear();
        }
        else if (linterLog.length === 0) {
            // We are linting a single file and the new log is empty for it -
            // clean existing records.
            this.linterDiagnostics.set(vscode.Uri.file(singleFileOriginalPath), []);
        }
        this.showLinterDiagnostics(linterLog);
    }
    showCompilerDiagnostics() {
        this.compilerDiagnostics.clear();
        const diagsCollection = {};
        for (const item of this.buildLog) {
            const range = new vscode.Range(new vscode.Position(item.line - 1, 0), new vscode.Position(item.line - 1, 65535));
            const diag = new vscode.Diagnostic(range, item.text, DIAGNOSTIC_SEVERITY[item.type]);
            diag.source = 'LaTeX';
            if (diagsCollection[item.file] === undefined) {
                diagsCollection[item.file] = [];
            }
            diagsCollection[item.file].push(diag);
        }
        for (const file in diagsCollection) {
            this.compilerDiagnostics.set(vscode.Uri.file(file), diagsCollection[file]);
        }
    }
    showLinterDiagnostics(linterLog) {
        const diagsCollection = {};
        for (const item of linterLog) {
            const range = new vscode.Range(new vscode.Position(item.line - 1, item.position - 1), new vscode.Position(item.line - 1, item.position - 1 + item.length));
            const diag = new vscode.Diagnostic(range, item.text, DIAGNOSTIC_SEVERITY[item.type]);
            diag.code = item.code;
            diag.source = 'ChkTeX';
            if (diagsCollection[item.file] === undefined) {
                diagsCollection[item.file] = [];
            }
            diagsCollection[item.file].push(diag);
        }
        for (const file in diagsCollection) {
            if (this.extension.manager.isTex(file)) {
                // only report ChkTeX errors on TeX files. This is done to avoid
                // reporting errors in .sty files which for most users is irrelevant.
                this.linterDiagnostics.set(vscode.Uri.file(file), diagsCollection[file]);
            }
        }
    }
}
exports.Parser = Parser;
//# sourceMappingURL=parser.js.map