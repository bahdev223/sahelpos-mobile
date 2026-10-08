export type QrReference = { kind: "qr" | "invitation"; token: string };
const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseQr(text: string, origin: string): QrReference {
  if (OPAQUE.test(text)) return { kind: "qr", token: text };
  const url = new URL(text, origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Ce QR code ne vient pas de SahelPOS.");
  const match = url.pathname.match(/^\/(qr|rejoindre|invitation)\/([^/]+)\/?$/);
  if (!match) throw new Error("Ce QR code n’est pas reconnu.");
  if (match[1] === "qr" && OPAQUE.test(match[2]))
    return { kind: "qr", token: match[2] };
  if (match[1] !== "qr" && UUID.test(match[2]))
    return { kind: "invitation", token: match[2] };
  throw new Error("Le token de ce QR code est invalide.");
}
export function safeNext(path = "/"): string {
  return /^\/(?!\/)[^\\?#]*$/.test(path) ? path : "/";
}
export function authUrl(
  provider: "google" | "accounts",
  context: { invitation?: string; next?: string } = {},
): string {
  const params = new URLSearchParams();
  if (context.invitation) params.set("invitation", context.invitation);
  params.set("next", safeNext(context.next));
  return `/api/auth/${provider === "google" ? "google" : "login"}/?${params}`;
}
export function ticketFromHash(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.has("error"))
    throw new Error(params.get("error") || "Connexion refusée.");
  const ticket = params.get("ticket") || "";
  if (!OPAQUE.test(ticket))
    throw new Error("Ce retour de connexion a expiré. Recommencez.");
  return ticket;
}

export function nativeTicket(result: {
  type: string;
  url?: string;
}): string | null {
  if (result.type === "cancel" || result.type === "dismiss") return null;
  if (result.type !== "success" || !result.url)
    throw new Error("Le navigateur n’a pas terminé la connexion.");
  const uri = new URL(result.url);
  if (
    uri.protocol !== "sahelpos:" ||
    uri.hostname !== "auth-callback" ||
    uri.pathname ||
    uri.search ||
    uri.username ||
    uri.password
  )
    throw new Error("Le retour de connexion ne correspond pas à SahelPOS.");
  return ticketFromHash(uri.hash);
}
export function writeAllowed(
  role: "patron" | "gerant" | "vendeur" | undefined,
  type: string,
): boolean {
  if (!role) return true; // Historical unscoped terminal contract.
  if (type === "utilisateurs") return false;
  if (role === "vendeur") return type === "clients" || type === "ventes";
  return type !== "boutique" || role === "patron";
}
