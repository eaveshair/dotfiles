"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
class SectionNodeProvider {
    constructor(extension) {
        this.extension = extension;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.sectionDepths = {};
        // our data source is a set multi-rooted set of trees
        this.ds = [];
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        this.hierarchy = configuration.get('view.outline.sections');
        this.hierarchy.forEach((section, index) => {
            section.split('|').forEach(sec => {
                this.sectionDepths[sec] = index;
            });
        });
    }
    refresh() {
        if (this.extension.manager.rootFile) {
            this.ds = this.buildModel(this.extension.manager.rootFile);
            return this.ds;
        }
        else {
            return [];
        }
    }
    update() {
        this._onDidChangeTreeData.fire();
    }
    buildModel(filePath, parentStack, parentChildren) {
        let rootStack = [];
        if (parentStack) {
            rootStack = parentStack;
        }
        let children = [];
        if (parentChildren) {
            children = parentChildren;
        }
        const currentRoot = () => {
            return rootStack[rootStack.length - 1];
        };
        const noRoot = () => {
            return rootStack.length === 0;
        };
        this.extension.logger.addLogMessage(`Parsing ${filePath} for outline`);
        let content = fs.readFileSync(filePath, 'utf-8');
        const endPos = content.search(/^(?!%)\s*\\end{document}/gm);
        if (endPos > -1) {
            content = content.substr(0, endPos);
        }
        let pattern = '^(?!%)\\s*(?:((?:\\\\(?:input|include|subfile)(?:\\[[^\\[\\]\\{\\}]*\\])?){([^}]*)})|((?:\\\\(';
        this.hierarchy.forEach((section, index) => {
            pattern += section;
            if (index < this.hierarchy.length - 1) {
                pattern += '|';
            }
        });
        pattern += ')(?:\\*)?(?:\\[[^\\[\\]\\{\\}]*\\])?){([^}]*)}))';
        // const inputReg = /^((?:\\(?:input|include|subfile)(?:\[[^\[\]\{\}]*\])?){([^}]*)})|^((?:\\((sub)?section)(?:\[[^\[\]\{\}]*\])?){([^}]*)})/gm
        const inputReg = RegExp(pattern, 'gm');
        // if it's a section elements 4 = section
        // element 6 = title.
        // if it's a subsection:
        // element X = title
        // if it's an input, include, or subfile:
        // element 2 is the file (need to resolve the path)
        // element 0 starts with \input, include, or subfile
        while (true) {
            const result = inputReg.exec(content);
            if (!result) {
                break;
            }
            if (result[4] in this.sectionDepths) {
                // is it a section, a subsection, etc?
                const heading = result[4];
                const title = result[5];
                const depth = this.sectionDepths[heading];
                const prevContent = content.substring(0, content.substring(0, result.index).lastIndexOf('\n') - 1);
                // get a  line number
                const lineNumber = (prevContent.match(/\n/g) || []).length;
                const newSection = new Section(title, vscode.TreeItemCollapsibleState.Expanded, depth, lineNumber, filePath);
                // console.log("Created New Section: " + title)
                if (noRoot()) {
                    children.push(newSection);
                    rootStack.push(newSection);
                    continue;
                }
                // Find the proper root section
                while (!noRoot() && currentRoot().depth >= depth) {
                    rootStack.pop();
                }
                if (noRoot()) {
                    children.push(newSection);
                }
                else {
                    currentRoot().children.push(newSection);
                }
                rootStack.push(newSection);
                // if this is the same depth as the current root, append to the children array
                // i.e., at this level
                // if (depth === currentRoot().depth) {
                //     rootStack.push(newSection)
                // }
                // if (depth === 0) {
                //     children.push(newSection)
                // } else if (depth < currentRoot().depth) { // it's one level UP
                //     rootStack.pop()
                //     currentRoot().children.push(newSection)
                // } else { // it's one level DOWN (add it to the children of the current node)
                //     currentRoot().children.push(newSection)
                // }
            }
            else if (result[1].startsWith('\\input') || result[1].startsWith('\\include') || result[1].startsWith('\\subfile')) {
                // zoom into this file
                // resolve the path
                let inputFilePath = path.resolve(path.join(this.extension.manager.rootDir, result[2]));
                if (path.extname(inputFilePath) === '') {
                    inputFilePath += '.tex';
                }
                if (!fs.existsSync(inputFilePath) && fs.existsSync(inputFilePath + '.tex')) {
                    inputFilePath += '.tex';
                }
                if (fs.existsSync(inputFilePath) === false) {
                    this.extension.logger.addLogMessage(`Could not resolve included file ${inputFilePath}`);
                    //console.log(`Could not resolve included file ${inputFilePath}`)
                    continue;
                }
                this.buildModel(inputFilePath, rootStack, children);
            }
        }
        return children;
    }
    getTreeItem(element) {
        const hasChildren = element.children.length > 0;
        const treeItem = new vscode.TreeItem(element.label, hasChildren ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
        treeItem.command = {
            command: 'latex-workshop.goto-section',
            title: '',
            arguments: [element.fileName, element.lineNumber]
        };
        return treeItem;
    }
    getChildren(element) {
        if (this.extension.manager.rootFile === undefined) {
            return Promise.resolve([]);
        }
        // if the root doesn't exist, we need
        // to explicitly build the model from disk
        if (!element) {
            return Promise.resolve(this.refresh());
        }
        return Promise.resolve(element.children);
    }
}
exports.SectionNodeProvider = SectionNodeProvider;
class Section extends vscode.TreeItem {
    constructor(label, collapsibleState, depth, lineNumber, fileName, command) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.depth = depth;
        this.lineNumber = lineNumber;
        this.fileName = fileName;
        this.command = command;
        this.children = [];
        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'Section.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'Section.svg')
        };
        this.contextValue = 'Section';
    }
}
//# sourceMappingURL=outline.js.map