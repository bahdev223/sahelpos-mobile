/**
 * Accueil : ce que le commercant veut savoir en ouvrant l'application.
 *
 * POURQUOI CET ECRAN EXISTE
 * -------------------------
 * La caisse etait le premier ecran, et elle ne repond a aucune des questions
 * qu'on se pose en arrivant le matin : combien j'ai vendu hier, qu'est-ce qui
 * manque au rayon, ou en est ma caisse. On ouvrait donc quatre ecrans pour
 * reconstituer une image que quatre chiffres suffisent a donner.
 *
 * POURQUOI DES CHIFFRES DU JOUR ET NON DU MOIS
 * --------------------------------------------
 * Le commercant decide a la journee : ce qu'il commande ce soir depend de ce
 * qui est parti aujourd'hui. Le mois est dans le tableau de bord, ouvert une
 * fois par semaine.
 */
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useSession } from '../_layout';
import {
  BandeauEtat,
  Chargement,
  Vignette,
  couleurs,
  espaces,
  formaterMontant,
  formaterQuantite,
  rayons,
} from '../../src/ui/components';
import { Icone } from '../../src/ui/icones';
import type { NomIcone } from '../../src/ui/icones';
import { BoutonMenu } from '../../src/ui/tiroir';
import { listerAlertesStock } from '../../src/db/repositories/produit';
import { listerVentes, totauxPeriode } from '../../src/db/repositories/vente';
import type { VenteResume } from '../../src/db/repositories/vente';
import { seuilAlerteStock } from '../../src/domain/stock';
import type { Produit } from '../../src/domain/types';
import { compterNonLues } from '../../src/services/notifications';
import {
  autorise,
  etatCourant as etatAbonnementCourant,
} from '../../src/services/abonnement';

function bornesJour(): { debut: string; fin: string } {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  return { debut: debut.toISOString(), fin: fin.toISOString() };
}

function salutation(): string {
  const heure = new Date().getHours();
  if (heure < 12) return 'Bonjour';
  if (heure < 18) return 'Bon apres-midi';
  return 'Bonsoir';
}

function heureCourte(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function dateAccueil(): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());
}

interface Donnees {
  chiffreAffaires: number;
  nbVentes: number;
  benefice: number;
  resteDu: number;
  alertes: Produit[];
  dernieres: VenteResume[];
  afficherDepenses: boolean;
}

type Etat =
  | { phase: 'chargement' }
  | { phase: 'pret'; donnees: Donnees };

