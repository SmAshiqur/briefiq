// APNs push sender — wraps @parse/node-apn (HTTP/2 to Apple's gateway).
//
// Stubbed during prototype: when APNS keys aren't set, we log the would-be
// payload and return a fake "queued" status. That keeps the rest of the
// delivery pipeline runnable end-to-end without Apple Developer setup.
//
// To go live, set APNS_* env vars and the `enabled` getter flips to true.

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { getEnv } from '../config/env';

export interface PushPayload {
  deviceToken: string;
  title: string;
  body: string;
  importance: 'important' | 'new' | 'minor';
  // Deep-link target inside the iOS app, e.g. /briefings/<uuid>
  link?: string;
}

export interface PushResult {
  delivered: boolean;
  reason?: string;
}

// Minimal shape of the bits of node-apn we use. Avoids pulling in the
// library's types at compile time (it's loaded via dynamic import) while
// still giving us type safety at every call site.
interface ApnsProvider {
  send: (
    notification: unknown,
    token: string,
  ) => Promise<{
    sent: Array<unknown>;
    failed: Array<{
      device: string;
      reason?: string;
      error?: { message: string };
    }>;
  }>;
  shutdown: () => void;
}

@Injectable()
export class ApnsService implements OnModuleDestroy {
  private readonly logger = new Logger(ApnsService.name);

  // Lazily-built provider. Held so we can shut it down on app exit.
  private providerPromise: Promise<ApnsProvider> | null = null;

  /** True when all required APNs env vars are present. */
  get enabled(): boolean {
    const env = getEnv();
    return Boolean(
      env.APNS_KEY_ID &&
        env.APNS_TEAM_ID &&
        env.APNS_PRIVATE_KEY &&
        env.APNS_BUNDLE_ID,
    );
  }

  async send(payload: PushPayload): Promise<PushResult> {
    if (!this.enabled) {
      // Dev-mode stub: log + pretend it worked. The notifications table
      // still gets a row downstream so we exercise the full DB path.
      this.logger.log(
        `[APNs stub] would push to ${payload.deviceToken.slice(0, 8)}…: ` +
          `${payload.title} — ${payload.body}`,
      );
      return { delivered: true, reason: 'stub_mode' };
    }

    try {
      const provider = await this.getProvider();
      const env = getEnv();
      // Importance maps to APNs interruption-level. Time-sensitive pierces
      // through Focus mode; passive is silent.
      const interruption =
        payload.importance === 'important' ? 'time-sensitive' : 'active';

      const apn = await import('@parse/node-apn');
      // Build a notification. node-apn's Notification accepts arbitrary
      // payload keys via .payload — we cast through `unknown` to satisfy
      // TS without disabling the file-wide check.
      const note: Record<string, unknown> = new (apn as unknown as {
        Notification: new () => Record<string, unknown>;
      }).Notification();
      note.topic = env.APNS_BUNDLE_ID;
      note.alert = { title: payload.title, body: payload.body };
      note.sound = 'default';
      note.pushType = 'alert';
      note.priority = payload.importance === 'important' ? 10 : 5;
      // Custom claim — iOS app uses this to deep-link.
      note.payload = { interruption_level: interruption, link: payload.link };

      const res = await provider.send(note, payload.deviceToken);
      if (res.failed.length > 0) {
        const reason =
          res.failed[0].reason ?? res.failed[0].error?.message ?? 'unknown';
        return { delivered: false, reason };
      }
      return { delivered: true };
    } catch (err) {
      this.logger.error(`APNs send failed: ${(err as Error).message}`);
      return { delivered: false, reason: (err as Error).message };
    }
  }

  async onModuleDestroy() {
    if (this.providerPromise) {
      const provider = await this.providerPromise;
      provider.shutdown();
    }
  }

  private getProvider(): Promise<ApnsProvider> {
    if (this.providerPromise) return this.providerPromise;
    this.providerPromise = (async (): Promise<ApnsProvider> => {
      const env = getEnv();
      const apn = await import('@parse/node-apn');
      // Cast through unknown — the @parse/node-apn types vary across
      // versions; ApnsProvider above pins the exact subset we use.
      const ProviderCtor = (
        apn as unknown as {
          Provider: new (opts: unknown) => ApnsProvider;
        }
      ).Provider;
      return new ProviderCtor({
        token: {
          key: env.APNS_PRIVATE_KEY!,
          keyId: env.APNS_KEY_ID!,
          teamId: env.APNS_TEAM_ID!,
        },
        production: env.APNS_PRODUCTION,
      });
    })();
    return this.providerPromise;
  }
}
