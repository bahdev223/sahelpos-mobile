"""Temporary reviewed source transformation, feature branch only; no application execution."""
from pathlib import Path
import re

root = Path('.')
def read(p):
    return (root / p).read_text()
def rep(c, a, b, n=1):
    if c.count(a) != n:
        raise RuntimeError(f'Expected {n} exact source matches, found {c.count(a)}: {a[:120]}')
    return c.replace(a, b)
def save(p, c):
    (root / p).write_text(c)
def edit(p, a, b):
    save(p, rep(read(p), a, b))

p = 'app/produit/nouveau.tsx'; c = read(p)
c = rep(c, "import { useSession } from '../_layout';", "import { useSession } from '../_layout';\nimport { estReferenceTechnique, tarifGrosDisponible } from '../../src/domain/presentation-commerce';")
c = rep(c, "  const quincaillerie = profilCommerce?.secteur === 'QUINCAILLERIE';", "  const referenceTechnique = estReferenceTechnique(profilCommerce);\n  const tarifsGros = tarifGrosDisponible(profilCommerce);")
c = c.replace('quincaillerie', 'referenceTechnique')
c = rep(c, '      referenceTechnique={referenceTechnique}', '      referenceTechnique={referenceTechnique}\n      tarifsGros={tarifsGros}')
c = rep(c, '  referenceTechnique: boolean;', '  referenceTechnique: boolean;\n  tarifsGros: boolean;')
c = rep(c, '{referenceTechnique ? (\n            <Champ\n              libelle="Prix gros"', '{tarifsGros ? (\n            <Champ\n              libelle="Prix gros"')
c = rep(c, '{referenceTechnique ? (\n                  <View style={[s.zoneSaisie, s.sousUniteNombre]}>', '{tarifsGros ? (\n                  <View style={[s.zoneSaisie, s.sousUniteNombre]}>')
c = rep(c, '{props.referenceTechnique ? (\n            <ChampMobile\n              libelle="Prix gros"', '{props.tarifsGros ? (\n            <ChampMobile\n              libelle="Prix gros"')
c = rep(c, '{props.referenceTechnique ? (\n                <TextInput\n                  style={[m.saisieMobile, m.sousUnitePrix]}', '{props.tarifsGros ? (\n                <TextInput\n                  style={[m.saisieMobile, m.sousUnitePrix]}')
save(p, c)

p = 'app/(tabs)/catalogue.tsx'; c = read(p)
c = rep(c, "import { useSession } from '../_layout';", "import { useSession } from '../_layout';\nimport { estReferenceTechnique, routeReferenceTechnique } from '../../src/domain/presentation-commerce';")
c = rep(c, "  const quincaillerie = profilCommerce?.secteur === 'QUINCAILLERIE';", '  const referenceTechnique = estReferenceTechnique(profilCommerce);')
c = rep(c, 'placeholder={quincaillerie ?', 'placeholder={referenceTechnique ?')
c = rep(c, "router.push(quincaillerie\n                  ? { pathname: '/quincaillerie/reference/[id]', params: { id: String(item.id) } }\n                  : { pathname: '/produit/[id]', params: { id: String(item.id) } })", 'router.push(routeReferenceTechnique(profilCommerce, item.id))')
save(p, c)

