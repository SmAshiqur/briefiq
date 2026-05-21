// Smoke test for the network-info helper.
//
// We don't lock in specific IPs (those vary by host); we just verify the
// helper returns at least the loopback address and that LAN entries come
// first when present.

import {
  listReachableAddresses,
  reachableUrls,
} from '../src/common/network-info';

describe('network-info', () => {
  it('always reports at least the loopback address', () => {
    const list = listReachableAddresses();
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((a) => a.kind === 'loopback')).toBe(true);
  });

  it('puts LAN addresses before loopback in the sorted list', () => {
    const list = listReachableAddresses();
    const lanIdx = list.findIndex((a) => a.kind === 'lan');
    const loopIdx = list.findIndex((a) => a.kind === 'loopback');
    // Only assert ordering if both exist on this host (CI may not have LAN).
    if (lanIdx !== -1 && loopIdx !== -1) {
      expect(lanIdx).toBeLessThan(loopIdx);
    }
  });

  it('renders URLs with the provided port', () => {
    const urls = reachableUrls(3000);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u).toMatch(/^http:\/\/[\d.]+:3000\s+\((LAN|loopback)/);
    }
  });
});
