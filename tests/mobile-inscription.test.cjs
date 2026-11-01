const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, existsSync} = require('node:fs');
const {resolve} = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(relative) {
  const file = resolve(__dirname, '..', relative);
  const m = new Module(file, module);
  m.paths = Module._nodeModulePaths(resolve(__dirname, '..'));
  m.require = name => name === './commerce' ? load('src/domain/commerce.ts') : require(name);
  m._compile(ts.transpileModule(readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
  return m.exports;
}
test('la reprise Accounts transmet seulement les champs métier et conserve secteur, modes, devise et offre', () => {
  const {donneesBoutiqueAccounts} = load('src/domain/inscription.ts');
  const data = donneesBoutiqueAccounts({nom_boutique:'Mode Plus', telephone:'+22300000000', ville:'Bamako',
    secteur:'HABILLEMENT', devise:'GNF', mode_vente:'GROS', mode_approvisionnement:'IMPORTATION', plan:'BUSINESS',
    login:'prive', nom_patron:'Prive', mot_de_passe:'secret', pin:'1234', jeton:'token'});
  assert.deepEqual(data,{nom_boutique:'Mode Plus',telephone:'+22300000000',ville:'Bamako',secteur:'HABILLEMENT',
    devise:'GNF',mode_vente:'GROS',mode_approvisionnement:'IMPORTATION',plan:'BUSINESS'});
});
test('les champs métier refusent les choix inconnus et le nom vide avant toute requête', () => {
  const {validerBoutique, BOUTIQUE_INITIALE} = load('src/domain/inscription.ts');
  assert.ok(validerBoutique({...BOUTIQUE_INITIALE,secteur:'HABILLEMENT'}).nom_boutique);
  assert.ok(validerBoutique({...BOUTIQUE_INITIALE,nom_boutique:'Mode',secteur:'ADMIN'}).secteur);
  assert.ok(validerBoutique({...BOUTIQUE_INITIALE,nom_boutique:'Mode',secteur:'HABILLEMENT',devise:'FAUX'}).devise);
  assert.deepEqual(validerBoutique({...BOUTIQUE_INITIALE,nom_boutique:'Mode',secteur:'HABILLEMENT'}),{});
});
test('la recherche d’activité ignore les accents sans changer les identifiants métier', () => {
  const {rechercherActivites} = load('src/domain/inscription.ts');
  assert.deepEqual(rechercherActivites('electricite').map(s=>s.code),['ELECTRICITE']);
  assert.equal(rechercherActivites('').length,11);
  assert.equal(rechercherActivites('inexistant').length,0);
});
test('une erreur serveur absente ne masque pas le nom obligatoire local', () => {
  const {fusionnerErreursBoutique} = load('src/domain/inscription.ts');
  assert.deepEqual(fusionnerErreursBoutique({nom_boutique:'Nom obligatoire'}, {nom_boutique:undefined}), {nom_boutique:'Nom obligatoire'});
  assert.deepEqual(fusionnerErreursBoutique({nom_boutique:'Nom obligatoire'}, {nom_boutique:'Nom déjà utilisé'}), {nom_boutique:'Nom déjà utilisé'});
});

test('les onze illustrations sont embarquées et correspondent aux secteurs existants', () => {
  const source=readFileSync(resolve(__dirname,'../src/ui/inscription/Activites.tsx'),'utf8');
  const chemins=Array.from(source.matchAll(/require\('([^']+\.png)'\)/g),m=>m[1]);
  assert.equal(chemins.length,11);
  const {SECTEURS_COMMERCE}=load('src/domain/commerce.ts');
  for(const s of SECTEURS_COMMERCE){
    const path=resolve(__dirname,'../assets/activites',s.code+'.png');
    assert.equal(existsSync(path),true,s.code);
    assert.equal(readFileSync(path).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  }
});