p = 'app/(tabs)/caisse.tsx'; c = read(p)
anchor = "import { prixConditionnement, prixGrosConditionnement } from '../../src/domain/quincaillerie';"
c = rep(c, anchor, anchor + "\nimport { estReferenceTechnique, tarifGrosDisponible } from '../../src/domain/presentation-commerce';\nimport { cleArticleCommerce, prixDetailVariante } from '../../src/domain/prix-commerce';")
c = rep(c, "  const quincaillerie = profilCommerce?.secteur === 'QUINCAILLERIE';\n  const grosAutorise = quincaillerie\n    && !!profilCommerce?.capabilities_effectives.includes('WHOLESALE')\n    && ['GROS', 'MIXTE'].includes(profilCommerce?.mode_vente ?? 'DETAIL');", '  const referenceTechnique = estReferenceTechnique(profilCommerce);\n  const grosAutorise = tarifGrosDisponible(profilCommerce);')
c = re.sub(r'\bquincaillerie\b(?![\x27\x22])', 'referenceTechnique', c)
c = rep(c, '          referenceTechnique={referenceTechnique}', '          referenceTechnique={referenceTechnique}\n          habillement={habillement}')
c = rep(c, '  referenceTechnique,\n  grosAutorise,', '  referenceTechnique,\n  habillement,\n  grosAutorise,')
c = rep(c, '  referenceTechnique: boolean;\n  grosAutorise: boolean;', '  referenceTechnique: boolean;\n  habillement: boolean;\n  grosAutorise: boolean;')
c = rep(c, '  const prixDetail = variante?.prixOverride ?? unite?.prix ?? 0;', '  const prixDetail = prixDetailVariante(unite.prix, unite.facteur, variante?.prixOverride);')
c = rep(c, '                          const detail = option.prixOverride ?? u?.prix ?? produit.prixUnitaire;', '                          const detail = prixDetailVariante(u.prix, u.facteur, option.prixOverride);')
c = rep(c, '''                          const detail = variante?.prixOverride ??
                            (option.prix > 0 ? option.prix : produit.prixUnitaire * option.facteur);''', '''                          const detail = prixDetailVariante(option.prix, option.facteur, variante?.prixOverride);''')
c = rep(c, '''        const index = actuel.findIndex(
          (article) =>
            article.produit.id === produit.id &&
            article.unite === unite.nom &&
            (article.variante?.id ?? null) === (variante?.id ?? null),
        );''', '''        // Une même référence à deux tarifs reste deux lignes distinctes.
        const cle = cleArticleCommerce({
          produit, variante, unite: unite.nom, facteur: unite.facteur, prixUnitaire: unite.prix,
        });
        const index = actuel.findIndex((article) => cleArticleCommerce(article) === cle);''')
c = rep(c, 'i !== index && ligne.produit.id === article.produit.id', '''i !== index && ligne.produit.id === article.produit.id
              && (ligne.variante?.id ?? null) === (article.variante?.id ?? null)''')
c = rep(c, '        if (autresLignes + nouvelle * article.facteur > article.produit.quantiteBase) {', '''        const stockDisponible = article.variante?.stockActuel ?? article.produit.quantiteBase;
        if (autresLignes + nouvelle * article.facteur > stockDisponible) {''')
c = rep(c, '''                          choix.variantes.length > 0 && {
                            borderColor: H.bordure,
                            backgroundColor: H.surface,
                          },''', '''                          habillement && {
                            borderColor: H.bordure,
                            backgroundColor: H.surface,
                          },''')
c = rep(c, '                            { backgroundColor: H.primaire, borderColor: H.primaire },', '                            habillement && { backgroundColor: H.primaire, borderColor: H.primaire },')
save(p, c)

p = 'app/achats/nouveau.tsx'; c = read(p)
c = rep(c, "import { useSession } from '../_layout';", "import { useSession } from '../_layout';\nimport { estReferenceTechnique } from '../../src/domain/presentation-commerce';")
c = rep(c, "  const quincaillerie = profilCommerce?.secteur === 'QUINCAILLERIE';", '  const referenceTechnique = estReferenceTechnique(profilCommerce);')
c = c.replace('habillement || quincaillerie', 'habillement || referenceTechnique')
save(p, c)

