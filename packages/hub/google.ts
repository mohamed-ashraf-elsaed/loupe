import { OAuth2Client } from "google-auth-library";

export interface GoogleIdentity {
  email: string;
  name?: string;
}

export type Verifier = (idToken: string, clientId: string) => Promise<GoogleIdentity>;

let client: OAuth2Client | null = null;

/**
 * Verify a Google Identity Services ID token server-side: signature against
 * Google's certs, issuer, expiry, `aud` = our client ID, and email_verified.
 */
export const googleVerifier: Verifier = async (idToken, clientId) => {
  client ??= new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const p = ticket.getPayload();
  if (!p?.email) throw new Error("token has no email");
  if (p.email_verified !== true) throw new Error("email not verified");
  return { email: p.email, name: p.name };
};

/** Swappable so tests can sign in without Google. */
export const auth = { verify: googleVerifier as Verifier };
