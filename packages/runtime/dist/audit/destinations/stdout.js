"use strict";
/**
 * TransparentGuard Runtime — Stdout Audit Destination
 * Writes audit events to stdout. Useful for development and log aggregators.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StdoutDestination = void 0;
const emitter_js_1 = require("../emitter.js");
class StdoutDestination {
    async write(events, format) {
        if (events.length === 0)
            return;
        const data = emitter_js_1.AuditEmitter.serialize(events, format);
        process.stdout.write(data);
    }
    async flush() {
        // stdout is unbuffered — nothing to flush
    }
}
exports.StdoutDestination = StdoutDestination;
//# sourceMappingURL=stdout.js.map