p = 'app/achats/[id].tsx'; c = read(p)
c = rep(c, "  const habillement = profilCommerce?.secteur === 'HABILLEMENT';", "  const habillement = profilCommerce?.secteur === 'HABILLEMENT';\n  const receptionPartielle = ['HABILLEMENT', 'QUINCAILLERIE', 'ELECTRICITE', 'COMMERCE_GENERAL']\n    .includes(profilCommerce?.secteur ?? '');")
c = rep(c, 'l.quantiteRecue > 0 || habillement', 'l.quantiteRecue > 0 || receptionPartielle')
c = rep(c, '{habillement ? (\n                <Bouton\n                  titre="Réceptionner par taille / couleur"', '{receptionPartielle ? (\n                <Bouton\n                  titre={habillement ? "Réceptionner par taille / couleur" : "Réception partielle par référence"}')
c = rep(c, 'titre={habillement ? "Tout recevoir maintenant"', 'titre={receptionPartielle ? "Tout recevoir maintenant"')
save(p, c)

p = 'app/quincaillerie/reference/[id].tsx'; c = read(p)
c = rep(c, "import { useSession } from '../../_layout';", "import { useSession } from '../../_layout';\nimport { libelleReferenceTechnique, routeCaracteristiquesTechniques } from '../../../src/domain/presentation-commerce';")
c = rep(c, '  const { boutique } = useSession();', '  const { boutique, profilCommerce } = useSession();')
c = rep(c, '<Text style={s.muted}>Référence Quincaillerie</Text>', '<Text style={s.muted}>{libelleReferenceTechnique(profilCommerce)}</Text>')
c = rep(c, "router.push({pathname:'/quincaillerie/caracteristiques/[id]',params:{id:String(p.id)}})", 'router.push(routeCaracteristiquesTechniques(profilCommerce, p.id))')
save(p, c)
for page in ['reference', 'caracteristiques']:
    f = root / f'app/electricite/{page}/[id].tsx'
    if f.exists():
        raise RuntimeError('Electrical route already exists')
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(f'/** Électricité utilise la fiche technique commune, sans changer le secteur de la session. */\nexport {{ default }} from \'../../quincaillerie/{page}/[id]\';\n')

edit('app/habillement/commandes/[id].tsx', "{width:progression+'%'}", '{width:`${progression}%` as const}')
edit('app/habillement/commandes/index.tsx', "{width:(c.pieces>0?Math.min(100,(c.preparees/c.pieces)*100):0)+'%'}", '{width:`${c.pieces>0?Math.min(100,(c.preparees/c.pieces)*100):0}%` as const}')
edit('app/habillement/modele/nouveau.tsx', "            categorie: '',\n            codeBarre:", "            categorie: '',\n            marque: '',\n            referenceFabricant: '',\n            prixGros: '',\n            codeBarre:")
edit('src/services/synchronisation.ts', '''interface LigneAchatSync {
  serveur_id?: number | null;''', '''interface LigneAchatSync {
  /** Cumul reçu dans l'unité de la ligne (absent sur l'ancien protocole). */
  quantite_recue?: number | string;
  serveur_id?: number | null;''')
edit('src/ui/tiroir.tsx', '''    capabilities_non_supportees: [],
    compatible: true,''', '''    capabilities_non_supportees: [],
    // Objet de présentation uniquement : il n'accorde aucun droit d'écriture.
    ecritures_autorisees: [],
    compatible: true,''')
edit('src/services/pdf.ts', '  lignes: LigneAchat[];', "  // Une liste à commander n'a pas encore d'identité SQLite ni de réception.\n  lignes: Array<Pick<LigneAchat, 'libelle' | 'unite' | 'quantite' | 'prixUnitaire' | 'total'>>;")
edit('app/stock/commande.tsx', "import { bonDeCommandeHtml } from '../../src/services/pdf';", "import { bonDeCommandeHtml, type DonneesBonCommande } from '../../src/services/pdf';")
edit('app/stock/commande.tsx', "import type { AchatResume, LigneAchat } from '../../src/services/achat';", "import type { AchatResume } from '../../src/services/achat';")
edit('app/stock/commande.tsx', '    const articles: LigneAchat[] = lignes.map', "    const articles: DonneesBonCommande['lignes'] = lignes.map")
print('Applied reviewed source transformations only.')
