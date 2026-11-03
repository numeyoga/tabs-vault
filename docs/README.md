---
created_at: "2026-11-03"
updated_at: "2026-11-03"
application_version: "0.1.0"
---

# Spécifications de Tabs Vault

Documents de conception de la première version, avant implémentation. La version cible est 0.1.0, définie dans `public/manifest.json` et `package.json`.

- [Spécifications fonctionnelles](specifications-fonctionnelles.md) : comportements attendus et critères d’acceptation.
- [Spécifications techniques](specifications-techniques.md) : architecture proposée, données, permissions et contraintes.
- [Stratégie de test](strategie-tests.md) : approche BDD, niveaux de test et validation des navigateurs.

## Décisions confirmées

Décisions confirmées : ouverture dans la fenêtre courante avec groupes natifs, nouvelle fenêtre sinon ; retrait d’un groupe distinct de la suppression globale ; paramètres et fragments significatifs pour l’identité des URLs ; conservation des titres existants et ajout des tags lors de l’import ; demande de choix pour les groupes importés existants, comme lors d’une capture.

Valeurs confirmées le 2026-11-03 : confirmation au-delà de **20 onglets**, limite d’import de **10 Mio** et cible de **5 000 liens**.

La suppression utilise désormais une corbeille persistante, avec réactivation et vidage définitif ; elle remplace l’annulation temporaire de 10 secondes.

Règles de corbeille confirmées : la réactivation restaure toute l’organisation et recrée groupes/tags si nécessaire ; une nouvelle sauvegarde de l’URL réactive le lien ; l’export exclut la corbeille, l’import ajoute sans transmettre d’état supprimé ; vider la corbeille exige une confirmation.

Également confirmés : menus contextuels pour sauvegarder groupe/fenêtre ; recherche sur titre, URL et tags avec filtres combinables et tri par date décroissante ; navigation privée exclue ; modification d’une URL vers un doublon refusée avec indication du lien existant ; réactivation à l’import d’une URL en corbeille.

Les règles de sécurité, contraintes de compatibilité et choix d’architecture sont documentés séparément des besoins confirmés. Le contrôle effectif des Tab Islands d’Opera reste à vérifier techniquement.

- [Rapport de vérification](verification-compatibilite.md) : preuves documentaires, essai Chromium et limites de validation.
