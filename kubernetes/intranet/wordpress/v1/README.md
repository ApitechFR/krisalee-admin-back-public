# [Extranet] Wordpress  

## Description

Wordpress est une solution PHP permettant de gérer un site web ainsi que des publications, commentaires, etc.

## Configuration OpenIDConnect

### Instructions

0. Se connecter avec un compte Administrateur
1. Télécharger l'extension `openid-connect-generic` depuis la [page des releases](https://github.com/oidc-wp/openid-connect-generic/releases)
2. Ajouter l'extension à Wordpress, soit via l'interface, soit via `curl`/`wget`/`unzip` dans `wp-content/plugins/openid-connect-generic`
3. Ajouter la gestion des rôles et le mapping de l'internal_email en ajoutant le fichier [`oidc-keycloak-custom.php`](https://github.com/TBG-FR/oidc-keycloak-sso/blob/main/oidc-keycloak-custom.php) dans le dossier `wp-content/plugins/mu-plugins/oidc-keycloak-custom.php`

	sinon depuis l'admin panel: Outils -> Editeur de fichiers des extensions -> OpenID Connect Client Customizations -> oidc-keycloak-custom.php

	Pour mapper l'internal_email au intranet il faut créer un noveau custom mapper dans le client scopes du client intranet: Keyclaok -> Clients -> intranet -> Clients Scopes -> intranet -> add mapper by configuration -> remplire le formulaire

5. Dans les paramètres, chercher le menu dédié aux extensions, et activer l'extension « OpenID Connect Generic Client » puis l'extension personnalisée qui permet d'ajouter des fonctionnalités à l'extension principale
6. Dans les paramètres d'administration, trouver le menu associé à cette extension et renseigner les différents champs  
```
identity key: sub
username key: preferred_username
email format: {email} ou {internal_email}
name format: {given_name} {family_name}
idp_role_admin: realm_access.roles.admin
idp_role_editor: resource_access.$client_id.roles.extranet_level_editor
idp_role_subscriber: resource_access.$client_id.roles.extranet_level_reader
```

### Redirection automatique

Si le paramètre de redirection automatique est activé, Wordpress redirigera automatiquement un utilisateur vers l'authentification OpenIDConnect.

Pour éviter ce comportement (connexion avec un compte d'admin local par exemple), il est possible de désactiver le plugin en déplaçant son dossier ailleurs, puis de le réactiver.

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

### Instructions pour le changement de DNS

Si vous avez changé les DNS et que l'authentification et/ou l'utilisation de Wordpress est bloquée, il est possible de régler le problème comme suit :
0. Désactiver le plugin en déplaçant son dossier ailleurs
0. Ajouter au fichier `wp-config.php` les lignes suivantes
```php
define('WP_SITEURL', 'https://nouvelle-url.com/');
define('WP_HOME', 'https://nouvelle-url.com/');
```
0. Se connecter à Wordpress avec un compte d'administrateur local
0. Re-modifier le fichier `wp-config.php` pour enlever les lignes ajoutées, et ainsi pouvoir modifier ces valeurs dans le menu d'administration
0. Valider pour mettre à jour les valeurs dans la base de données
0. Réactiver le plugin, tout devrait fonctionner