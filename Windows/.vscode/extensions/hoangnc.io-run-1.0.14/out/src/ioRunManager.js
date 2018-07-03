'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const os = require("os");
const fs = require("fs");
const et = require("./errorTracer");
const tools = require("./tools");
const analytics = require("./analytics");
class IORunManager {
    constructor(config) {
        this.output = vscode.window.createOutputChannel('IO Run');
        this.terminal = vscode.window.createTerminal('IO Run');
        this.killRequested = false;
        this.timeLimitExceeded = false;
        this.config = config;
    }
    updateConfig(config) {
        this.config = config;
    }
    stop() {
        analytics.send("Action", "stop");
        if (this.process != null) {
            this.killRequested = true;
            let kill = require('tree-kill');
            kill(this.process.pid);
        }
    }
    addInputOutput() {
        analytics.send("Action", "addInputOutput");
        let codeFile = this.getCodeFile();
        if (codeFile == null)
            return;
        let codeFileNoExt = tools.getFileNoExtension(codeFile);
        let inputExt = this.config.inputExtension.toLowerCase();
        let acceptExt = this.config.acceptExtension.toLowerCase();
        let pad = x => { return (x < 10) ? ('0' + x) : x; };
        for (var i = 1; i <= 999; i++) {
            let inputFileName = codeFileNoExt + '.' + pad(i) + inputExt;
            if (!fs.existsSync(inputFileName)) {
                let acceptFileName = codeFileNoExt + '.' + pad(i) + acceptExt;
                if (!fs.existsSync(acceptFileName)) {
                    fs.writeFileSync(acceptFileName, '');
                }
                vscode.workspace.openTextDocument(acceptFileName).then(doc => {
                    vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
                    fs.writeFileSync(inputFileName, '');
                    vscode.workspace.openTextDocument(inputFileName).then(doc => {
                        vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                    });
                });
                return;
            }
        }
    }
    run(runAllInputs = true) {
        analytics.send("Action", "run");
        if (this.process != null) {
            vscode.window.showInformationMessage('[' + this.runningCodeFile + '] still running!');
            return;
        }
        let activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor)
            return;
        let codeFile = this.getCodeFile();
        if (codeFile == null)
            return;
        let executor = this.getExecutor(codeFile);
        executor.runAllInput = runAllInputs;
        analytics.send("CodeExt", executor.codeExt);
        if (executor.clearPreviousOutput) {
            this.output.clear();
        }
        this.output.show(true);
        let listFileNeedSaved = this.getListFileNeedSaved(executor);
        if (listFileNeedSaved.length > 0) {
            this.saveFilesAndCompile(executor, listFileNeedSaved);
        }
        else {
            this.compileCode(executor);
        }
    }
    setCmdVar(executor, cmd) {
        cmd = tools.replaceVar(cmd, "dir", executor.codeDir);
        cmd = tools.replaceVar(cmd, "dirCodeFile", executor.codeDirFile);
        cmd = tools.replaceVar(cmd, "dirCodeFileNoExt", executor.codeDirFileNoExt);
        cmd = tools.replaceVar(cmd, "codeFile", executor.codeFile);
        cmd = tools.replaceVar(cmd, "codeFileNoExt", executor.codeFileNoExt);
        return cmd;
    }
    jumpToErrorPosition(executor, errMsg) {
        let codeFileEscaped = executor.codeFile.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        let errLocationRegExps = [
            codeFileEscaped + ":(\\d+)(:(\\d+))?",
            'File "' + codeFileEscaped + '", line (\\d+)',
            codeFileEscaped + "\\((\\d+),(\\d+)\\)",
        ];
        for (let iReg in errLocationRegExps) {
            let errLocationRegExp = errLocationRegExps[iReg];
            let r = new RegExp(errLocationRegExp);
            let arr = r.exec(errMsg);
            if (arr != null && arr.length > 1) {
                let line = Number(arr[1]);
                let character = 1;
                if (arr.length > 3) {
                    character = Number(arr[3]);
                }
                vscode.workspace.openTextDocument(executor.codeDirFile).then(doc => {
                    vscode.window.showTextDocument(doc).then(editor => {
                        if (character < 1)
                            character = 1;
                        if (line < 1)
                            line = 1;
                        let position = new vscode.Position(line - 1, character - 1);
                        var newSelection = new vscode.Selection(position, position);
                        editor.selection = newSelection;
                        let startRange = new vscode.Position(position.line < 5 ? 0 : position.line - 5, position.character);
                        let endRange = position;
                        editor.revealRange(new vscode.Range(startRange, endRange));
                    });
                });
                break;
            }
        }
    }
    compileCode(executor) {
        if (executor.compileCmd == null || executor.compileCmd.length == 0) {
            this.output.appendLine('[' + executor.codeFile + '] will be run');
            this.runCode(executor);
            return;
        }
        let compileCmd = this.setCmdVar(executor, executor.compileCmd);
        let processEnv = Object.assign({}, process.env);
        if (executor.PATH) {
            processEnv.PATH = executor.PATH + path.delimiter + processEnv.PATH;
        }
        processEnv.PATH = executor.codeDir + path.delimiter + processEnv.PATH;
        this.output.append('[' + executor.codeFile + '] compiling... ');
        this.process = require('child_process').exec(compileCmd, { cwd: executor.codeDir, env: processEnv });
        let stdout = '';
        let stderr = '';
        this.process.stdout.on('data', (data) => {
            stdout += data;
        });
        this.process.stderr.on('data', (data) => {
            stderr += data;
        });
        this.process.on('close', (code) => {
            this.process = null;
            if (code == 0) {
                this.output.appendLine('ok');
                this.runCode(executor);
            }
            else {
                this.output.appendLine('error!');
                if (stdout.length > 0)
                    this.output.appendLine(stdout);
                if (stderr.length > 0)
                    this.output.appendLine(stderr);
                this.jumpToErrorPosition(executor, stdout + stderr);
            }
        });
    }
    runCode(executor) {
        let inputFiles = this.getInputFiles(executor);
        if (inputFiles.length == 0) {
            if (executor.runAllInput) {
                this.runInTerminal(executor);
            }
            return;
        }
        this.runningCodeFile = executor.codeFile;
        let baseRunCmd = this.setCmdVar(executor, executor.runCmd);
        let runTopInput = () => {
            let inputFile = inputFiles[0];
            let outputFile = tools.getFileNoExtension(inputFile) + executor.outputExtension;
            let acceptFile = tools.getFileNoExtension(inputFile) + executor.acceptExtension;
            let runCmd = baseRunCmd;
            runCmd = tools.replaceVar(runCmd, "inputFile", inputFile);
            runCmd = tools.replaceVar(runCmd, "outputFile", outputFile);
            this.output.append('[' + path.basename(inputFile + '] as input, running... '));
            let processEnv = Object.assign({}, process.env);
            if (executor.PATH) {
                processEnv.PATH = executor.PATH + path.delimiter + processEnv.PATH;
            }
            processEnv.PATH = executor.codeDir + path.delimiter + processEnv.PATH;
            let startTime = new Date();
            if (this.executeTimer != null) {
                clearTimeout(this.executeTimer);
                this.executeTimer = null;
            }
            if (executor.timeLimit > 0) {
                this.executeTimer = setTimeout(() => {
                    if (this.process != null) {
                        this.timeLimitExceeded = true;
                        let kill = require('tree-kill');
                        kill(this.process.pid);
                    }
                }, executor.timeLimit * 1000);
            }
            this.process = require('child_process').exec(runCmd, { cwd: executor.codeDir, env: processEnv }, (err, stdout, stderr) => {
                if (this.killRequested) {
                    this.output.appendLine('STOPPED');
                    this.killRequested = false;
                    this.cleanup(executor);
                    return;
                }
                else if (this.timeLimitExceeded) {
                    this.output.appendLine('TLE');
                    this.timeLimitExceeded = false;
                }
                else {
                    let endTime = new Date();
                    let elapsedTime = (endTime.getTime() - startTime.getTime()) / 1000;
                    this.process = null;
                    if (err == null && stderr.length == 0) {
                        this.output.append('done ' + elapsedTime.toFixed(3) + 's');
                        let oFile = path.join(executor.codeDir, outputFile);
                        let aFile = path.join(executor.codeDir, acceptFile);
                        if (fs.existsSync(oFile)) {
                            if (fs.statSync(oFile).size == 0) {
                                this.output.append(' ' + executor.outputExtension + ' empty');
                                if (executor.cleanupAfterRun) {
                                    fs.unlinkSync(oFile);
                                }
                            }
                            else if (fs.existsSync(aFile) && fs.statSync(aFile).size > 0) {
                                if (this.compareOA(executor, oFile, aFile)) {
                                    this.output.append(' AC');
                                    if (executor.deleteOutputFiles) {
                                        fs.unlinkSync(oFile);
                                    }
                                }
                                else {
                                    this.output.appendLine(' WA');
                                    let showDiff = () => {
                                        vscode.workspace.openTextDocument(oFile).then(doc => {
                                            vscode.window.showTextDocument(doc, vscode.ViewColumn.Two).then(editor => {
                                                let diffTitle = outputFile + '⟷' + acceptFile;
                                                vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(oFile), vscode.Uri.file(aFile), diffTitle);
                                            });
                                            if (executor.showInputFileOnWrongAnswer) {
                                                let iFile = path.join(executor.codeDir, inputFile);
                                                vscode.workspace.openTextDocument(iFile).then(doc => {
                                                    vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                                                });
                                            }
                                            this.cleanup(executor);
                                        });
                                    };
                                    if (vscode.window.activeTextEditor.document.fileName == oFile) {
                                        vscode.commands.executeCommand('workbench.action.closeActiveEditor').then(() => {
                                            showDiff();
                                        });
                                    }
                                    else {
                                        showDiff();
                                    }
                                    return;
                                }
                            }
                            else {
                                this.output.append(' ' + executor.acceptExtension + ' empty');
                            }
                        }
                        this.output.appendLine('');
                    }
                    else {
                        this.output.appendLine('RTE');
                        if (!this.traceError(executor, runCmd, processEnv)) {
                            this.output.appendLine(stderr);
                            this.jumpToErrorPosition(executor, stderr);
                            this.cleanup(executor);
                        }
                        return;
                    }
                }
                inputFiles.shift();
                if (inputFiles.length == 0) {
                    this.cleanup(executor);
                    return;
                }
                runTopInput();
            });
        };
        runTopInput();
    }
    traceError(executor, runCmd, processEnv) {
        return et.TraceError(executor.errorTracer, runCmd, executor.codeDir, processEnv, (output) => {
            this.output.appendLine(output);
            this.jumpToErrorPosition(executor, output);
            this.cleanup(executor);
        });
    }
    compareOA(executor, oFile, aFile) {
        let readLineSync = require('./readLineSync');
        let oLiner = readLineSync(oFile);
        let aLiner = readLineSync(aFile);
        while (true) {
            let oline = oLiner.next();
            let aline = aLiner.next();
            if (oline.value != aline.value || oline.done != aline.done) {
                return false;
            }
            if (oline.done && aline.done) {
                return true;
            }
        }
    }
    cleanup(executor) {
        if (executor.cleanupAfterRun && executor.cleanupCmd) {
            let cleanupCmd = this.setCmdVar(executor, executor.cleanupCmd);
            this.output.append('cleanup... ');
            let processEnv = Object.assign({}, process.env);
            if (executor.PATH) {
                processEnv.PATH = executor.PATH + path.delimiter + processEnv.PATH;
            }
            processEnv.PATH = executor.codeDir + path.delimiter + processEnv.PATH;
            this.process = require('child_process').exec(cleanupCmd, { cwd: executor.codeDir, env: processEnv });
            this.process.on('close', (code) => {
                this.process = null;
                this.output.appendLine('done');
            });
        }
    }
    getListFileNeedSaved(executor) {
        if (executor.saveFileBeforeRun) {
            let saveList = [];
            let activeFileNoExt = tools.getFileNoExtension(vscode.window.activeTextEditor.document.fileName);
            vscode.workspace.textDocuments.forEach(doc => {
                if (!doc.isDirty)
                    return;
                if (doc.fileName == executor.codeDirFile) {
                    saveList.push(doc);
                }
                else if (doc.fileName.startsWith(executor.codeDirFileNoExt + ".")) {
                    if (executor.runAllInput || doc.fileName.startsWith(activeFileNoExt + ".")) {
                        let ext = path.extname(doc.fileName).toLowerCase();
                        if (ext == executor.inputExtension || ext == executor.acceptExtension || ext == executor.outputExtension) {
                            let mid = doc.fileName.substr(activeFileNoExt.length + 1, doc.fileName.length - activeFileNoExt.length - ext.length - 1);
                            if (mid.indexOf(".") < 0) {
                                saveList.push(doc);
                            }
                        }
                    }
                }
            });
            return saveList;
        }
    }
    saveFilesAndCompile(executor, saveList) {
        let saveTopDoc = () => {
            let doc = saveList[0];
            this.output.append('[' + path.basename(doc.fileName) + '] saving... ');
            doc.save().then(() => {
                this.output.appendLine('ok');
                saveList.shift();
                if (saveList.length == 0) {
                    this.compileCode(executor);
                }
                else {
                    saveTopDoc();
                }
            });
        };
        if (saveList.length > 0) {
            saveTopDoc();
        }
    }
    getInputFiles(executor) {
        let inputFiles = Array();
        let dirFiles = fs.readdirSync(executor.codeDir);
        let activeFileNoExt = tools.getFileNoExtension(path.basename(vscode.window.activeTextEditor.document.fileName));
        let lenName = executor.codeFileNoExt.length;
        let lenExt = executor.inputExtension.length;
        dirFiles.forEach(f => {
            if (executor.runAllInput || f.startsWith(activeFileNoExt + ".")) {
                if (f.startsWith(executor.codeFileNoExt) && f.toLowerCase().endsWith(executor.inputExtension)) {
                    let mid = f.substr(activeFileNoExt.length + 1, f.length - activeFileNoExt.length - lenExt - 1);
                    if (mid.indexOf(".") < 0) {
                        inputFiles.push(f);
                    }
                }
            }
        });
        inputFiles.sort((a, b) => {
            let midA = a.substr(lenName, a.length - lenName - lenExt);
            let midB = b.substr(lenName, b.length - lenName - lenExt);
            return midA < midB ? -1 : a == b ? 0 : 1;
        });
        return inputFiles;
    }
    clearTerminal() {
        this.terminal.hide();
        if (this.terminal != null) {
            try {
                this.terminal.dispose();
            }
            catch (error) {
            }
        }
        this.terminal = vscode.window.createTerminal('IO Run');
        if (os.platform() == 'win32') {
            this.terminal.sendText("cls");
        }
        else {
            this.terminal.sendText("clear");
        }
    }
    runInTerminal(executor) {
        if (executor.clearPreviousOutput) {
            this.clearTerminal();
        }
        this.terminal.sendText('cd ' + tools.quoteFileName(executor.codeDir));
        this.terminal.show();
        let runCmd = this.setCmdVar(executor, executor.runCmd);
        runCmd = runCmd.replace('<${inputFile}', '');
        runCmd = runCmd.replace('>${outputFile}', '');
        let cmd = runCmd.trim();
        if (executor.cleanupAfterRun && executor.cleanupCmd) {
            let cleanupCmd = this.setCmdVar(executor, executor.cleanupCmd);
            let delimiter = ' && ';
            if (os.platform() == 'win32') {
                delimiter = ' & ';
                if (vscode.workspace.getConfiguration("terminal.integrated.shell").get("windows", "").toLocaleLowerCase().endsWith("powershell.exe")) {
                    delimiter = ' "&" ';
                    cmd = "cmd /c " + cmd;
                }
            }
            cmd += delimiter + cleanupCmd.trim();
        }
        this.terminal.sendText(cmd);
    }
    rndName() {
        return Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10);
    }
    getExecutor(codeFile) {
        let executorMap = this.getExecutorMap();
        let ext = path.extname(codeFile);
        let executor = executorMap[ext];
        if (executor) {
            executor.codeDir = path.dirname(codeFile);
            executor.codeExt = ext;
            executor.codeFile = path.basename(codeFile);
            executor.codeFileNoExt = path.basename(tools.getFileNoExtension(executor.codeFile));
            executor.codeDirFile = codeFile;
            executor.codeDirFileNoExt = tools.getFileNoExtension(codeFile);
            executor.inputExtension = this.config.inputExtension.toLowerCase();
            executor.outputExtension = this.config.outputExtension.toLowerCase();
            executor.acceptExtension = this.config.acceptExtension.toLowerCase();
            executor.saveFileBeforeRun = this.config.get('saveFileBeforeRun');
            executor.clearPreviousOutput = this.config.get('clearPreviousOutput');
            executor.cleanupAfterRun = this.config.get('cleanupAfterRun');
            executor.deleteOutputFiles = this.config.get('deleteOutputFiles');
            executor.timeLimit = this.config.get('timeLimit');
            executor.showInputFileOnWrongAnswer = this.config.get('showInputFileOnWrongAnswer');
        }
        return executor;
    }
    getExecutorMap() {
        let commonMap = this.config.get('executorMap.common');
        let osMap = this.config.get('executorMap.' + os.platform());
        let commonMapObject = tools.unwrap(commonMap);
        let osMapObject = tools.unwrap(osMap);
        if (osMapObject != null) {
            Object.keys(osMapObject).forEach(function (key) {
                if (!commonMapObject[key]) {
                    commonMapObject[key] = osMapObject[key];
                }
                else {
                    Object.keys(osMapObject[key]).forEach(function (subkey) {
                        commonMapObject[key][subkey] = osMapObject[key][subkey];
                    });
                }
            });
        }
        return commonMapObject;
    }
    getCodeFile() {
        let executorMap = this.getExecutorMap();
        let activeFile = vscode.window.activeTextEditor.document.fileName;
        let extension = path.extname(activeFile).toLowerCase();
        let executor = executorMap[extension];
        if (executor != null) {
            return activeFile;
        }
        let inputExtension = this.config.inputExtension.toLowerCase();
        let outputExtension = this.config.outputExtension.toLowerCase();
        let acceptExtension = this.config.acceptExtension.toLowerCase();
        if (extension != inputExtension && extension != outputExtension && extension != acceptExtension) {
            return null;
        }
        let activeFileNoExt = tools.getFileNoExtension(activeFile);
        let activeFileNoExt2 = tools.getFileNoExtension(activeFileNoExt);
        for (var doc of vscode.workspace.textDocuments) {
            if (doc.fileName.startsWith(activeFileNoExt + '.') || doc.fileName.startsWith(activeFileNoExt2 + '.')) {
                let ext = path.extname(doc.fileName).toLowerCase();
                if (executorMap[ext]) {
                    return doc.fileName;
                }
            }
        }
        if (activeFileNoExt == '')
            return null;
        for (var ext in executorMap) {
            let fileName = activeFileNoExt + ext;
            if (fs.existsSync(fileName)) {
                return fileName;
            }
            fileName = activeFileNoExt + ext.toUpperCase();
            if (fs.existsSync(fileName)) {
                return fileName;
            }
        }
        if (activeFileNoExt2 == '')
            return null;
        for (var ext in executorMap) {
            let fileName = activeFileNoExt2 + ext;
            if (fs.existsSync(fileName)) {
                return fileName;
            }
            fileName = activeFileNoExt2 + ext.toUpperCase();
            if (fs.existsSync(fileName)) {
                return fileName;
            }
        }
        return null;
    }
    getWorkspaceRoot(codeFileDir) {
        return vscode.workspace.rootPath ? vscode.workspace.rootPath : codeFileDir;
    }
}
exports.IORunManager = IORunManager;
//# sourceMappingURL=ioRunManager.js.map