"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const fs = require("fs");
const bibEntries = ['article', 'book', 'bookinbook', 'booklet', 'collection', 'conference', 'inbook',
    'incollection', 'inproceedings', 'inreference', 'manual', 'mastersthesis', 'misc',
    'mvbook', 'mvcollection', 'mvproceedings', 'mvreference', 'online', 'patent', 'periodical',
    'phdthesis', 'proceedings', 'reference', 'report', 'set', 'suppbook', 'suppcollection',
    'suppperiodical', 'techreport', 'thesis', 'unpublished'];
class Citation {
    constructor(extension) {
        this.citationInBib = {};
        this.citationData = {};
        this.extension = extension;
    }
    provide() {
        if (Date.now() - this.refreshTimer < 1000) {
            return this.suggestions;
        }
        this.refreshTimer = Date.now();
        const items = [];
        Object.keys(this.citationInBib).forEach(bibPath => {
            this.citationInBib[bibPath].forEach(item => items.push(item));
        });
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        this.suggestions = items.map(item => {
            const citation = new vscode.CompletionItem(item.key, vscode.CompletionItemKind.Reference);
            citation.detail = item.title;
            switch (configuration.get('intellisense.citation.label')) {
                case 'bibtex key':
                default:
                    citation.label = item.key;
                    break;
                case 'title':
                    if (item.title) {
                        citation.label = item.title;
                        citation.detail = undefined;
                    }
                    else {
                        citation.label = item.key;
                    }
                    break;
                case 'authors':
                    if (item.author) {
                        citation.label = item.author;
                        citation.detail = undefined;
                    }
                    else {
                        citation.label = item.key;
                    }
                    break;
            }
            citation.filterText = `${item.key} ${item.author} ${item.title} ${item.journal}`;
            citation.insertText = item.key;
            citation.documentation = Object.keys(item)
                .filter(key => (key !== 'key'))
                .map(key => `${key}: ${item[key]}`)
                .join('\n');
            return citation;
        });
        return this.suggestions;
    }
    browser() {
        this.provide();
        const items = [];
        Object.keys(this.citationInBib).forEach(bibPath => {
            this.citationInBib[bibPath].forEach(item => items.push(item));
        });
        const pickItems = items.map(item => {
            return {
                label: item.title ? item.title : '',
                description: `${item.key}`,
                detail: `Authors: ${item.author ? item.author : 'Unknown'}, publication: ${item.journal ? item.journal : (item.publisher ? item.publisher : 'Unknown')}`
            };
        });
        vscode.window.showQuickPick(pickItems, {
            placeHolder: 'Press ENTER to insert citation key at cursor',
            matchOnDetail: true,
            matchOnDescription: true
        }).then(selected => {
            if (!selected) {
                return;
            }
            if (vscode.window.activeTextEditor) {
                const editor = vscode.window.activeTextEditor;
                const content = editor.document.getText(new vscode.Range(new vscode.Position(0, 0), editor.selection.start));
                let start = editor.selection.start;
                if (content.lastIndexOf('\\cite') > content.lastIndexOf('}')) {
                    const curlyStart = content.lastIndexOf('{') + 1;
                    const commaStart = content.lastIndexOf(',') + 1;
                    start = editor.document.positionAt(curlyStart > commaStart ? curlyStart : commaStart);
                }
                editor.edit(edit => edit.replace(new vscode.Range(start, editor.selection.start), selected.description));
            }
        });
    }
    parseBibFile(bibPath) {
        this.extension.logger.addLogMessage(`Parsing .bib entries from ${bibPath}`);
        const items = [];
        const content = fs.readFileSync(bibPath, 'utf-8');
        const contentNoNewLine = content.replace(/[\r\n]/g, ' ');
        const itemReg = /@(\w+)\s*{/g;
        let result = itemReg.exec(contentNoNewLine);
        let prevResult = null;
        while (result || prevResult) {
            if (prevResult && bibEntries.indexOf(prevResult[1].toLowerCase()) > -1) {
                const itemString = contentNoNewLine.substring(prevResult.index, result ? result.index : undefined).trim();
                const item = this.parseBibString(itemString);
                if (item !== undefined) {
                    items.push(item);
                    const positionContent = content.substring(0, prevResult.index).split('\n');
                    this.citationData[item.key] = {
                        item,
                        text: Object.keys(item)
                            .filter(key => (key !== 'key'))
                            .sort((a, b) => {
                            if (a.toLowerCase() === 'title') {
                                return -1;
                            }
                            if (b.toLowerCase() === 'title') {
                                return 1;
                            }
                            if (a.toLowerCase() === 'author') {
                                return -1;
                            }
                            if (b.toLowerCase() === 'author') {
                                return 1;
                            }
                            return 0;
                        })
                            .map(key => `${key}: ${item[key]}`)
                            .join('\n\n'),
                        position: new vscode.Position(positionContent.length - 1, 0),
                        file: bibPath
                    };
                }
                else {
                    // TODO we could consider adding a diagnostic for this case so the issue appears in the Problems list
                    this.extension.logger.addLogMessage(`Warning - following .bib entry in ${bibPath} has no cite key:\n${itemString}`);
                }
            }
            prevResult = result;
            if (result) {
                result = itemReg.exec(contentNoNewLine);
            }
        }
        this.extension.logger.addLogMessage(`Parsed ${items.length} .bib entries from ${bibPath}.`);
        this.citationInBib[bibPath] = items;
    }
    forgetParsedBibItems(bibPath) {
        this.extension.logger.addLogMessage(`Forgetting parsed bib entries for ${bibPath}`);
        delete this.citationInBib[bibPath];
    }
    parseBibString(item) {
        const bibDefinitionReg = /((@)[a-zA-Z]+)\s*(\{)\s*([^\s,]*)/g;
        let regResult = bibDefinitionReg.exec(item);
        if (!regResult) {
            return undefined;
        }
        item = item.substr(bibDefinitionReg.lastIndex);
        const bibItem = { key: regResult[4] };
        const bibAttrReg = /([a-zA-Z0-9\!\$\&\*\+\-\.\/\:\;\<\>\?\[\]\^\_\`\|]+)\s*(\=)/g;
        regResult = bibAttrReg.exec(item);
        while (regResult) {
            const attrKey = regResult[1];
            item = item.substr(bibAttrReg.lastIndex);
            bibAttrReg.lastIndex = 0;
            const commaPos = /,/g.exec(item);
            const quotePos = /\"/g.exec(item);
            const bracePos = /{/g.exec(item);
            let attrValue = '';
            if (commaPos && ((!quotePos || (quotePos && (commaPos.index < quotePos.index)))
                && (!bracePos || (bracePos && (commaPos.index < bracePos.index))))) {
                // No deliminator
                attrValue = item.substring(0, commaPos.index).trim();
                item = item.substr(commaPos.index);
            }
            else if (bracePos && (!quotePos || quotePos.index > bracePos.index)) {
                // Use curly braces
                let nested = 0;
                for (let i = bracePos.index; i < item.length; ++i) {
                    const char = item[i];
                    if (char === '{' && item[i - 1] !== '\\') {
                        nested++;
                    }
                    else if (char === '}' && item[i - 1] !== '\\') {
                        nested--;
                    }
                    if (nested === 0) {
                        attrValue = item.substring(bracePos.index + 1, i)
                            .replace(/(\\.)|({)/g, '$1').replace(/(\\.)|(})/g, '$1');
                        item = item.substr(i);
                        break;
                    }
                }
            }
            else if (quotePos) {
                // Use double quotes
                for (let i = quotePos.index + 1; i < item.length; ++i) {
                    if (item[i] === '"') {
                        attrValue = item.substring(quotePos.index + 1, i)
                            .replace(/(\\.)|({)/g, '$1').replace(/(\\.)|(})/g, '$1');
                        item = item.substr(i);
                        break;
                    }
                }
            }
            bibItem[attrKey.toLowerCase()] = attrValue;
            regResult = bibAttrReg.exec(item);
        }
        return bibItem;
    }
}
exports.Citation = Citation;
//# sourceMappingURL=citation.js.map