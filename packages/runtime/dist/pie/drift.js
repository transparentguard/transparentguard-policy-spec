"use strict";
/**
 * TransparentGuard Runtime — PIE Framework Drift Detector
 * Tracks known framework/regulation publication versions and warns when
 * a deployed template may be behind the latest published guidance.
 * Framework version updates are published at transparentguard.dev/framework-versions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkFrameworkDrift = checkFrameworkDrift;
exports.getFrameworkVersion = getFrameworkVersion;
exports.getAllFrameworkVersions = getAllFrameworkVersions;
const KNOWN_FRAMEWORK_VERSIONS = {
    hipaa: {
        version: "2024.1",
        published_at: "2024-04-22",
        summary: "HHS Office for Civil Rights HIPAA Security Rule updates (2024 NPRM) — enhanced cybersecurity requirements for electronic PHI.",
        guidance_url: "https://www.hhs.gov/hipaa/for-professionals/security/index.html",
    },
    gdpr: {
        version: "2024.2",
        published_at: "2024-09-01",
        summary: "EDPB Guidelines 1/2024 on processing of personal data in the context of connected vehicles and mobility related applications.",
        guidance_url: "https://edpb.europa.eu/our-work-tools/documents/our-documents/guidelines_en",
    },
    "eu-ai-act": {
        version: "2024.1",
        published_at: "2024-08-01",
        summary: "EU AI Act (Regulation EU 2024/1689) entered into force. Prohibited practices provisions apply from February 2025.",
        guidance_url: "https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai",
    },
    soc2: {
        version: "2022.1",
        published_at: "2022-10-17",
        summary: "AICPA updated Trust Services Criteria — current baseline. Next revision expected 2025.",
        guidance_url: "https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services",
    },
    "fedramp-moderate": {
        version: "2024.1",
        published_at: "2024-11-01",
        summary: "FedRAMP Rev 5 baselines aligned to NIST SP 800-53 Rev 5. Transition deadline: May 2024 (extended).",
        guidance_url: "https://www.fedramp.gov/blog/2024-03-28-nist-sp-800-53-rev-5-transition-deadline/",
    },
    ccpa: {
        version: "2023.1",
        published_at: "2023-07-14",
        summary: "CPPA approved final CCPA regulations under CPRA, effective March 2024.",
        guidance_url: "https://cppa.ca.gov/regulations/",
    },
};
// ---------------------------------------------------------------------------
// Version stored in the TransparentGuard runtime template set
// ---------------------------------------------------------------------------
const RUNTIME_TEMPLATE_VERSIONS = {
    hipaa: "2024.1",
    gdpr: "2024.2",
    "eu-ai-act": "2024.1",
    soc2: "2022.1",
    "fedramp-moderate": "2024.1",
    ccpa: "2023.1",
};
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Checks whether the active compliance frameworks are aligned with the
 * latest known regulatory guidance. Returns an array of DriftWarning
 * for any framework that is behind.
 */
function checkFrameworkDrift(frameworks) {
    const warnings = [];
    for (const fw of frameworks) {
        const known = KNOWN_FRAMEWORK_VERSIONS[fw];
        const current = RUNTIME_TEMPLATE_VERSIONS[fw];
        if (!known || !current)
            continue; // Unknown framework — skip
        if (current !== known.version) {
            warnings.push({
                framework: fw,
                current_version: current,
                latest_known_version: known.version,
                published_at: known.published_at,
                message: `Framework "${fw}" template version ${current} may be behind the latest guidance (${known.version}, published ${known.published_at}). ${known.summary}`,
                guidance_url: known.guidance_url,
            });
        }
    }
    return warnings;
}
/**
 * Returns the latest known version metadata for a given framework.
 */
function getFrameworkVersion(framework) {
    return KNOWN_FRAMEWORK_VERSIONS[framework];
}
/**
 * Returns all known framework version entries.
 */
function getAllFrameworkVersions() {
    return { ...KNOWN_FRAMEWORK_VERSIONS };
}
//# sourceMappingURL=drift.js.map