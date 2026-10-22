# Simplification RNCP5 de TaskFlow

Révision locale du 22 octobre 2026. Modifications réalisées avec assistance IA. Livraison Git en préparation ; déploiement serveur non effectué. Voir etat-des-lieux-deploiement.md. Le fichier app/uploads.py comportait une modification préalable : elle a été préservée.

## Liste des changements

1. **Messagerie retirée** : chat des workspaces, messages directs, navigation associée, événements Socket.IO et dépendances temps réel.
2. **Images simplifiées** : nouveaux uploads d'avatar et d'icône retirés, initiales affichées dans l'interface. L'accès protégé aux fichiers historiques et leur suppression restent actifs.
3. **Sauvegarde unique** : tous les champs d'une tâche attendent Save changes. Un seul PATCH, entrées désactivées pendant l'envoi, brouillon conservé en cas d'erreur et confirmation avant abandon. useSerialQueue supprimé.
4. **Quatre rôles conservés** : owner, admin, member et guest, avec distinction du titulaire principal et transfert de propriété.
5. **Kanban conservé sans glisser-déposer** : statut modifié dans la fiche, tri par priorité puis identifiant, consultation au clavier et sur mobile.
6. **Gestion des données conservée** : export JSON, confirmation du mot de passe, aperçu de suppression, protection des espaces partagés, nettoyage réessayable et journal d'effacement après restauration.
7. **Déploiement de référence unique** : compose.prod.yaml avec Nginx, Gunicorn, PostgreSQL et Redis. Variante Caddy retirée du répertoire courant. Gunicorn passe de 100 à 4 threads ; plus de proxy Socket.IO.
8. **Aspect conservé** : thèmes, disposition responsive et composants existants. Captures réelles et images de présentation actualisées.
9. **Correction SQL** : UPDATE limité aux champs reçus, liste fermée de colonnes, paramètres séparés et mise à jour de updated_at. Refus des PATCH vides ou contenant des champs inconnus.

## Données historiques

Aucune migration destructive. Les six tables courantes coexistent avec deux tables historiques de messages et file_cleanup_jobs. Les colonnes et volumes d'anciennes images restent nécessaires aux traitements existants. Les retirer brutalement pourrait casser l'export, l'effacement ou la restauration. La conservation technique n'ajoute pas de nouveaux usages à l'interface.

Sur le même champ d'une tâche, la dernière écriture réussie gagne encore. Deux écritures sur des champs différents sont préservées. Le tableau ne se synchronise pas en temps réel entre utilisateurs. Les protections des données sont des mesures techniques, pas une certification de conformité RGPD globale.

## Vérifications exécutées

| Vérification | Résultat |
| --- | --- |
| pytest unitaire | 98 réussis, 5 modules d'intégration ignorés dans cette commande |
| Intégration HTTP/PostgreSQL | 29 réussis, dont restauration après suppression et écritures simultanées |
| Vitest | 66 réussis, 12 fichiers |
| TypeScript et build Vite | Réussis |
| Playwright complet | 75 scénarios réussis, quatre profils Chromium Linux |
| Captures actualisées | Régénérées volontairement, inspectées puis comparées à nouveau : 11 scénarios visuels/légaux réussis |
| Nginx dans un conteneur jetable | Syntaxe, en-têtes IP usurpés, HTTPS amont, cache privé, CSP, redirection et ressources vérifiés |

Les tests locaux Python ont utilisé un environnement temporaire Python 3.14. Les tests navigateur utilisent l'image Docker Python 3.12 et PostgreSQL 17. Node 24 et Chromium Linux ont servi au frontend. Sur cette machine, Docker Desktop a été utilisé avec une copie de travail temporaire Windows, car son intégration WSL était désactivée. Aucun test n'a visé la base réelle ni le site public.

## Documents actualisés

Dossier de livraison : C:/Users/auxan/Documents/RNCP5/mise-a-jour-2026-10-22/

- Auxance_Jourdan_DP_DWWM_maj.pdf : 14 pages, modèle administratif conservé, contenu des exemples actualisé. Identité, déclaration et signature d'origine inchangées.
- TaskFlow_Dossier_RNCP5_DWWM_maj.pdf : 48 pages, structure et pagination conservées, nouvelles captures, sauvegarde explicite, SQL partiel, tests datés et distinction entre version locale et ancienne bêta.
- TaskFlow_Presentation_RNCP5_maj.odp : 25 diapositives, notes d'oral actualisées, textes et tableaux éditables.
- TaskFlow_Presentation_RNCP5_maj.pptx : copie éditable validée avant conversion en ODP.

La présentation d'origine était constituée d'images. La nouvelle reprend le bandeau sombre, le logo et la palette, mais reconstruit les mises en page avec des textes et tableaux natifs. Arial et Consolas assurent un rendu disponible sur cette machine. Les captures d'application restent des images. Les maquettes historiques utiles du dossier sont explicitement distinguées des captures actuelles.

## Ce qu'il faut savoir expliquer à l'oral

- Le trajet formulaire Vue, PATCH HTTP, CSRF/session, permissions, validation, UPDATE, réponse et affichage.
- La différence entre une interface désactivée et une autorisation serveur.
- Les clés étrangères, les contraintes et les transactions.
- Les différences entre 400, 401, 403 et 404.
- L'export et la suppression, avec les limites du contenu partagé et des sauvegardes.
- Les contributions personnelles et l'assistance IA, sans revendiquer une écriture manuelle de tout le frontend.

Le RNCP5 ne prohibe ni Vue ni les WebSockets. Le recentrage est un choix pédagogique. La partie SQL est démontrée ; Redis utilisé via Flask-Limiter ne constitue pas à lui seul une preuve personnelle de composant NoSQL. Les preuves NoSQL et POO doivent être préparées séparément selon les réalisations du candidat.

## Sources

- Référentiels RE et REAC DWWM V04 fournis par le candidat.
- [France compétences, RNCP37674](https://www.francecompetences.fr/recherche/rncp/37674/).
- [CNIL, droit à l'effacement](https://www.cnil.fr/fr/comprendre-mes-droits/le-droit-leffacement-supprimer-vos-donnees-en-ligne).

Les originaux des trois documents ne sont pas remplacés. La révision simplifiée doit être publiée puis vérifiée sur le serveur avant de la présenter comme la version du site public.
