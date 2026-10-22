> Depuis le 22 octobre 2026, messagerie et nouveaux uploads sont retirés. Les données historiques restent couvertes par l’export, la suppression et les contrôles d’accès.

# Information et gestion des données — RG-02, RG-03, RG-04, RG-05, RG-11

Version publiée le 22 octobre 2026. Le contact public fourni par GET /api/privacy est `contact@auxance.dev`. Les fonctions décrites ci-dessous traitent aussi les données historiques encore conservées.

## Ce qui fonctionne

- `/confidentialite/` et `/cookies/` sont des routes publiques de l’application Vue : ouverture directe, rechargement et lecture sans connexion. Elles utilisent les styles et thèmes du site. Les liens figurent en pied de page et dans le profil ; le formulaire d'inscription présente l'utilisation des champs avant le bouton.
- Le prénom facultatif peut être effacé. Une chaîne vide ou composée d'espaces devient `NULL` en base et l'interface reprend le pseudonyme.
- Le bouton de retrait de l'avatar supprime le fichier courant puis sa référence dans une transaction qui verrouille le profil. Si le fichier résiste à la suppression, la réponse `503` conserve la référence pour permettre un nouvel essai. Cette route ne modifie pas le traitement des autres fichiers orphelins, prévu au lot RG-08/RG-09.
- La liste des membres omet les e-mails pour tous les rôles. Les pseudonymes, avatars, identifiants et rôles suffisent à afficher et administrer cette liste. L'ajout d'un membre conserve la saisie de son adresse connue.
- « Download my data » demande le mot de passe actuel et fournit un fichier JSON. La route utilise exclusivement le compte de la session. Session, CSRF et limitation à 3 demandes par heure par IP s'appliquent.

## Contenu et bornes de l'export

`app/data_export.py` lit un instantané PostgreSQL cohérent en transaction `REPEATABLE READ READ ONLY`. Les requêtes sélectionnent des colonnes explicites ; elles ne lisent pas les mots de passe ni les sessions.

Le fichier contient le profil, les appartenances actuelles, les tâches créées par ou attribuées au compte dans les espaces encore accessibles, les messages d'espace écrits par le compte et ses messages directs envoyés. Les messages reçus et l'historique des autres auteurs sont exclus. Les messages écrits par le compte et encore conservés peuvent figurer même après son retrait d'un espace ; cela n'ouvre pas l'accès à l'historique collectif. Les tâches modifiées par des tiers ne sont exportées que si le compte a encore accès à leur espace.

Les images sont référencées par chemin, sans copie binaire dans le JSON. Les logs, les textes qui mentionnent une personne et d'autres données peuvent nécessiter une réponse complémentaire à une demande d'accès. Le bouton n'est pas présenté comme l'intégralité automatique de toute réponse juridique.

Le curseur serveur lit une ligne à la fois. Au-delà de 5 000 lignes au total ou de 5 Mio de JSON sérialisé, la réponse est `409 export_too_large`, sans fichier incomplet. Le contact permettra de traiter un volume supérieur. Aucun fichier d'export n'est conservé sur le serveur : le navigateur crée le téléchargement à partir de la réponse. Les dates de génération sont UTC ; les dates SQL sans fuseau sont accompagnées du paramètre de fuseau de la base.

## Contact retenu et branchement applicatif

Au déploiement, renseigner `PRIVACY_CONTACT_EMAIL=contact@auxance.dev` dans l'environnement, puis redémarrer le backend. Une valeur non vide est validée au démarrage. `GET /api/privacy` expose uniquement cette adresse publique. Les pages et le profil fabriquent un lien `mailto:` avec un objet générique, sans mot de passe, jeton ou donnée du compte dans le corps.

La configuration du courrier reste extérieure au code applicatif. Ne jamais transmettre de mot de passe ou de jeton dans une demande par e-mail.

## Limites et suivi

Le code met en œuvre des mesures techniques ; il ne constitue pas une certification de conformité RGPD. Les durées, les informations sur l’exploitant et les sous-traitants ainsi que le traitement des demandes nécessitent un suivi opérationnel. La sauvegarde de livraison a été vérifiée, mais aucune planification TaskFlow de sauvegarde ou de nettoyage n’a été constatée dans les crontabs et timers système contrôlés le 22 octobre 2026. Voir [retention-sauvegardes.md](retention-sauvegardes.md).

## Inventaire du stockage dans le navigateur

| Élément | Usage dans le code | Durée / retrait |
| --- | --- | --- |
| Cookie `session` | Connexion et jeton CSRF signé. Créé aussi avant connexion pour protéger l'authentification. | Cookie de session du navigateur ; une restauration de session peut le conserver. Le jeton authentifié expire côté serveur après 24 h. Logout : révocation et suppression du cookie. |
| `localStorage.taskflow-theme` | Choix d'apparence, sans identifiant de compte. | Sans échéance automatique ; supprimé avec les données du site. |
| Cache de fichiers statiques | Scripts, styles, polices et icônes du site. | Revalidation prévue par Nginx ; aucune ressource de script chargée depuis un CDN. |
| Blob de téléchargement JSON | Copie demandée par l'utilisateur. | URL temporaire révoquée après le déclenchement du téléchargement ; le fichier sauvegardé reste sous le contrôle de l'utilisateur. |
| Mécanismes Cloudflare | À relever sur la configuration publique effective. | À compléter avant publication ; pas de durée ou de cookie supposé dans la notice. |

Aucun outil publicitaire ou de mesure d'audience n'a été trouvé dans le frontend inspecté. Cette observation ne couvre pas une éventuelle injection par les services du domaine public.

## Vérifier simplement

```bash
python -m pytest -q
npm test --prefix frontend
npm run build --prefix frontend
docker compose -f compose.integration.yaml up -d --wait
TASKFLOW_INTEGRATION=1 python -m pytest -q app/tests/integration
python scripts/check_nginx_security.py
docker compose -f compose.integration.yaml down
```

Les tests réseau utilisent uniquement la base jetable `taskflow_chat_test` sur `127.0.0.1:55438`. Les tests unitaires et réseau se lancent dans des processus Python séparés. Pour relire un cas court, commencer par `app/tests/test_my_data.py` : mauvais mot de passe, tentative de choisir un autre compte, puis téléchargement autorisé.


## Sources de cadrage

- [CNIL : information et transparence](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence)
- [CNIL : portabilité](https://www.cnil.fr/fr/respecter-les-droits-des-personnes/professionnels-comment-repondre-une-demande-de-droit-la-portabilite)
- [CNIL : cookies et autres traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi)
