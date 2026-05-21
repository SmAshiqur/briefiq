// APIConfig.swift
// Single source of truth for the BriefIQ API base URL.
//
// Why this exists separately from APIClient:
//   xcodegen regenerates BriefIQ.xcodeproj — any base URL set as a Scheme
//   environment variable is wiped on every `xcodegen generate`. We instead
//   bake the URL into Info.plist (which xcodegen owns) and allow a runtime
//   UserDefaults override so a developer can swap LAN IPs without rebuilding.
//
// Resolution order (highest priority first):
//   1. UserDefaults("briefiq.apiBaseURL")        — runtime override (Settings)
//   2. ProcessInfo env "BRIEFIQ_API_BASE_URL"    — Scheme env var (CI / tests)
//   3. Info.plist key "BriefIQAPIBaseURL"        — bundled default (project.yml)
//   4. Hard-coded "http://localhost:3000"        — last-ditch dev default

import Foundation

enum APIConfig {
    /// UserDefaults key for the runtime override. Settings screen writes here.
    static let userDefaultsKey = "briefiq.apiBaseURL"

    /// Name of the env var read from the Xcode Scheme.
    static let envVarName = "BRIEFIQ_API_BASE_URL"

    /// Info.plist key (set in project.yml under BriefIQ.info.properties).
    static let infoPlistKey = "BriefIQAPIBaseURL"

    /// Resolved base URL — never nil; falls back to localhost in the worst case.
    static var baseURL: URL {
        if let url = resolvedURL() {
            return url
        }
        // Last-ditch fallback so the app still launches without crashing.
        return URL(string: "http://localhost:3000")!
    }

    /// Human-readable source label for the diagnostics screen.
    static var resolvedSource: String {
        if userDefaultsValue() != nil { return "UserDefaults override" }
        if envValue() != nil { return "Scheme env var" }
        if infoPlistValue() != nil { return "Info.plist (project.yml)" }
        return "default (localhost)"
    }

    /// Persist a runtime override. Pass nil to clear and fall back to lower
    /// priority sources. Returns the new resolved URL.
    @discardableResult
    static func setOverride(_ raw: String?) -> URL {
        let defaults = UserDefaults.standard
        if let raw, let trimmed = trim(raw), URL(string: trimmed) != nil {
            defaults.set(trimmed, forKey: userDefaultsKey)
        } else {
            defaults.removeObject(forKey: userDefaultsKey)
        }
        return baseURL
    }

    // ── Private helpers ───────────────────────────────────────────────────

    private static func resolvedURL() -> URL? {
        if let raw = userDefaultsValue(), let url = URL(string: raw) { return url }
        if let raw = envValue(), let url = URL(string: raw) { return url }
        if let raw = infoPlistValue(), let url = URL(string: raw) { return url }
        return nil
    }

    private static func userDefaultsValue() -> String? {
        trim(UserDefaults.standard.string(forKey: userDefaultsKey))
    }

    private static func envValue() -> String? {
        trim(ProcessInfo.processInfo.environment[envVarName])
    }

    private static func infoPlistValue() -> String? {
        trim(Bundle.main.object(forInfoDictionaryKey: infoPlistKey) as? String)
    }

    /// Returns the string with whitespace trimmed, or nil if it is empty.
    private static func trim(_ value: String?) -> String? {
        guard let value else { return nil }
        let stripped = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return stripped.isEmpty ? nil : stripped
    }
}
