'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
function getFileNoExtension(filePath) {
    let index = filePath.lastIndexOf(".");
    if (index !== -1) {
        return filePath.substr(0, index);
    }
    else {
        return filePath;
    }
}
exports.getFileNoExtension = getFileNoExtension;
function quoteFileName(filePath) {
    if (filePath.match(/\s/)) {
        filePath = '"' + filePath.replace(/"/g, '\"') + '"';
    }
    return filePath;
}
exports.quoteFileName = quoteFileName;
function replaceVar(originalStr, varName, value) {
    let regx = new RegExp("\\$\\{" + varName + "([\\W][^ }]+)?\\}", "g");
    if (value.match(/\s/)) {
        value = value.replace(/"/g, '\\"');
        return originalStr.replace(regx, '"' + value + '$1"');
    }
    return originalStr.replace(regx, value + '$1');
}
exports.replaceVar = replaceVar;
function unwrap(proxy) {
    if (typeof proxy !== 'object') {
        return proxy;
    }
    let obj = {};
    Object.keys(proxy).forEach(function (key) {
        let s = proxy[key];
        let u = unwrap(s);
        obj[key] = u;
    });
    return obj;
}
exports.unwrap = unwrap;
//# sourceMappingURL=tools.js.map