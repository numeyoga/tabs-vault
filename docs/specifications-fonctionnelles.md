---
created_at: '2026-11-03'
updated_at: '2026-11-03'
application_version: '0.1.0'
---

# Spécifications fonctionnelles

Référence de la première version à développer pour Chrome, Edge, Brave et Opera sur ordinateur. Les comportements ci-dessous définissent la version de développement 0.1.0 ; leur présence dans cette référence ne remplace pas les résultats de test.

Statut : décisions principales confirmées le 2026-11-03. Sauvegarde immédiate d’un onglet ; lien unique réutilisable dans plusieurs groupes ; demande utilisateur en cas de groupe existant ou sans nom ; nouvelle fenêtre si les groupes natifs sont indisponibles ; import/export JSON et corbeille persistante inclus. Vitest et Playwright sont retenus, avec tests écrits de manière BDD et Page Object Model, sans framework BDD. Valeurs également confirmées : confirmation au-delà de 20 onglets, import limité à 10 Mio et cible de 5 000 liens. Les derniers points fonctionnels listés ont été confirmés le 2026-11-03 ; voir les [décisions confirmées](README.md#décisions-confirmées). La compatibilité réelle des navigateurs relève des vérifications techniques.

## Sommaire

- [Objectif et périmètre](#objectif-et-périmètre)
- [Concepts](#concepts)
- [Sauvegarde](#sauvegarde)
- [Bibliothèque](#bibliothèque)
- [Organisation et édition](#organisation-et-édition)
- [Réouverture](#réouverture)
- [Suppression et sauvegarde des données](#suppression-et-sauvegarde-des-données)
- [Qualité et acceptation](#qualité-et-acceptation)

## Objectif et périmètre

Conserver des liens depuis les onglets du navigateur et les gérer dans un onglet dédié. Les données restent dans le profil local : aucun compte, synchronisation cloud, télémétrie, publicité ou service externe. Ouvrir volontairement un lien entraîne naturellement une navigation vers son site.

La première version couvre la capture, la recherche, les tags, les groupes, l’édition, la suppression, la réouverture et l’import/export JSON. Les onglets privés, la récupération de sessions complètes, le contenu des pages, les favoris du navigateur et le glisser-déposer sont hors périmètre initial.

## Concepts

| Objet             | Définition                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Lien              | URL unique dans la bibliothèque, titre modifiable, dates de création et modification, tags.             |
| Groupe            | Ensemble nommé et ordonné de liens ; un lien peut appartenir à plusieurs groupes.                       |
| Tag               | Étiquette réutilisable ; un lien peut porter plusieurs tags.                                            |
| Onglet sauvegardé | Seuls son URL et son titre sont conservés, sans historique, cookies, formulaire ni position de lecture. |

## Sauvegarde

**F-01 — Onglet actif.** Un clic sur le bouton de la barre du navigateur sauvegarde immédiatement l’onglet actif. Aucun popup ne détourne ce clic. Une confirmation visuelle accessible et un badge temporaire signalent la réussite ; un échec de stockage n’affiche jamais de réussite. Un menu contextuel du bouton donne accès à la bibliothèque, à la sauvegarde de la fenêtre et à celle du groupe actif.

**F-02 — URLs autorisées.** Seules les URLs absolues HTTP et HTTPS sans identifiants intégrés sont acceptées. Les pages internes, fichiers, URLs `javascript:`, `data:` et pages d’extension sont refusés avec une explication. L’extension ne visite pas les URLs pour les vérifier.

**F-03 — Doublons.** L’identité utilise l’URL sérialisée par l’API native `URL`, sans retirer fragment, paramètres ou slash final. Sauvegarder une URL existante ne crée pas de deuxième lien et préserve son titre personnalisé et ses tags. L’utilisateur reçoit « Déjà sauvegardé ». Un doublon peut néanmoins rejoindre un autre groupe ; il n’apparaît qu’une fois dans chaque groupe.

**F-04 — Groupe du navigateur.** La capture porte sur tous les onglets du groupe actif dans leur ordre visuel. Si son titre est non vide après suppression des espaces de bord, ce titre devient celui du groupe dans Tabs Vault. Sinon, un formulaire demande un nom avant écriture. Une annulation ne sauvegarde rien.

Si un groupe de bibliothèque porte déjà ce nom, l’utilisateur doit choisir « Compléter ce groupe » ou « Créer un groupe distinct ». Aucun regroupement silencieux ; si plusieurs groupes portent ce nom, il choisit une destination par identifiant. Compléter ajoute les liens absents à la fin, dans l’ordre capturé, sans déplacer les membres existants. Les noms ne constituent pas des identifiants.

**F-05 — Fenêtre.** La capture de la fenêtre courante conserve les groupes nommés et l’ordre de leurs onglets. Chaque groupe sans nom nécessite la saisie d’un nom ; les onglets hors groupe restent sans groupe. Un écran récapitulatif résout noms et collisions avant validation unique. Les URLs refusées sont listées comme ignorées ; les autres sont sauvegardées ensemble. Si toutes sont refusées, aucune écriture n’a lieu. Capturer des onglets ne les ferme jamais.

## Bibliothèque

**F-06 — Navigation.** « Ouvrir la bibliothèque » réutilise son onglet s’il existe dans la fenêtre courante, sinon en crée un. Une liste compacte présente titre, domaine, tags, groupes et date de sauvegarde. L’URL complète est disponible dans l’infobulle du domaine et le formulaire d’édition. Les actions secondaires sont regroupées dans un menu « … » accessible au clavier. Les états vide, chargement et erreur sont explicites.

**F-07 — Recherche.** Recherche textuelle insensible à la casse sur titre, URL et noms des tags. Un filtre de groupe et plusieurs filtres de tags peuvent se combiner : texte ET groupe ET tous les tags sélectionnés. Le tri par défaut est la date de création décroissante ; la vue d’un groupe permet l’ordre du groupe. Une sélection multiple concerne uniquement les liens explicitement sélectionnés ; « Tout sélectionner » sélectionne les résultats filtrés. Tout changement de filtre efface la sélection.

## Organisation et édition

**F-08 — Édition.** Modifier titre ou URL d’un lien, ajouter/retirer des tags, l’ajouter à un groupe ou l’en retirer. Une URL modifiée vers une URL déjà présente est refusée avec un lien vers l’entrée existante, sans fusion implicite. Un titre vide utilise l’URL comme libellé.

**F-09 — Groupes et tags.** Créer, renommer et supprimer des groupes et tags. Les noms sont non vides après trim, limités à 100 caractères Unicode. Les tags sont uniques après normalisation Unicode NFC et comparaison en minuscules ; ils conservent leur graphie d’affichage. Les groupes peuvent partager un nom. Retirer un lien d’un groupe ne supprime pas le lien. Supprimer un groupe ou un tag retire uniquement l’organisation correspondante après confirmation. Réordonner les liens d’un groupe avec des commandes accessibles « Monter/Descendre ».

**F-14 — Organisation rapide.** Chaque lien actif possède deux boutons « + » : un dans la zone des tags, avec le style arrondi et la couleur des tags, et un dans celle des groupes, avec le style des pastilles de groupe. Le panneau présente en premier la catégorie du bouton choisi. Il ouvre un panneau avec recherche, deux sections Tags/Groupes et une coche par association existante. Sélectionner un élément ajoute immédiatement l’association ; le sélectionner à nouveau la retire sans supprimer le tag/groupe ni ses autres associations. Le panneau reste ouvert pour plusieurs modifications, se ferme au clic extérieur ou avec Échap et fonctionne au clavier. Les changements visibles sont confirmés après écriture réussie ; une erreur laisse l’état précédent intact et affiche une explication.

La recherche propose de créer directement un tag ou un groupe nommé lorsqu’aucun nom identique n’existe dans la catégorie concernée. Création et association sont atomiques. Pour les tags, les règles de normalisation de F-09 s’appliquent. Les groupes homonymes existants restent des choix distincts.

Deux tags sont affichés dans la ligne ; au-delà, une pastille « +N » ouvre la liste complète par clic ou clavier. Tous les tags restent visibles dans le formulaire d’édition. Le panneau rapide est réservé aux liens actifs.

## Réouverture

**F-10 — Unité et lot.** Ouvrir un lien, la sélection ou un groupe. Un lien s’ouvre dans un nouvel onglet ; un lot utilise un groupe natif lorsque disponible. Le groupe est créé dans la fenêtre courante ; en l’absence de groupes natifs, le lot s’ouvre dans une nouvelle fenêtre. L’ordre est celui du groupe ou, pour une sélection, celui de la liste affichée. Au-delà de 20 liens, demander une confirmation indiquant le nombre d’onglets.

Lorsque l’API de groupes est utilisable, créer un groupe et restaurer son nom pour un groupe sauvegardé ; une sélection libre reçoit un nom modifiable proposé. Les _Tab Islands_ d’Opera ne sont pas présumés pilotables : le support réel doit être vérifié. Si le regroupement est indisponible, ouvrir le lot dans une nouvelle fenêtre et indiquer ce mode d’ouverture. Si le regroupement échoue après ouverture, conserver les onglets ouverts et expliquer l’échec, sans les ouvrir une deuxième fois.

Les ouvertures réussies ne retirent jamais les liens de la bibliothèque. En cas d’échec partiel, afficher les succès et échecs ; une nouvelle tentative vise uniquement les échecs.

## Suppression et sauvegarde des données

**F-11 — Corbeille.** Deux actions distinctes : « Retirer de ce groupe » enlève uniquement cette appartenance ; « Mettre à la corbeille » effectue une suppression logique du lien dans toute la bibliothèque. Le lien est conservé dans le stockage, mais n’apparaît plus dans les vues actives, leurs recherches ni leurs actions de réouverture.

Une vue « Corbeille » liste les liens supprimés et permet de les réactiver. Cet état persiste après fermeture de l’interface ou redémarrage du navigateur ; la règle d’annulation pendant 10 secondes est abandonnée. L’action « Vider la corbeille » supprime définitivement tous les liens qui s’y trouvent. Elle ne supprime aucun lien actif. Aucun effacement automatique n’est prévu.

Réactiver un lien restaure ses tags et ses appartenances aux groupes ; les groupes et tags supprimés depuis sont recréés si nécessaire. Sauvegarder à nouveau une URL en corbeille réactive immédiatement ce même lien avec son organisation. Vider la corbeille exige une confirmation explicite indiquant le nombre de liens définitivement effacés ; annuler cette confirmation ne modifie aucune donnée.

**F-12 — Export.** Exporter la bibliothèque active dans un fichier JSON versionné comprenant liens, tags, groupes et ordre des membres. Les liens en corbeille et leurs métadonnées de restauration sont exclus ; les références de groupes aux liens exclus sont retirées du fichier. Avertir que ce fichier contient l’historique des liens conservés et n’est pas chiffré. Aucun transfert réseau.

**F-13 — Import.** Importer un export compatible par sélection de fichier. Valider avant toute écriture ; un fichier invalide, trop volumineux ou d’une version future est rejeté sans modifier les données. Présenter un bilan avant confirmation. L’import est additif : il ne supprime aucun lien et n’importe aucun état de suppression. Une URL importée déjà en corbeille est réactivée selon F-11 ; une URL déjà active reste active. L’import fusionne par URL et par nom normalisé des tags ; les titres et dates des liens existants restent inchangés, leurs tags sont complétés. Pour chaque groupe importé dont le nom existe déjà, demander de compléter un groupe existant ou de créer un groupe distinct, comme lors d’une capture (F-04). Compléter conserve l’ordre existant et ajoute les liens absents dans l’ordre importé. Un groupe nouveau reçoit un nouvel identifiant et conserve l’ordre importé ; un groupe sans nom nécessite la saisie d’un nom. Les identifiants importés ne remplacent pas ceux de la bibliothèque.

Informer que les données sont liées au profil et peuvent être perdues à la désinstallation ou lors de son effacement ; recommander l’export. Aucun secret de site ni contenu de page n’est stocké.

## Qualité et acceptation

Toutes les actions sont utilisables au clavier, avec focus visible, libellés accessibles et annonces de résultat. La couleur seule ne porte aucune information essentielle. L’interface reste utilisable à 200 % de zoom.

Objectif initial : 5 000 liens et export jusqu’à 10 Mio. Les écritures proches du quota doivent échouer explicitement sans perte des données précédentes. Sur la machine de référence enregistrée dans les résultats de tests, la recherche sur 5 000 liens vise une mise à jour en moins de 300 ms après saisie, hors délai volontaire de saisie.

Les critères de livraison et les exemples BDD sont définis dans la [stratégie de test](strategie-tests.md). Les contraintes d’implémentation figurent dans les [spécifications techniques](specifications-techniques.md).
