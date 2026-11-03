---
created_at: "2026-11-03"
updated_at: "2026-11-03"
application_version: "0.1.0"
---

# Spécifications techniques

Référence d’architecture proposée pour la première version de Tabs Vault. La version 0.1.0 est implémentée ; les capacités des navigateurs devront être validées avant livraison.

Statut : décisions principales confirmées le 2026-11-03. Sauvegarde immédiate d’un onglet ; lien unique réutilisable dans plusieurs groupes ; demande utilisateur en cas de groupe existant ou sans nom ; nouvelle fenêtre si les groupes natifs sont indisponibles ; import/export JSON et corbeille persistante inclus. Vitest et Playwright sont retenus, avec tests écrits de manière BDD et Page Object Model, sans framework BDD. Valeurs également confirmées : confirmation au-delà de 20 onglets, import limité à 10 Mio et cible de 5 000 liens. Les derniers points fonctionnels listés ont été confirmés le 2026-11-03 ; voir les [décisions confirmées](README.md#décisions-confirmées). La compatibilité réelle des navigateurs relève des vérifications techniques.

## Sommaire

- [Socle et construction](#socle-et-construction)
- [Composants](#composants)
- [Permissions et sécurité](#permissions-et-sécurité)
- [Modèle de données](#modèle-de-données)
- [Écritures et messages](#écritures-et-messages)
- [Capture et réouverture](#capture-et-réouverture)
- [Import et évolution](#import-et-évolution)
- [Compatibilité et validation](#compatibilité-et-validation)

## Socle et construction

JavaScript moderne en modules ES, HTML et CSS natifs. Aucun TypeScript, React ou autre framework runtime. Les types et contrats peuvent être décrits en JSDoc sans compilation TypeScript. Node.js 24 est indiqué dans `.nvmrc` ; les versions de dépendances sont verrouillées par `package-lock.json` et installées avec `npm ci`.

Vite construit les pages HTML et les bundles JavaScript statiques ; Manifest V3 déclare un service worker module et une action sans `default_popup`. Le build doit conserver les chemins du manifeste, copier les ressources locales et produire un dossier `dist/` chargeable en extension non empaquetée. Aucun code distant, `eval` ou serveur Vite requis au runtime de l’extension. Le serveur Vite peut accélérer le travail sur l’interface avec un adaptateur simulé ; seul le build chargé dans un navigateur valide les API réelles.

Scripts disponibles : `dev` (Vite), `build` (production), `test` (Vitest), `test:e2e` (Playwright). Voir le README racine pour leur exécution.

## Composants

| Composant proposé | Responsabilité |
| --- | --- |
| `src/background/` | Événements action/menu, commandes, lecture des onglets, écritures sérialisées, ouverture par lot. |
| `src/library/` | Page bibliothèque, formulaires, sélection, rendu DOM et états accessibles. |
| `src/domain/` | Fonctions pures de validation, normalisation, recherche, déduplication et fusion. |
| `src/storage/` | Lecture du document, validation, migrations et persistance. |
| `src/browser/` | Adaptateur des API Chromium et détection des capacités. |
| `tests/` | Tests unitaires, intégration et parcours réels. |

Le service worker ne repose pas sur des variables mémoire pour une donnée durable. Ses listeners sont enregistrés au chargement. Les pages communiquent via `chrome.runtime.sendMessage` ; elles observent `chrome.storage.onChanged` pour rafraîchir une bibliothèque ouverte. Pas de content script, d’accès au DOM des sites ou de script injecté.

## Permissions et sécurité

| Permission prévue | Usage |
| --- | --- |
| `storage` | Bibliothèque dans `chrome.storage.local`, sans `storage.sync`. |
| `tabs` | Lire titres et URLs des onglets, notamment pour capturer une fenêtre entière. |
| `tabGroups` | Lire titres/ordre des groupes et regrouper les onglets ouverts lorsque disponible. |
| `contextMenus` | Actions secondaires depuis le bouton de l’extension. |

`activeTab` seul ne suffit pas pour capturer les autres onglets. Aucune `host_permissions`, permission cookies, historique, réseau ou `unlimitedStorage` prévue. La présence de `tabGroups` dans chaque manifeste cible doit être vérifiée sur chaque navigateur ; si elle n’est pas acceptée, produire une variante de manifeste qui l’omet et active le repli fonctionnel. Le manifeste déclare `incognito: "not_allowed"` : navigation privée exclue.

Politique CSP des pages d’extension : `script-src 'self'; object-src 'none'; connect-src 'none'`. Aucun CDN, police distante, appel `fetch`, télémétrie ou service de favicons ; utiliser des pictogrammes locaux. Les navigations déclenchées par l’utilisateur et les visites initiales des onglets sont distinctes des connexions de l’extension.

Construire les éléments avec les API DOM et `textContent`, jamais avec du HTML importé. Valider chaque URL à la capture, à l’import, à l’édition et immédiatement avant ouverture. Valider aussi les messages et leurs émetteurs : accepter uniquement les pages connues de cette extension, sans `externally_connectable`. Ne pas journaliser URLs ou titres en production. Les données locales et exports ne sont pas chiffrés par l’application.

## Modèle de données

Un document JSON sous la clé `vault` de `chrome.storage.local` :

```js
const vault = {
  schemaVersion: 1,
  revision: 0,
  links: [], // { id, url, title, tagIds, createdAt, updatedAt, deletedAt, restoreContext }
  tags: [], // { id, name }
  groups: [], // { id, name, linkIds, createdAt, updatedAt }
};
```

Identifiants UUID générés avec `crypto.randomUUID()`. Dates UTC ISO 8601. `linkIds` ordonné et sans répétition ; aucune référence inexistante autorisée. `tagIds` est un ensemble. Un lien peut appartenir à plusieurs groupes : supprimer un groupe ne supprime pas ses liens. La couleur d’origine et les identifiants de session du navigateur ne font pas partie du contrat initial.

Identité URL : `new URL(input).href`, après validation HTTP/HTTPS et refus de `username`/`password`. Ne pas retirer les paramètres de suivi, les fragments ou modifier le chemin. Identité des tags : trim, NFC, `toLowerCase()` ; les règles fonctionnelles de nommage s’appliquent après trim. Les noms de groupe sont comparés après trim et NFC, avec casse conservée ; une collision exige un choix utilisateur.

Le stockage d’un document unique simplifie l’intégrité d’une mutation mais impose de surveiller sa taille. Lire `chrome.storage.local.QUOTA_BYTES` et `getBytesInUse()` ; gérer l’erreur effective de `set`, y compris si l’estimation préalable passe. L’objectif de 5 000 liens ne garantit pas leur stockage pour des URLs de taille arbitraire. L’interface doit expliquer le quota et permettre export/suppression. Une évolution vers IndexedDB nécessitera une migration explicite. La liste est rendue par tranches de 100 liens pour éviter de construire plusieurs milliers de lignes DOM à chaque recherche ; la sélection globale couvre tous les résultats.

## Écritures et messages

Un seul écrivain, le service worker, traite les commandes dans une file séquentielle : lire → valider → calculer le nouvel état → incrémenter `revision` → attendre `storage.local.set` → répondre. Les erreurs d’une commande ne bloquent pas la suivante. Les pages ne modifient jamais directement `vault`. Une mutation de capture/import est une seule écriture du document ; ne pas prétendre à une transaction distribuée ou à une exécution exactement une fois après crash.

Chaque message comporte `{ requestId, type, payload, expectedRevision }`. La réponse contient `{ requestId, ok, revision, result }` ou `{ requestId, ok: false, error: { code, message } }`. Une révision obsolète est rejetée avant mutation ; l’interface recharge puis présente le conflit au lieu d’écraser les modifications. Les intentions de capture sont recalculées après résolution des dialogues si nécessaire.

Codes attendus : `INVALID_INPUT`, `UNSUPPORTED_URL`, `DUPLICATE_URL`, `REVISION_CONFLICT`, `QUOTA_EXCEEDED`, `CAPABILITY_UNAVAILABLE`, `IMPORT_VERSION_UNSUPPORTED`, `BROWSER_OPERATION_FAILED`. Le succès n’est annoncé qu’après persistance. Après interruption avec réponse perdue, relire l’état et demander confirmation avant de rejouer une opération non idempotente.

La suppression logique persiste `deletedAt` (date UTC ISO 8601) sur le lien ; `null` indique un lien actif. La restauration remet ce champ à `null`. À la mise à la corbeille, `restoreContext` conserve une copie durable des tags et appartenances (identifiants, noms et positions dans les groupes). Les suppressions ultérieures de groupes/tags ne doivent pas effacer ce contexte. À la restauration, réutiliser les entités encore existantes par identifiant et recréer celles disparues, avec remappage des références et déduplication des tags ; un groupe homonyme distinct ne remplace pas automatiquement le groupe disparu. Effacer le contexte après restauration réussie. Sauvegarder à nouveau la même URL déclenche cette restauration, sans créer de second lien. Le filtrage actif/corbeille est centralisé et s’applique aussi aux recherches et ouvertures de groupes. La corbeille fait partie du document durable, pas de l’état mémoire d’une page. Elle consomme donc le même quota de stockage.

Les commandes de mise à la corbeille, restauration et purge passent par le même écrivain sérialisé et le contrôle de révision. Vider la corbeille retire définitivement les liens marqués supprimés et nettoie leurs références dans les groupes dans la même écriture ; les liens actifs restent intacts. Les échecs de persistance sont signalés sans annoncer de réussite. La commande de purge exige une confirmation utilisateur et ne s’exécute pas si celle-ci est annulée. Les listeners de changement actualisent les autres pages après une écriture réussie.

## Capture et réouverture

Capturer l’onglet actif via `tabs.query`, un groupe via son `groupId` et `tabGroups.get`, une fenêtre via les onglets triés par `index`. Ignorer les onglets privés et les URLs non autorisées avec bilan. Ne pas déduire un titre de groupe du titre d’un onglet. Si une capture nécessite un dialogue, ouvrir une page locale de confirmation ; les intentions en attente sont conservées dans `storage.session` puis supprimées après validation ou annulation, sans persister les onglets refusés.

Détecter les méthodes disponibles de `chrome.tabGroups` et `chrome.tabs.group`, puis gérer aussi leurs erreurs runtime. Une capacité exposée ne prouve pas le comportement propre aux Tab Islands d’Opera. À la réouverture avec groupes natifs, utiliser la fenêtre courante ; sinon créer une nouvelle fenêtre. Créer les onglets séquentiellement dans l’ordre, enregistrer les IDs réussis, les regrouper puis appliquer le titre. Retourner un bilan par lien. Ne pas réessayer automatiquement tout le lot après un échec partiel. Pour les opérations longues, conserver la progression dans `storage.session` ; après redémarrage du worker, afficher le bilan connu et ne jamais rouvrir automatiquement les liens d’état incertain.

## Import et évolution

Format d’échange : `{ format: "tabs-vault", exportVersion: 1, exportedAt, vault }`. L’export est une projection de la bibliothèque active : aucun lien supprimé, aucun `restoreContext`, et aucune référence à un lien en corbeille. L’import est additif et ne transmet pas d’état supprimé ; une URL importée en corbeille est restaurée, puis enrichie selon F-13. Taille maximale d’entrée : 10 Mio avant parsing. Vérifier types, versions, unicité des IDs, URLs, dates, longueurs de noms et intégrité des références avant de préparer la fusion. Rejeter les propriétés inattendues ou les reconstruire explicitement par liste autorisée ; ne jamais fusionner un objet JSON arbitraire dans un objet de configuration.

Préparer un nouvel état en mémoire avec correspondances entre anciens et nouveaux IDs, selon [F-13](specifications-fonctionnelles.md#suppression-et-sauvegarde-des-données), puis écrire une fois après confirmation et contrôle de révision. Résoudre les collisions de noms et les noms manquants avant confirmation, comme pour une capture. Un second import réutilise les liens et demande pour chaque collision s’il faut compléter un groupe existant ou créer un groupe distinct. Export par `Blob` et lien local `download`, import par champ fichier : aucune permission `downloads` nécessaire.

Au démarrage, valider `schemaVersion`. Une version future ouvre un état d’erreur sans réinitialiser ni écraser les données ; proposer leur export brut pour récupération. Les migrations futures seront séquentielles, testées sur fixtures et persistées uniquement après validation complète et vérification de l’espace nécessaire. Ne jamais traiter une erreur de lecture comme une bibliothèque vide.

## Compatibilité et validation

Cible : versions stables de Chrome, Edge, Brave et Opera sur ordinateur, avec numéros exacts et système d’exploitation consignés à chaque validation. Le niveau de validation et les résultats de la sonde API sont consignés dans le [rapport de vérification](verification-compatibilite.md) ; cela ne constitue pas une validation applicative. Chrome/Chromium sert à l’automatisation ; les autres produits exigent des tests réels de leurs API et de leurs restrictions. Firefox et navigateurs mobiles sont hors périmètre initial.

Références officielles à consulter lors de l’implémentation : [Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3), [storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs), [tabGroups](https://developer.chrome.com/docs/extensions/reference/api/tabGroups), [Vite](https://vite.dev/guide/), [extensions avec Playwright](https://playwright.dev/docs/chrome-extensions).

Les vérifications et conditions de livraison figurent dans la [stratégie de test](strategie-tests.md).
