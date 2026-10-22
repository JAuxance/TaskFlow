# État des lieux avant déploiement — 22 octobre 2026

## Version prête

La version locale retire la messagerie et les nouveaux uploads, conserve les quatre rôles et les protections des données, utilise un bouton de sauvegarde explicite et un Kanban sans glisser-déposer. Aucune table ni aucun volume historique ne doit être supprimé.

Validation réalisée : 98 tests unitaires Python, 29 tests d'intégration, 66 tests frontend et 75 scénarios Playwright réussis ; build TypeScript/Vite et vérifications Nginx réussis. Voir simplification-rncp5.md pour les limites et les environnements.

Les deux dossiers PDF et la présentation actualisés sont dans le dossier personnel RNCP5/mise-a-jour-2026-10-22 ; ils ne sont pas publiés dans Git.

## État du serveur : à constater

Aucune connexion SSH n'a été inspectée pour cette livraison. Le commit actif, les modifications locales, la configuration Nginx et l'état des sauvegardes sont donc inconnus. Le chemin /home/ubuntu/Deploy/TaskFlow et la racine /var/www/taskflow sont des références à confirmer sur le serveur.

Après connexion, commencer par ces commandes de lecture dans le dépôt du serveur :

```bash
pwd
git status --short --branch
git log -1 --format='%h %s'
git remote -v
docker compose -f compose.prod.yaml ps
node --version
npm --version
sudo nginx -t
curl --fail --silent --show-error http://127.0.0.1:5000/health
```

Ne pas communiquer les valeurs du fichier .env. Relever les chemins root, include et les certificats dans le site Nginx actif pour comparer à deploy/nginx/taskflow.auxance.dev.conf.

## Ordre de livraison

1. Sauvegarder la révision active, les modifications locales éventuelles, le frontend publié et la configuration Nginx. Exécuter scripts/backup.sh depuis le dépôt actuel : il valide le dump SQL et archive les images. Préserver séparément le journal d'effacements et le fichier .env avec accès restreint. Vérifier que les sauvegardes sont lisibles avant de poursuivre.
2. Si l'historique Git est réécrit, ne pas effectuer un simple git pull : les historiques divergent. Préférer un checkout distinct de la nouvelle révision ; conserver l'ancien pour le retour arrière. Confirmer les chemins, les paramètres Compose et les volumes existants avant de lancer ce checkout.
3. Construire le frontend de la révision retenue : npm ci --prefix frontend puis npm run build --prefix frontend. Le préparer avant la bascule.
4. Conserver la configuration de production et les secrets existants. Vérifier les migrations déjà appliquées ; cette simplification ne nécessite aucune suppression de table.
5. Depuis le checkout retenu et configuré, exécuter docker compose -f compose.prod.yaml up -d --build. Le nom de projet taskflow-prod doit retrouver les volumes existants. Ne pas utiliser down -v.
6. Publier le frontend construit dans la racine Nginx confirmée. Installer la configuration Nginx après comparaison avec l'existante, conserver les certificats et les inclusions de sécurité. Tester avec sudo nginx -t avant sudo systemctl reload nginx.
7. Contrôler la santé locale et publique, la connexion, une sauvegarde de tâche après rechargement, les restrictions guest, l'export et l'aperçu de suppression sur un compte de recette. Vérifier les logs backend et Nginx. Consigner le commit publié et la date seulement après ces contrôles.

Prévoir une courte fenêtre de maintenance pour éviter une interface ancienne devant une API nouvelle. Pour le retour arrière, restaurer ensemble l'ancien frontend, le backend à l'ancienne révision et la configuration Nginx sauvegardée. Ne pas restaurer une base inutilement : les données restent compatibles et les effacements intervenus depuis une sauvegarde doivent être respectés.

Les commandes exactes de copie et de bascule seront adaptées aux chemins constatés en SSH. Voir deploiement.md et retention-sauvegardes.md pour les procédures complémentaires.
