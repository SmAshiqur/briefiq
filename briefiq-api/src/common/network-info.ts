// Enumerates the host's IPv4 network interfaces.
//
// Why this exists: when the backend listens on 0.0.0.0 a fresh dev sees
// "listening on http://0.0.0.0:3000" in the boot log and has no idea what
// URL to plug into the iOS app's Diagnostics override. This helper prints
// every reachable URL (loopback + LAN) so the choice is obvious.
//
// Pure Node — no external deps. Safe to call at any time.

import { networkInterfaces } from 'os';

export interface ReachableAddress {
  /** "lan" for routable LAN addresses, "loopback" for 127.0.0.1, etc. */
  kind: 'loopback' | 'lan';
  /** Interface name as reported by the OS (e.g. "Wi-Fi", "eth0"). */
  iface: string;
  /** Raw IPv4 string. */
  address: string;
}

/**
 * Returns every IPv4 address the host is reachable on, sorted with LAN
 * addresses first (because that's what a phone or another machine needs).
 *
 * IPv6 is intentionally skipped — adding `http://[::1]:3000` to the boot
 * log just adds noise during prototype iteration. Revisit when we deploy.
 */
export function listReachableAddresses(): ReachableAddress[] {
  const result: ReachableAddress[] = [];
  const ifaces = networkInterfaces();

  for (const [name, addresses] of Object.entries(ifaces)) {
    if (!addresses) continue;
    for (const addr of addresses) {
      if (addr.family !== 'IPv4') continue;
      result.push({
        kind: addr.internal ? 'loopback' : 'lan',
        iface: name,
        address: addr.address,
      });
    }
  }

  // LAN first — that's the address a Mac/simulator/phone actually needs.
  return result.sort((a, b) => {
    if (a.kind === b.kind) return a.address.localeCompare(b.address);
    return a.kind === 'lan' ? -1 : 1;
  });
}

/**
 * Formats every reachable URL on a given port for human-friendly boot logs.
 * Returns the array of strings; caller decides how to render.
 */
export function reachableUrls(port: number): string[] {
  return listReachableAddresses().map((a) => {
    const label = a.kind === 'lan' ? 'LAN' : 'loopback';
    return `http://${a.address}:${port}  (${label}, ${a.iface})`;
  });
}
