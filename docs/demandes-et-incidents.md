# Demandes et incidents

Registre du lot RG-12. Chaque ligne est ajoutée au moment du traitement. Ne pas y copier de mot de passe, de jeton de session ou de contenu de message.

| Date | Type | Compte concerné | Échéance | Action | Clos |
| --- | --- | --- | --- | --- | --- |
| | accès, rectification, effacement, portabilité, limitation, opposition, incident | pseudonyme ou e-mail | date de la demande + 1 mois | | |

## Demande d'une personne

1. La demande arrive à `contact@auxance.dev`, ou la personne utilise le profil (copie JSON, prénom, avatar, suppression).
2. Vérifier qu'elle concerne bien ce compte. Ne pas changer un e-mail sur un simple message. Ne jamais demander le mot de passe.
3. Accès ou copie : si la personne peut se connecter, elle utilise « Download my data ». Sinon, produire l'export depuis une session de ce compte après vérification, puis l'envoyer au demandeur.
4. Rectification du prénom ou de l'avatar : la personne le fait dans le profil. Pseudonyme ou e-mail : l'exploitant le modifie seulement après vérification.
5. Effacement : la personne utilise la suppression du compte. Cette action écrit une ligne dans `/var/taskflow/deletions.log`, en dehors de la base. Si elle ne peut plus se connecter, l'exploitant lance `docker compose -f compose.prod.yaml exec -T backend python scripts/delete_account.py personne@example.com` après vérification. Ce script refuse un espace encore partagé et écrit la même ligne. Le tableau ci-dessus suit la demande ; la réapplication après restauration lit le fichier, pas le tableau.
6. Répondre dans un mois. Noter la ligne dans le registre ci-dessus.

## Incident

1. Noter l'heure, ce qui est touché (compte, base, images, site) et la première source de l'alerte.
2. Couper l'exposition si le site sert des données à tort : recharger la configuration précédente du frontend, de l'image backend et de Nginx, comme décrit dans [protection-requetes.md](protection-requetes.md).
3. Si des sauvegardes sont en cause, ne pas restaurer sur la base en service. Suivre [retention-sauvegardes.md](retention-sauvegardes.md). `scripts/restore.sh` réapplique le fichier d'effacements avant la réouverture.
4. Prévenir les personnes concernées si leurs données ont été exposées, via `contact@auxance.dev`, et consigner l'incident dans le registre.
