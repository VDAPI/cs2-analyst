import { randomBytes } from "crypto";

/** 128 random bits, base64url (22 chars): unguessable, fits a URL. Server only. */
export function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Four hex characters for a suggested profile slug. */
export function slugSuffix(): string {
  return randomBytes(2).toString("hex");
}
