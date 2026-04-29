// TokenStore.swift
// Persists the session JWT in the iOS Keychain. Using Keychain (not
// UserDefaults) so the token is encrypted at rest and follows iCloud
// Keychain rules if the user has them enabled.
//
// Public API is intentionally tiny: get / set / clear. Anything more
// elaborate (refresh, expiry parsing) lives in higher layers.

import Foundation
import Security

actor TokenStore {
    static let shared = TokenStore()

    // Keychain query template. Service identifies our token; account is
    // the user's session slot (we keep one at a time for now).
    private let service = "com.briefiq.app.session"
    private let account = "current"

    /// Read the current token. Returns nil if not signed in.
    func token() -> String? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = withUnsafeMutablePointer(to: &result) {
            SecItemCopyMatching(query as CFDictionary, $0)
        }
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Save a token. Replaces any existing one for our account.
    func setToken(_ value: String) {
        let data = Data(value.utf8)
        // Delete existing first to avoid duplicate-item errors.
        clear()

        let attrs: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            // Available after first unlock — covers background refresh.
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        SecItemAdd(attrs as CFDictionary, nil)
    }

    /// Remove the token. Called on sign-out or 401 responses.
    func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
