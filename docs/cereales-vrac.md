# Profil Céréales & Vrac

Le profil `CEREALES_VRAC` utilise le catalogue SIMPLE et le stock consolidé en kilogrammes.

## Invariants
- unité de base recommandée : `Kg`;
- conditionnements standards : 5 kg, demi-sac 25 kg, sac 50 kg, tonne;
- aucune variante technique obligatoire;
- `MULTI_UNIT`, `BULK_WEIGHT` et `WHOLESALE` pilotent les parcours métier;
- caisse, achats, stock et inventaire réutilisent les moteurs génériques;
- lots/provenance avancés restent gérés par le Web;
- cette validation mobile exécute uniquement tests JavaScript et TypeScript, jamais de build APK/AAB.
