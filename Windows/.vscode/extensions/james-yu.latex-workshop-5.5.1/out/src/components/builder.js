"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const cp = require("child_process");
class Builder {
    constructor(extension) {
        this.disableBuildAfterSave = false;
        this.disableCleanAndRetry = false;
        this.extension = extension;
    }
    kill() {
        if (this.currentProcess) {
            this.currentProcess.kill();
            this.extension.logger.addLogMessage('Kill the current process.');
        }
    }
    preprocess(rootFile) {
        this.extension.logger.addLogMessage(`Build root file ${rootFile}`);
        this.disableBuildAfterSave = true;
        vscode.workspace.saveAll();
        this.disableBuildAfterSave = false;
        if (this.currentProcess) {
            this.currentProcess.kill();
            this.extension.logger.addLogMessage('Kill previous process.');
            this.nextBuildRootFile = rootFile;
        }
        else {
            this.nextBuildRootFile = undefined;
        }
    }
    buildInitiator(rootFile, recipe = undefined) {
        const steps = this.createSteps(rootFile, recipe);
        if (steps === undefined) {
            this.extension.logger.addLogMessage('Invalid toolchain.');
            return;
        }
        this.buildStep(rootFile, steps, 0, recipe || 'Build'); // use 'Build' as default name
    }
    build(rootFile, recipe = undefined) {
        this.disableCleanAndRetry = false;
        this.extension.logger.displayStatus('sync~spin', 'statusBar.foreground');
        this.preprocess(rootFile);
        if (this.nextBuildRootFile === undefined) {
            this.buildInitiator(rootFile, recipe);
        }
    }
    progressString(recipeName, steps, index) {
        if (steps.length < 2) {
            return recipeName;
        }
        else {
            return recipeName + `: ${index + 1}/${steps.length} (${steps[index].name})`;
        }
    }
    buildStep(rootFile, steps, index, recipeName) {
        if (steps.length === index) {
            this.extension.logger.addLogMessage(`Recipe of length ${steps.length} finished.`);
            this.buildFinished(rootFile);
            return;
        }
        this.extension.logger.displayStatus('sync~spin', 'statusBar.foreground', undefined, undefined, ` ${this.progressString(recipeName, steps, index)}`);
        this.extension.logger.clearCompilerMessage();
        this.extension.logger.addLogMessage(`Recipe step ${index + 1}: ${steps[index].command}, ${steps[index].args}`);
        this.currentProcess = cp.spawn(steps[index].command, steps[index].args, { cwd: path.dirname(rootFile) });
        let stdout = '';
        this.currentProcess.stdout.on('data', newStdout => {
            stdout += newStdout;
            this.extension.logger.addCompilerMessage(newStdout.toString());
        });
        let stderr = '';
        this.currentProcess.stderr.on('data', newStderr => {
            stderr += newStderr;
            this.extension.logger.addCompilerMessage(newStderr.toString());
        });
        this.currentProcess.on('error', err => {
            this.extension.logger.addLogMessage(`LaTeX fatal error: ${err.message}, ${stderr}. Does the executable exist?`);
            this.extension.logger.displayStatus('x', 'errorForeground', `Recipe terminated with fatal error: ${err.message}.`);
            this.currentProcess = undefined;
        });
        this.currentProcess.on('exit', (exitCode, signal) => {
            this.extension.parser.parse(stdout);
            if (exitCode !== 0) {
                this.extension.logger.addLogMessage(`Recipe returns with error: ${exitCode}/${signal}.`);
                const configuration = vscode.workspace.getConfiguration('latex-workshop');
                if (!this.disableCleanAndRetry && configuration.get('latex.autoBuild.cleanAndRetry.enabled') && !configuration.get('latex.clean.enabled')) {
                    this.extension.logger.displayStatus('x', 'errorForeground', `Recipe terminated with error. Retry building the project.`, 'warning');
                    this.extension.logger.addLogMessage(`Cleaning auxillary files and retrying build after toolchain error.`);
                    this.disableCleanAndRetry = true;
                    this.extension.commander.clean().then(() => {
                        this.buildStep(rootFile, steps, 0, recipeName);
                    });
                }
                else {
                    this.extension.logger.displayStatus('x', 'errorForeground');
                    const res = this.extension.logger.showErrorMessage('Recipe terminated with error.', 'Open compiler log');
                    if (res) {
                        res.then(option => {
                            switch (option) {
                                case 'Open compiler log':
                                    this.extension.logger.showCompilerLog();
                                    break;
                                default:
                                    break;
                            }
                        });
                    }
                }
            }
            else {
                this.buildStep(rootFile, steps, index + 1, recipeName);
            }
            this.currentProcess = undefined;
            if (this.nextBuildRootFile) {
                this.build(this.nextBuildRootFile);
            }
        });
    }
    buildFinished(rootFile) {
        this.extension.logger.addLogMessage(`Successfully built ${rootFile}`);
        this.extension.logger.displayStatus('check', 'statusBar.foreground', `Recipe succeeded.`);
        this.extension.viewer.refreshExistingViewer(rootFile);
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        if (configuration.get('latex.clean.enabled')) {
            this.extension.cleaner.clean();
        }
    }
    createSteps(rootFile, recipeName) {
        let steps = [];
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const [magicTex, magicBib] = this.findProgramMagic(rootFile);
        if (recipeName === undefined && magicTex) {
            const magicTexStep = {
                name: magicTex,
                command: magicTex,
                args: configuration.get('latex.magic.args')
            };
            const magicBibStep = {
                name: magicBib,
                command: magicBib,
                args: configuration.get('latex.magic.bib.args')
            };
            if (magicBib) {
                steps = [magicTexStep, magicBibStep, magicTexStep, magicTexStep];
            }
            else {
                steps = [magicTexStep];
            }
        }
        else {
            const recipes = configuration.get('latex.recipes');
            const tools = configuration.get('latex.tools');
            if (recipes.length < 1) {
                this.extension.logger.showErrorMessage(`No recipes defined.`);
                return undefined;
            }
            let recipe = recipes[0];
            if (recipeName) {
                const candidates = recipes.filter(candidate => candidate.name === recipeName);
                if (candidates.length < 1) {
                    this.extension.logger.showErrorMessage(`Failed to resolve build recipe: ${recipeName}`);
                }
                recipe = candidates[0];
            }
            recipe.tools.forEach(tool => {
                if (typeof tool === 'string') {
                    const candidates = tools.filter(candidate => candidate.name === tool);
                    if (candidates.length < 1) {
                        this.extension.logger.showErrorMessage(`Skipping undefined tool "${tool}" in recipe "${recipe.name}."`);
                    }
                    else {
                        steps.push(candidates[0]);
                    }
                }
                else {
                    steps.push(tool);
                }
            });
        }
        steps = JSON.parse(JSON.stringify(steps));
        const docker = configuration.get('docker.enabled');
        steps.forEach(step => {
            if (docker) {
                switch (step.command) {
                    case 'latexmk':
                        if (process.platform === 'win32') {
                            step.command = path.join(this.extension.extensionRoot, 'scripts/latexmk.bat');
                        }
                        else {
                            step.command = path.join(this.extension.extensionRoot, 'scripts/latexmk');
                            fs.chmodSync(step.command, 0o777);
                        }
                        break;
                    default:
                        break;
                }
            }
            if (step.args) {
                const doc = rootFile.replace(/\.tex$/, '').split(path.sep).join('/');
                const docfile = path.basename(rootFile, '.tex').split(path.sep).join('/');
                step.args = step.args.map(arg => arg.replace('%DOC%', docker ? docfile : doc)
                    .replace('%DOCFILE%', docfile)
                    .replace('%DIR%', path.dirname(rootFile).split(path.sep).join('/')));
            }
        });
        return steps;
    }
    findProgramMagic(rootFile) {
        const regexTex = /(?:%\s*!\s*T[Ee]X\s(?:TS-)?program\s*=\s*([^\s]*)$)/m;
        const regexBib = /(?:%\s*!\s*BIB\s(?:TS-)?program\s*=\s*([^\s]*)$)/m;
        const content = fs.readFileSync(rootFile).toString();
        const tex = content.match(regexTex);
        const bib = content.match(regexBib);
        let texProgram = '';
        let bibProgram = '';
        if (tex) {
            texProgram = tex[1];
            this.extension.logger.addLogMessage(`Found TeX program by magic comment: ${texProgram}`);
        }
        if (bib) {
            bibProgram = bib[1];
            this.extension.logger.addLogMessage(`Found BIB program by magic comment: ${bibProgram}`);
        }
        return [texProgram, bibProgram];
    }
}
exports.Builder = Builder;
//# sourceMappingURL=builder.js.map