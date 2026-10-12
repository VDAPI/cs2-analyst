/**
 * Discord gateway client (S26), hand-rolled on Node's global WebSocket. Only
 * what a slash-command bot needs: identify with no intents, heartbeat, resume
 * and reconnect, and hand every INTERACTION_CREATE to a callback.
 *
 * The gateway lets the bot run anywhere (a home PC, the local Docker setup)
 * without a public URL. On a public server Discord can instead POST
 * interactions to /api/discord/interactions; then the gateway receives none.
 */
import type { Interaction } from "./handler";

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

const OP = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

/** Close codes after which reconnecting can't help (bad token, bad intents …). */
export const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

interface GatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

export interface GatewayEvents {
  onReady?(info: { applicationId: string; user: string }): void;
  onInteraction(interaction: Interaction): void;
  onFatal?(code: number): void;
}

/** Reconnect delay: 1 s, 2 s, 4 s … capped at 60 s. */
export function backoffMs(attempt: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempt));
}

export class DiscordGateway {
  private ws: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private firstBeat: ReturnType<typeof setTimeout> | null = null;
  private seq: number | null = null;
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;
  private acked = true;
  private attempt = 0;
  private stopped = false;

  constructor(
    private token: string,
    private events: GatewayEvents
  ) {}

  start(): void {
    this.stopped = false;
    this.connect(false);
  }

  stop(): void {
    this.stopped = true;
    this.clearHeartbeat();
    this.ws?.close(1000);
  }

  private connect(resume: boolean): void {
    const url = resume && this.resumeUrl ? `${this.resumeUrl}/?v=10&encoding=json` : GATEWAY_URL;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener("message", (ev) => {
      try {
        this.onPayload(JSON.parse(String(ev.data)) as GatewayPayload, resume);
      } catch (err) {
        console.error("[discord-gateway] bad payload", err);
      }
    });
    ws.addEventListener("close", (ev) => this.onClose(ev.code));
    ws.addEventListener("error", () => {
      // "close" follows and reconnects.
    });
  }

  private send(payload: GatewayPayload): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
  }

  private onPayload(p: GatewayPayload, resuming: boolean): void {
    if (typeof p.s === "number") this.seq = p.s;
    switch (p.op) {
      case OP.HELLO: {
        const interval = (p.d as { heartbeat_interval: number }).heartbeat_interval;
        this.startHeartbeat(interval);
        if (resuming && this.sessionId) {
          this.send({ op: OP.RESUME, d: { token: this.token, session_id: this.sessionId, seq: this.seq } });
        } else {
          this.send({
            op: OP.IDENTIFY,
            d: { token: this.token, intents: 0, properties: { os: process.platform, browser: "cs2-analyst", device: "cs2-analyst" } },
          });
        }
        break;
      }
      case OP.HEARTBEAT:
        this.send({ op: OP.HEARTBEAT, d: this.seq });
        break;
      case OP.HEARTBEAT_ACK:
        this.acked = true;
        break;
      case OP.RECONNECT:
        this.ws?.close(4900); // non-1000: keeps the session resumable
        break;
      case OP.INVALID_SESSION:
        if (!p.d) {
          this.sessionId = null;
          this.seq = null;
        }
        this.ws?.close(4900);
        break;
      case OP.DISPATCH:
        this.onDispatch(p.t ?? "", p.d);
        break;
    }
  }

  private onDispatch(type: string, d: unknown): void {
    if (type === "READY") {
      const ready = d as { session_id: string; resume_gateway_url: string; application: { id: string }; user: { username: string } };
      this.sessionId = ready.session_id;
      this.resumeUrl = ready.resume_gateway_url;
      this.attempt = 0;
      this.events.onReady?.({ applicationId: ready.application.id, user: ready.user.username });
    } else if (type === "RESUMED") {
      this.attempt = 0;
    } else if (type === "INTERACTION_CREATE") {
      this.events.onInteraction(d as Interaction);
    }
  }

  private startHeartbeat(interval: number): void {
    this.clearHeartbeat();
    this.acked = true;
    const beat = () => {
      if (!this.acked) {
        // Zombie connection: no ACK since the last beat.
        this.ws?.close(4900);
        return;
      }
      this.acked = false;
      this.send({ op: OP.HEARTBEAT, d: this.seq });
    };
    this.firstBeat = setTimeout(beat, Math.floor(interval * Math.random()));
    this.heartbeat = setInterval(beat, interval);
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.firstBeat) clearTimeout(this.firstBeat);
    this.heartbeat = null;
    this.firstBeat = null;
  }

  private onClose(code: number): void {
    this.clearHeartbeat();
    if (this.stopped) return;
    if (FATAL_CLOSE_CODES.has(code)) {
      this.events.onFatal?.(code);
      return;
    }
    const delay = backoffMs(this.attempt++);
    const resume = this.sessionId != null;
    console.warn(`[discord-gateway] closed (${code}), reconnecting in ${delay} ms${resume ? " (resume)" : ""}`);
    setTimeout(() => this.connect(resume), delay);
  }
}
