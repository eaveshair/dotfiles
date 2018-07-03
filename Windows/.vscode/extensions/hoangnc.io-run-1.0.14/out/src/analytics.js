'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var visitor = null;
var enable = false;
(() => {
    var ua = require('universal-analytics');
    var nmi = require('node-machine-id');
    const mid = nmi.machineIdSync(true);
    const uaid = 'UA-106099545-2';
    visitor = ua(uaid, mid, { https: true });
})();
function updateConfig(config) {
    enable = config.get('enableAnalytic');
}
exports.updateConfig = updateConfig;
function send(label, value) {
    if (enable) {
        visitor.event(label, value).send();
    }
}
exports.send = send;
//# sourceMappingURL=analytics.js.map