# [Mail] Roundcube

## Description

Roundcube est une solution PHP de Webmail, permettant de gérer emails, contacts, etc.

## Configuration OpenIDConnect

### Instructions

Ajouter ces valeurs au fichier `config/config.inc.php`
```php
// OAuth / OIDC
$config['oauth_provider'] = 'keycloak';

// Provider name to be displayed on the login button
$config['oauth_provider_name'] = 'Keycloak';

// Mandatory: OAuth client ID for your Roundcube installation
$config['oauth_client_id'] = 'mail-roundcube';

// Mandatory: OAuth client secret
$config['oauth_client_secret'] = 'xxxxxxxx';

// Mandatory: URI for OAuth user authentication (redirect)
$config['oauth_auth_uri'] = 'https://url.com/realms/ABCD/protocol/openid-connect/auth';

// Mandatory: Endpoint for OAuth authentication requests (server-to-server)
$config['oauth_token_uri'] = 'https://url.com/realms/ABCD/protocol/openid-connect/token';

// Optional: Endpoint to query user identity if not provided in auth response
$config['oauth_identity_uri'] = 'https://url.com/realms/ABCD/protocol/openid-connect/userinfo';

// Mandatory: OAuth scopes to request (space-separated string)
$config['oauth_scope'] = 'email profile openid';

// Optional: additional query parameters to send with login request (hash array)
// $config['oauth_auth_parameters'] = [];

// Optional: array of field names used to resolve the username within the identity information
$config['oauth_identity_fields'] = ['internal_email'];

// Boolean: automatically redirect to OAuth login when opening Roundcube without a valid session
$config['oauth_login_redirect'] = true;
```

### Redirection automatique

Pour déclencher la redirection automatique pour tous les utilisateurs, il faut utiliser le paramètre suivant
```php
// Boolean: automatically redirect to OAuth login when opening Roundcube without a valid session
$config['oauth_login_redirect'] = true;
```

Il n'existe pas à ce jour de paramètre à mettre dans l'URL pour éviter le déclenchement de la connexion automatique (pour la connexion à un compte admin local par exemple)

## Éléments additionnels

### **Carnet d'adresse partagé et auto-alimenté**

0. Installer le plugin permettant l'ajout d'un carnet d'adresses global [`globaladdressbook`](https://github.com/johndoh/roundcube-globaladdressbook)
0. Installer le plugin permettant l'import d'utilisateurs dans ce carnet d'adresses [`importaddressbook`](https://github.com/ApitechFR/roundcube-importaddressbook)
0. Activer les plugins en modifiant le fichier `config/config.inc.php` pour y ajouter ces plugins (**l'ordre est important**)
    ```php
    $config['plugins'] = ['importaddressbook', 'globaladdressbook'];

    // TODO vérifier si c'est nécessaire
    $config['default_addressbook'] = 'global';
    ```
0. Pour la configuration, se référer aux fichiers README des plugins mentionnés ci-dessus. Voici par exemple le fichier `/plugins/globaladdressbook/config.inc.php`
    ```php
    /**
     * GlobalAddressbook configuration file
     */

    // In order to enable GlobalAddressbook configure an array like the global
    // example below. The array key must contain only safe characters, this will be
    // users as the internal identifier for the address book ie. a-zA-Z0-9_
    // This identifider is used when reference the address book in other parts
    // of Roundcube (eg. other plugins or main config) so it must be unique within
    // your with in installation.
    $config['globaladdressbooks']['global'] = [
        // the name of the address book displayed to the user
        'name' => 'Annuaire',

        // the name of the dummy user which holds the global address book, if the user does not exist it will be created
        // the name can contain the following macros that will be expanded as follows:
        //      %d is replaced with the domain part of the username (if the username is an email address or default mail domain if not)
        //      %i is replaced with the domain part of the email address from the user's default identity
        //      %h is replaced with the imap host (from the session info)
        // eg. to create one global address book per domain: global_addressbook@%d
        'user' => 'global_addressbook_user',

        // default user permissions
        // 0 - global address book is read only
        // 1 - users can add, edit and delete contacts (full permissions)
        // 2 - users can add but not edit or delete contacts
        // 3 - users can add and edit but not delete contacts
        'perms' => 0,

        // always copy contacts from the global address book to another address book, never move
        'force_copy' => true,

        // allow groups in global address book
        'groups' => true,

        // global address book admin user
        // admin user(s) can always add/edit/delete entries, overrides readonly
        // either a single username, or an array of usernames, see README for more info
        'admin' => null,

        // show addresses from the global address book in the auto complete menu when composing an email
        'autocomplete' => true,

        // check globaladdressbook for known senders when displaying remote inline images
        'check_safe' => true,

        // address book visibility
        // null for visible to all or an array of usernames, see README for more info
        'visibility' => null,
    ];

    // activate GlobalAddressbook for selected mail hosts only. If this is not set all mail hosts are allowed.
    // example: $config['globaladdressbook_allowed_hosts'] = ['mail1.domain.tld', 'mail2.domain.tld'];
    $config['globaladdressbook_allowed_hosts'] = null;
    ```

0. Dans Keycloak > Clients > `mail-roundcube` > Roles, créer un nouveau role (ex: name `admin`, description `Roundcube admin (read/write rights on global addressbook)`)
0. Dans Keycloak > Users, créer un nouvel utilisateur (ex: username `postmaster@krisalee.com`, email `postmaster@krislaee.joona.fr`)
0. Dans Keycloak > Users > `postmaster@krisalee.com` > Credentials, ajouter un mot de passe (non temporaire) à cet utilisateur (et le stocker dans Bitwarden)
0. Dans Keycloak > Users > `postmaster@krisalee.com` > Attributes, ajouter l'email interne (ex: attribute `internal_email`, value `postmaster@krislaee.joona.fr`)
0. Dans Keycloak > Users > `postmaster@krisalee.com` > Roles Mapping, rechercher et assigner le role (`client role` et non `realm role`) nommé `admin` appartenant au client `mail-roundcube`
0. Dans Mailserver, vérifier que cet utilisateur existe bien (`setup email list`) ou le créer si besoin (`setup email add postmaster@krislaee.joona.fr`)
0. En vous connectant avec ce nouvel utilisateur, vous devez pouvoir ajouter un nouveau contact dans le carnet d'addresse global ("Annuaire")
0. Il faut donc renseigner ce compte dans le `.env` du backend, pour qu'il soit utilisé lors de l'import des utilisateurs
    ```
    MAILSERVER_POSTMASTER_USERNAME=postmaster@krisalee.com
    MAILSERVER_POSTMASTER_PASSWORD=...
    ```

**Une fois ces configurations/manipulations effectuées :**
- L'import utilisateur alimente le carnet d'adresse global via une connexion de l'utilisateur postmaster
- Tout utilisateur ayant le `client_role` nommé `admin` (client `mail-roundcube`) pourra modifier le carnet d'adresses global
- Il est donc possible, pour un administrateur de la plateforme, de donner les droits sur ce carnet d'adresses à d'autres utilisateurs, via Keycloak