---
created_at: '2026-11-03'
updated_at: '2026-11-03'
application_version: '0.1.0'
---

# Vérifier la qualité du code

Guide de contribution pour Tabs Vault 0.1.0. Les outils de qualité sont des dépendances de développement ; le build de l’extension reste sans framework runtime.

## Sommaire

- [Exécuter les contrôles](#exécuter-les-contrôles)
- [Règles du projet](#règles-du-projet)
- [Lire la couverture](#lire-la-couverture)
- [Intégration continue](#intégration-continue)
- [Entretenir les dépendances](#entretenir-les-dépendances)

## Exécuter les contrôles

Prérequis : Node.js 24.15 ou supérieur dans la branche 24, disponible avec `.nvmrc`, et npm. Depuis la racine du dépôt, dans un terminal Bash :

```bash
npm ci
npm run check
```

`check` exécute, dans cet ordre, le lint JavaScript/CSS, la vérification du formatage, les tests Vitest avec couverture puis le build. Chaque étape conserve son code de sortie ; un échec arrête la chaîne.

| Commande                | Usage                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| `npm run lint`          | Vérifier JavaScript et CSS, sans avertissement accepté.               |
| `npm run lint:fix`      | Appliquer les corrections automatiques du lint.                       |
| `npm run format`        | Formater JavaScript, CSS, HTML, JSON, YAML et Markdown avec Prettier. |
| `npm run format:check`  | Vérifier le formatage sans modifier les fichiers.                     |
| `npm run test:coverage` | Produire les rapports de couverture Vitest.                           |
| `npm run test:e2e`      | Construire puis exécuter les parcours d’interface Playwright.         |

Après une modification, corriger le lint puis lancer le formatage avant la vérification complète :

```bash
npm run lint:fix
npm run format
npm run check
```

Pour les changements d’interface, exécuter également les [tests Playwright](../README.md#tester). Les corrections automatiques doivent être relues dans le diff ; elles ne remplacent pas les tests.

## Règles du projet

ESLint utilise une configuration plate dans `eslint.config.js`, avec des contextes distincts pour le navigateur, le worker d’extension et les outils Node.js. Les règles bloquent notamment les variables inutilisées, `var`, les égalités implicites hors comparaison à `null`, `eval`, les fonctions construites dynamiquement, les traces console dans le runtime et l’injection HTML par `innerHTML`/`outerHTML`/`insertAdjacentHTML`.

Le plugin Playwright contrôle les tests et Page Objects. Les tests focalisés (`test.only`), ignorés, les attentes temporelles arbitraires et les clics forcés sont bloquants. Les actions utilisateur restent exprimées par les Page Objects ; la [stratégie BDD](strategie-tests.md) conserve la correspondance métier.

Stylelint vérifie le CSS standard, les noms de classes en kebab-case, les propriétés et valeurs invalides, ainsi que les sélecteurs et déclarations dupliqués. Deux règles de lignes vides sont déléguées à Prettier pour éviter des corrections contradictoires. La règle de spécificité descendante est écartée : elle compare des composants indépendants comme les champs de formulaire et les contrôles de navigation ; les doublons et erreurs CSS restent contrôlés.

Prettier est l’unique référence de formatage : deux espaces, guillemets simples en JavaScript et largeur cible de 100 caractères. `.editorconfig` fixe UTF-8, les fins de ligne LF et la présence d’une dernière ligne vide. Le lockfile npm et les dossiers générés sont exclus du formatage ; les dépendances, builds, rapports de test et couverture sont exclus de Git.

## Lire la couverture

Le rapport HTML est disponible dans `coverage/index.html`, et LCOV dans `coverage/lcov.info`. Le périmètre mesuré couvre le domaine, le stockage, l’adaptateur navigateur et le worker. L’interface DOM est vérifiée séparément par Playwright ; elle n’est pas incluse dans ce pourcentage unitaire. Les API natives simulées ne constituent pas une validation du navigateur réel.

Aucun seuil global arbitraire n’est imposé. Le rapport sert à repérer les branches utiles non testées ; les comportements critiques, les erreurs et la non-régression restent les critères de livraison. Ajouter des tests qui démontrent un comportement observable plutôt que des tests reproduisant l’implémentation uniquement pour augmenter un score.

## Intégration continue

Le workflow `.github/workflows/quality.yml` s’exécute sur les pushs et pull requests :

- Le job `quality` installe avec `npm ci`, lance `npm run check` et conserve le rapport de couverture.
- Le job `browser` installe Chromium et ses prérequis puis lance les parcours Playwright de l’interface ; les traces d’échec sont conservées sept jours.

Les actions GitHub sont fixées par SHA, le jeton dispose uniquement du droit de lecture du dépôt et les anciens lancements d’une même branche sont annulés lorsqu’un nouveau commence. La validation réelle de l’extension et des Tab Islands reste distincte, selon le périmètre convenu.

La configuration locale du workflow ne prouve pas une exécution réussie sur GitHub. Après son premier push, les résultats seront visibles dans Actions. Pour protéger `main`, les checks peuvent être déclarés obligatoires dans les règles du dépôt ; ce fichier ne modifie pas ces règles à distance.

## Entretenir les dépendances

Utiliser `npm ci` pour reproduire le lockfile et relire les changements de versions. Consulter les avis publics avec :

```bash
npm audit
```

Éviter `npm audit fix --force` sans analyse de la migration proposée. L’override `minimatch` impose une version corrigée à la chaîne ESLint pour l’avis GHSA-g3hv-75wg-m249 ; les règles de lint sont vérifiées avec cette version. Retirer cet override lorsque les dépendances amont imposeront elles-mêmes la version corrigée, puis réexécuter audit et contrôles.
