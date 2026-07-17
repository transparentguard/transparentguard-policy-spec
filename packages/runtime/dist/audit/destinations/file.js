"use strict";
/**
 * TransparentGuard Runtime — File Audit Destination
 * Appends audit events to a local file in ndjson, json, or ocsf format.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDestination = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const emitter_js_1 = require("../emitter.js");
class FileDestination {
    filePath;
    ensuredDir = false;
    constructor(filePath) {
        // Strip leading slash if file:// was stripped already (e.g. "file://./logs/audit.jsonl")
        this.filePath = path_1.default.resolve(filePath.startsWith("/") ? filePath : filePath);
    }
    async write(events, format) {
        if (events.length === 0)
            return;
        if (!this.ensuredDir) {
            const dir = path_1.default.dirname(this.filePath);
            fs_1.default.mkdirSync(dir, { recursive: true });
            this.ensuredDir = true;
        }
        const data = emitter_js_1.AuditEmitter.serialize(events, format);
        fs_1.default.appendFileSync(this.filePath, data, "utf8");
    }
    async flush() {
        // File writes are synchronous — nothing to flush
    }
}
exports.FileDestination = FileDestination;
//# sourceMappingURL=file.js.map