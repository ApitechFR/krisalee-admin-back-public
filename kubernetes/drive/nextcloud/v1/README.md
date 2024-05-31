# [Files] Nextcloud

## Description

Nextcloud est une solution PHP de gestion et partages de fichiers.

## Configuration OpenIDConnect

### Instructions

0. Se connecter avec un compte Administrateur
0. Ajouter l'application « Social Login » https://apps.nextcloud.com/apps/sociallogin
0. Dans les paramètres d'administration, renseigner les différents champs

### Redirection automatique

Si le paramètre de redirection automatique est activé ('social_login_auto_redirect' => true), Nextcloud redirigera automatiquement un utilisateur vers l'authentification OpenIDConnect.

Pour éviter ce comportement (connexion avec un compte d'admin local par exemple), il faut ajouter `?noredir=1` à l'URL de login (ex: `login?noredir=1`)

### Bug Keycloak 20/21 - Realm Roles
- Naviguer dans le menu XXX de Keycloak
- Remplacer 'realm_access.roles.admin' par 'abcd' (valeur bidon)
- Enregistrer
- Remplacer 'abcd' par 'realm_access.roles.admin' (valeur originale)
- Enregistrer
- Les 'realm_roles' apparaissent désormais dans le jeton

### Bug Keycloak 20/21 - Client Roles
- Naviguer dans le menu XXX de Keycloak
- Remplacer 'resource_access.$client_id.roles' par 'abcd' (valeur bidon)
- Enregistrer
- Remplacer 'abcd' par 'resource_access.$client_id.roles' (valeur originale)
- Enregistrer
- Les 'client_roles' apparaissent désormais dans le jeton

## Éléments additionnels

### Groupes pour le partage de fichiers

0. Ajouter l'application « Group folders » https://apps.nextcloud.com/apps/groupfolders
0. Dans les paramètres d'administration, chercher le menu correspondant à ce plugin (URL: `/settings/admin/groupfolders`)
0. Pour chaque groupe (créé en amont), créer et assigner un dossier