export default function EcranAccueil() {
  const router = useRouter();
  const { utilisateur, boutique, revisionSynchronisation, synchroniserMaintenant } = useSession();
  const [etat, setEtat] = useState<Etat>({ phase: 'chargement' });
  const [rafraichit, setRafraichit] = useState(false);
  const derniereLectureValide = useRef<Donnees | null>(null);
  // La cloche porte « ce que je n'ai pas encore vu », et non « ce qui va mal
  // en ce moment » : les deux different des qu'une alerte a ete lue.
  const [nonLues, setNonLues] = useState(0);

  const charger = useCallback(async () => {
    const jour = bornesJour();
    const [totaux, alertes, dernieres, abonnement] = await Promise.all([
      totauxPeriode(jour.debut, jour.fin, utilisateur?.role === 'vendeur' ? utilisateur.id : undefined),
      listerAlertesStock(),
      listerVentes({ limite: 5, utilisateurId: utilisateur?.role === 'vendeur' ? utilisateur.id : undefined }),
      etatAbonnementCourant(),
    ]);
    const donnees: Donnees = {
      chiffreAffaires: totaux.chiffreAffaires,
      nbVentes: totaux.nbVentes,
      benefice: totaux.benefice,
      resteDu: totaux.resteDu,
      alertes,
      dernieres,
      afficherDepenses: autorise(abonnement, 'tresorerie'),
    };
    derniereLectureValide.current = donnees;
    setEtat({
      phase: 'pret',
      donnees,
    });
  }, [utilisateur]);

  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      void (async () => {
        try {
          await charger();
          // Le compteur est relu a chaque retour sur l'accueil : le
          // commercant vient peut-etre de lire ses notifications.
          if (vivant) setNonLues(await compterNonLues());
        } catch (erreur) {
          // Une lecture locale ratee ne veut PAS dire que la caisse est vide.
          // On garde le dernier tableau coherent plutot que de remplacer les
          // montants reels par des zeros, ce qui est plus dangereux qu'un
          // avertissement visible.
          if (vivant) {
            if (derniereLectureValide.current) {
              setEtat({ phase: 'pret', donnees: derniereLectureValide.current });
            }
          }
        }
      })();
      return () => {
        vivant = false;
      };
    }, [charger, revisionSynchronisation]),
  );

  const surRafraichir = useCallback(async () => {
    setRafraichit(true);
    try {
      await synchroniserMaintenant();
      await charger();
    } catch {
      // Silencieux : le tirage vers le bas est un geste d'impatience, pas une
      // operation dont il faut rendre compte.
    } finally {
      setRafraichit(false);
    }
  }, [charger, synchroniserMaintenant]);

  if (etat.phase === 'chargement') {
    return (
      <View style={s.plein}>
        <BandeauEtat />
        <Chargement message="Lecture de la journee..." />
      </View>
    );
  }

  const d = etat.donnees;

  return (
    <View style={s.plein}>
      <StatusBar style="light" />
      <BandeauEtat fond={couleurs.primaire} />
      <View style={s.entete}>
        <BoutonMenu couleur={couleurs.texteInverse} />
        <View style={s.marque}>
          <Text style={s.marqueNom}>Sahel<Text style={s.marqueAccent}>POS</Text></Text>
          <Text style={s.marqueBoutique}>Ma boutique</Text>
        </View>
        <Pressable
          onPress={() => router.push('/notifications')}
          hitSlop={10}
          style={s.cloche}
          accessibilityLabel="Notifications"
        >
          <Icone nom="cloche" taille={22} couleur={couleurs.texteInverse} />
          {nonLues > 0 ? (
            <View style={s.pointCloche}>
              <Text style={s.pointClocheTexte}>{nonLues > 9 ? '9+' : nonLues}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={s.contenu}
        refreshControl={
          <RefreshControl refreshing={rafraichit} onRefresh={surRafraichir} tintColor={couleurs.primaire} />
        }
      >
        <View style={s.carteBienvenue}>
          <View>
            <Text style={s.salut}>
              {salutation()} {utilisateur?.nom ?? ''} !
            </Text>
            <Text style={s.sousSalut}>{dateAccueil()}</Text>
          </View>
          <Pressable style={s.selectJour}>
            <Icone nom="inventaire" taille={16} couleur={couleurs.primaire} />
            <Text style={s.selectJourTexte}>Aujourd'hui</Text>
            <Icone nom="chevron" taille={14} couleur={couleurs.texteFaible} />
          </Pressable>
        </View>

        <View style={s.caCarte}>
          <View>
            <Text style={s.caLibelle}>Chiffre d'affaires</Text>
            <Text style={s.caValeur}>{formaterMontant(d.chiffreAffaires, boutique.devise)}</Text>
            <Text style={s.caDetail}>{d.nbVentes} vente{d.nbVentes > 1 ? 's' : ''} aujourd'hui</Text>
          </View>
          <View style={s.caIcone}>
            <Icone nom="graphique" taille={26} couleur={couleurs.primaire} />
          </View>
        </View>

        <View style={s.tuiles}>
          <TuileCompacte
            icone="graphique"
            libelle="Bénéfice"
            valeur={formaterMontant(d.benefice, boutique.devise)}
            detail={
              d.chiffreAffaires > 0
                ? `Marge ${((d.benefice / d.chiffreAffaires) * 100).toFixed(1)} %`
                : 'Marge 0 %'
            }
            teinte={couleurs.succesFonce}
            fond={couleurs.succesDouce}
            onPress={() => router.push('/tableau-de-bord')}
          />
          <TuileCompacte
            icone="argent"
            libelle="Dépenses"
            valeur={formaterMontant(0, boutique.devise)}
            detail="Aujourd'hui"
            teinte={couleurs.danger}
            fond={couleurs.dangerDouce}
          />
        </View>

        <View style={s.tuiles}>
          <Pressable style={s.raccourciSimple} onPress={() => router.push('/stock/alertes')}>
            <View style={[s.raccourciIcone, { backgroundColor: couleurs.primaireDouce }]}>
              <Icone nom="stock" taille={23} couleur={couleurs.primaire} />
            </View>
            <View style={s.raccourciTextes}>
              <Text style={s.raccourciTitre} numberOfLines={2}>
                Stock à surveiller
              </Text>
              <Text style={s.raccourciValeur} numberOfLines={1} adjustsFontSizeToFit>
                {d.alertes.length} produits
              </Text>
            </View>
            <Icone nom="chevron" taille={18} couleur={couleurs.texteFaible} />
          </Pressable>
          <TuileCompacte
            icone="clients"
            libelle="Créances clients"
            valeur={formaterMontant(d.resteDu, boutique.devise)}
            detail={d.resteDu > 0 ? 'A suivre' : 'Aucune en cours'}
            teinte={couleurs.primaire}
            fond={couleurs.primaireDouce}
            onPress={() => router.push('/clients')}
          />
        </View>

        {d.resteDu > 0 ? (
          <Pressable style={s.credit} onPress={() => router.push('/clients')}>
            <Icone nom="clients" taille={20} couleur={couleurs.avertissementFonce} />
            <Text style={s.creditTexte}>
              {formaterMontant(d.resteDu, boutique.devise)} en attente chez les clients
            </Text>
            <Icone nom="chevron" taille={16} couleur={couleurs.avertissementFonce} />
          </Pressable>
        ) : null}

        <View style={s.sectionEntete}>
          <Text style={s.sectionTitre}>Ventes récentes</Text>
          <Pressable onPress={() => router.push('/ventes')} hitSlop={8}>
            <Text style={s.lienVoirTout}>Voir tout</Text>
          </Pressable>
        </View>

        {d.dernieres.length === 0 ? (
          <View style={s.vide}>
            <Icone nom="ventes" taille={28} couleur={couleurs.texteEteint} />
            <Text style={s.videTexte}>Aucune vente pour le moment.</Text>
          </View>
        ) : (
          <View style={s.bloc}>
            {d.dernieres.map((vente, index) => (
              <Pressable
                key={vente.id}
                onPress={() =>
                  router.push({ pathname: '/vente/[id]', params: { id: String(vente.id) } })
                }
                style={({ pressed }) => [
                  s.ligne,
                  index > 0 && s.ligneSuivante,
                  pressed && s.lignePressee,
                ]}
              >
                <Icone nom="ventes" taille={20} couleur={couleurs.texteFaible} />
                <View style={s.ligneTextes}>
                  <Text style={s.ligneTitre}>Vente {vente.numero}</Text>
                  <Text style={s.ligneSous}>
                    {heureCourte(vente.dateVente)}
                    {vente.clientNom ? ` — ${vente.clientNom}` : ''}
                  </Text>
                </View>
                <View style={s.ligneDroite}>
                  <Text style={s.ligneMontant}>
                    {formaterMontant(vente.total, boutique.devise)}
                  </Text>
                  <Text
                    style={[
                      s.ligneStatut,
                      {
                        color:
                          vente.statut === 'payee'
                            ? couleurs.succesFonce
                            : couleurs.avertissementFonce,
                      },
                    ]}
                  >
                    {vente.statut === 'payee' ? 'Payee' : 'A solder'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={s.sectionEntete}>
          <Text style={s.sectionTitre}>Produits en alerte</Text>
          <Pressable onPress={() => router.push('/stock/alertes')} hitSlop={8}>
            <Text style={s.lienVoirTout}>Voir tout</Text>
          </Pressable>
        </View>
        {d.alertes.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.alertesVisuelles}>
            {d.alertes.slice(0, 8).map((produit) => (
              <Pressable
                key={produit.id}
                onPress={() =>
                  router.push({ pathname: '/produit/[id]', params: { id: String(produit.id) } })
                }
                style={({ pressed }) => [s.alerteCarte, pressed && s.lignePressee]}
              >
                <Vignette chemin={produit.cheminImage} nom={produit.nom} taille={76} />
                <View style={s.alerteBadge}>
                  <Text style={s.alerteBadgeTexte}>
                    {formaterQuantite(produit.quantiteBase)}
                  </Text>
                </View>
                <Text style={s.alerteNom} numberOfLines={2}>
                  {produit.nom}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Pressable style={s.alerteVide} onPress={() => router.push('/stock/alertes')}>
            <Icone nom="stock" taille={20} couleur={couleurs.texteEteint} />
            <Text style={s.alerteVideTexte}>Aucun produit en alerte</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function Tuile({
  icone,
  libelle,
  valeur,
  teinte,
  fond,
  onPress,
}: {
  icone: NomIcone;
  libelle: string;
  valeur: string;
  teinte: string;
  fond: string;
  onPress?: () => void;
}) {
  const contenu = (
    <>
      <View style={[s.tuileIcone, { backgroundColor: fond }]}>
        <Icone nom={icone} taille={18} couleur={teinte} />
      </View>
      <Text style={s.tuileLibelle}>{libelle}</Text>
      <Text style={[s.tuileValeur, { color: teinte }]} numberOfLines={1} adjustsFontSizeToFit>
        {valeur}
      </Text>
    </>
  );
  if (!onPress) return <View style={s.tuile}>{contenu}</View>;
  return (
    <Pressable style={({ pressed }) => [s.tuile, pressed && s.tuilePressee]} onPress={onPress}>
      {contenu}
    </Pressable>
  );
}

function TuileCompacte({
  icone,
  libelle,
  valeur,
  detail,
  teinte,
  fond,
  onPress,
}: {
  icone: NomIcone;
  libelle: string;
  valeur: string;
  detail: string;
  teinte: string;
  fond: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [s.tuileCompacte, pressed && s.tuilePressee]} onPress={onPress}>
      <View style={s.tuileCompacteHaut}>
        <Text style={s.tuileCompacteLibelle}>{libelle}</Text>
        <View style={[s.tuileMiniIcone, { backgroundColor: fond }]}>
          <Icone nom={icone} taille={18} couleur={teinte} />
        </View>
      </View>
      <Text style={[s.tuileCompacteValeur, { color: teinte }]} numberOfLines={1} adjustsFontSizeToFit>
        {valeur}
      </Text>
      <Text style={s.tuileCompacteDetail}>{detail}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  plein: { flex: 1, backgroundColor: couleurs.fond },

  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 10,
    backgroundColor: couleurs.primaire,
  },
  marque: { flex: 1, minWidth: 0 },
  marqueNom: { color: couleurs.texteInverse, fontSize: 20, fontWeight: '900' },
  marqueAccent: { color: couleurs.accent },
  marqueBoutique: { color: 'rgba(255,255,255,0.82)', fontSize: 11, marginTop: 0 },
  enteteTitre: { flex: 1, fontSize: 18, fontWeight: '700', color: couleurs.texteInverse },
  cloche: { padding: 7 },
  pointCloche: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.danger,
  },
  pointClocheTexte: { fontSize: 10, fontWeight: '700', color: couleurs.texteInverse },

  contenu: { padding: 16, paddingTop: 12, paddingBottom: espaces.xxl },
  carteBienvenue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.s,
    marginTop: 0,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: couleurs.surface,
  },
  salut: { fontSize: 17, lineHeight: 22, fontWeight: '900', color: couleurs.texte },
  sousSalut: {
    fontSize: 12,
    lineHeight: 17,
    color: couleurs.texteFaible,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  selectJour: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  selectJourTexte: { color: couleurs.texte, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  caCarte: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: espaces.m,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  caLibelle: { color: couleurs.texte, fontSize: 13, fontWeight: '700' },
  caValeur: { color: couleurs.primaire, fontSize: 24, fontWeight: '900', marginTop: 7 },
  caDetail: { color: couleurs.texteFaible, fontSize: 13, marginTop: 4 },
  caIcone: {
    width: 50,
    height: 50,
    borderRadius: 13,
    backgroundColor: couleurs.primaireDouce,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tuiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  tuileCompacte: {
    width: '48%',
    flexGrow: 1,
    minHeight: 92,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  tuileCompacteHaut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.s,
  },
  tuileMiniIcone: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tuileCompacteLibelle: { flex: 1, color: couleurs.texte, fontSize: 12, fontWeight: '700' },
  tuileCompacteValeur: { marginTop: 7, fontSize: 18, fontWeight: '900' },
  tuileCompacteDetail: { marginTop: 3, color: couleurs.texteFaible, fontSize: 11 },
  tuile: {
    // Deux par ligne : au-dela le montant se tronque sur un ecran de 720 points.
    width: '47.5%',
    flexGrow: 1,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espaces.m,
  },
  tuilePressee: { backgroundColor: couleurs.fond },
  tuileIcone: {
    width: 32,
    height: 32,
    borderRadius: rayons.s,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaces.s,
  },
  tuileLibelle: { fontSize: 12, color: couleurs.texteFaible },
  tuileValeur: { fontSize: 20, fontWeight: '700', marginTop: 2 },

  credit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    marginTop: espaces.m,
    padding: espaces.m,
    borderRadius: rayons.m,
    backgroundColor: couleurs.avertissementDouce,
    borderWidth: 1,
    borderColor: couleurs.avertissementBordure,
  },
  creditTexte: { flex: 1, fontSize: 13, color: couleurs.avertissementFonce, fontWeight: '600' },

  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.s,
    minHeight: 54,
    borderRadius: rayons.m,
    backgroundColor: couleurs.primaire,
    marginTop: espaces.l,
  },
  boutonPresse: { backgroundColor: couleurs.primaireFonce },
  boutonTexte: { fontSize: 16, fontWeight: '700', color: couleurs.texteInverse },

  repertoire: {
    flexDirection: 'row',
    gap: espaces.m,
    marginTop: espaces.m,
  },
  raccourciSimple: {
    width: '48%',
    flexGrow: 1,
    minWidth: 0,
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
  },
  raccourciIcone: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  raccourciTextes: { flex: 1, minWidth: 0 },
  raccourciValeur: { color: couleurs.texte, fontSize: 13, fontWeight: '900', marginTop: 2 },
  raccourci: {
    flex: 1,
    gap: 2,
    // Meme hauteur de cible que les tuiles du haut : on appuie debout, souvent
    // d'une seule main, parfois sans regarder.
    minHeight: 88,
    justifyContent: 'center',
    padding: espaces.m,
    borderRadius: rayons.m,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  raccourciPresse: { backgroundColor: couleurs.primaireDouce },
  raccourciTitre: { fontSize: 12, lineHeight: 15, fontWeight: '700', color: couleurs.texte },
  raccourciDetail: { fontSize: 12, color: couleurs.texteFaible },

  sectionEntete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: espaces.xl,
    marginBottom: espaces.s,
  },
  sectionTitre: { fontSize: 15, fontWeight: '700', color: couleurs.texte },
  lienVoirTout: { fontSize: 13, fontWeight: '600', color: couleurs.primaire },

  bloc: {
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    overflow: 'hidden',
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    minHeight: 62,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
  },
  ligneSuivante: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.bordure },
  lignePressee: { backgroundColor: couleurs.fond },
  ligneTextes: { flex: 1 },
  ligneTitre: { fontSize: 15, fontWeight: '600', color: couleurs.texte },
  ligneSous: { fontSize: 12, color: couleurs.texteFaible, marginTop: 1 },
  ligneDroite: { alignItems: 'flex-end' },
  ligneMontant: { fontSize: 15, fontWeight: '700', color: couleurs.texte },
  ligneStatut: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  ligneRupture: { fontSize: 14, fontWeight: '700', color: couleurs.danger },
  alertesVisuelles: { gap: espaces.s, paddingRight: espaces.l },
  alerteCarte: {
    width: 104,
    minHeight: 142,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface,
    padding: espaces.s,
  },
  alerteBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.danger,
  },
  alerteBadgeTexte: { color: couleurs.texteInverse, fontSize: 11, fontWeight: '900' },
  alerteNom: { marginTop: 7, color: couleurs.texte, fontSize: 12, fontWeight: '800', lineHeight: 15 },
  alerteVide: {
    minHeight: 74,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.s,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderStyle: 'dashed',
    backgroundColor: couleurs.surface,
  },
  alerteVideTexte: { color: couleurs.texteFaible, fontSize: 13, fontWeight: '600' },

  vide: {
    alignItems: 'center',
    gap: espaces.s,
    padding: espaces.xl,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  videTexte: { fontSize: 13, color: couleurs.texteFaible },
});
