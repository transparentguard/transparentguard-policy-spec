/**
 * TransparentGuard Runtime — PIE Framework Drift Detector
 * Tracks known framework/regulation publication versions and warns when
 * a deployed template may be behind the latest published guidance.
 * Framework version updates are published at transparentguard.dev/framework-versions.
 */
export interface DriftWarning {
    framework: string;
    current_version: string;
    latest_known_version: string;
    published_at: string;
    message: string;
    guidance_url: string;
}
interface FrameworkVersionEntry {
    version: string;
    published_at: string;
    summary: string;
    guidance_url: string;
}
/**
 * Checks whether the active compliance frameworks are aligned with the
 * latest known regulatory guidance. Returns an array of DriftWarning
 * for any framework that is behind.
 */
export declare function checkFrameworkDrift(frameworks: string[]): DriftWarning[];
/**
 * Returns the latest known version metadata for a given framework.
 */
export declare function getFrameworkVersion(framework: string): FrameworkVersionEntry | undefined;
/**
 * Returns all known framework version entries.
 */
export declare function getAllFrameworkVersions(): Record<string, FrameworkVersionEntry>;
export {};
//# sourceMappingURL=drift.d.ts.map