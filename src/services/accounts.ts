import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { nativeTicket, parseQr } from "../domain/accounts";
import { empreinteAppareil, installerDroitAccounts } from "./abonnement";
import { bootstrapInitial, actualiserProfilAccounts } from "./synchronisation";
import { obtenirUtilisateurParIdLocal, listerComptesConnexion } from "./auth";
import type { Utilisateur } from "../domain/types";
export const ACCOUNTS_SERVEUR = "https://sahelpos.saheltech.tech";
export interface AccountsProfile {
  id: number;
  nom: string;
  email: string;
  external_subject: string;
  boutiques: {
    id: number;
    nom: string;
    role: "patron" | "gerant" | "vendeur";
  }[];
}
export interface AccountsSession {
  jeton: string;
  utilisateur: AccountsProfile;
}
export interface QrInfo {
  type: "INVITATION" | "LOGIN";
  boutique?: string;
  role?: string;
  confirmation_code?: string;
}
export async function accountsRequest<T>(
  path: string,
  session: AccountsSession | null,
  data?: unknown,
): Promise<T> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(ACCOUNTS_SERVEUR + "/api" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: "Token " + session.jeton } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.detail || result.erreur || "Connexion SahelTech impossible.",
      );
    return result;
  } finally {
    clearTimeout(timer);
  }
}
export async function ouvrirAccounts(
  provider: "google" | "accounts",
  invitation?: string,
): Promise<AccountsSession | null> {
  const bytes = Crypto.getRandomBytes(32),
    verifier = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
  const hex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
  );
  // S256 URL-safe base64, without Buffer or browser-only APIs on Hermes.
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let challenge = "",
    buffer = 0,
    bits = 0;
  for (let i = 0; i < hex.length; i += 2) {
    buffer = (buffer << 8) | parseInt(hex.slice(i, i + 2), 16);
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      challenge += alphabet[(buffer >> bits) & 63];
    }
  }
  if (bits) challenge += alphabet[(buffer << (6 - bits)) & 63];
  const params = new URLSearchParams({ channel: "native", challenge });
  if (invitation) params.set("invitation", invitation);
  const result = await WebBrowser.openAuthSessionAsync(
    `${ACCOUNTS_SERVEUR}/api/auth/${provider === "google" ? "google" : "login"}/?${params}`,
    "sahelpos://auth-callback",
  );
  const ticket = nativeTicket(result);
  if (!ticket) return null;
  const session = await accountsRequest<AccountsSession>(
    "/auth/exchange/",
    null,
    { ticket, verifier },
  );
  if (
    !/^spst_[A-Za-z0-9_-]{43}$/.test(session.jeton) ||
    !session.utilisateur?.external_subject ||
    !Array.isArray(session.utilisateur.boutiques)
  )
    throw new Error("Le serveur n’a pas renvoyé de session SahelPOS valide.");
  return session;
}
export async function resoudreQr(
  text: string,
): Promise<{ reference: ReturnType<typeof parseQr>; info: QrInfo }> {
  const reference = parseQr(text, ACCOUNTS_SERVEUR);
  return {
    reference,
    info: await accountsRequest<QrInfo>(
      reference.kind === "qr"
        ? `/public/qr/${reference.token}/resolve/`
        : `/public/invitations/${reference.token}/`,
      null,
    ),
  };
}
export async function preparerProfil(
  session: AccountsSession,
  boutiqueId: number,
): Promise<{ user: Utilisateur; needsPin: boolean }> {
  const response = await accountsRequest<{
    licence: string;
    jeton_appareil: string;
    membre: Parameters<typeof actualiserProfilAccounts>[0];
    boutique_id: number;
  }>("/auth/native/provision/", session, {
    boutique_id: boutiqueId,
    empreinte: await empreinteAppareil(),
    libelle: "Téléphone SahelTech",
  });
  const droit = await installerDroitAccounts(
    response.licence,
    response.jeton_appareil,
    response.membre.id_local,
    boutiqueId,
  );
  // Apply this exact server member before syncing, without generating a new UUID.
  await actualiserProfilAccounts(response.membre);
  await bootstrapInitial(droit.boutique);
  const user = await obtenirUtilisateurParIdLocal(response.membre.id_local);
  if (!user) throw new Error("Le profil n’a pas été synchronisé. Réessayez.");
  const profiles = await listerComptesConnexion();
  return {
    user,
    needsPin: !profiles.find((p) => p.idLocal === user.idLocal)?.aCodeLocal,
  };
}
