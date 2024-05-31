# [Chat] RocketChat

## Description

RocketChat est une solution Meteor/JS de messagerie instantanée.

## Initialisation de la base MongoDB pour RocketChat

```bash
# Connexion en mongosh au pod Kuberneters
# Ne pas oublier d'ajouter '--kubeconfig /path/to/kubeconfig.yaml' si besoin
kubectl exec -it pod/apitech-chat-rocketchat-mongodb-7cbc987d56-rd5rc -- mongosh

# Initialisation du ReplicaSet
mongosh
rs.initiate()
var config = rs.conf() 
config.members[0].host="krisalee-chat-rocketchat-mongodb:27017" 
rs.reconfig(config)

# Initialisation de la Database
use rocketchat
db.test.insert({})
db.createUser(
{ 
 user: "rocketchat",
 pwd:  "A6cdcdsCD96vf1SC684vbfmopnb",
 roles:
 [
 {
   "role" : "readWrite",
   "db" : "local"
 },
 { role:"readWrite",db:"rocketchat"}
 ] 
} );
```

## Initialisation de RocketChat

Il existe un bug à contourner, qui empêche la connexion (boucle infinie sur la page de login)
1. Lors de la configuration OpenIDConnect dans RocketChat, ne pas choisir le mode `redirect`, mais `pop-up`
2. Aller dans la configuration générale de RocketChat (menu "Comptes"), et désactiver le 2FA (Authentification à double facteur)
3. Vous pouvez désormais passer l'authentification OIDC en mode `redirect`

**⚠ Sans ces précautions, il devient impossible de se connecter ! RocketChat demande le 2FA, mais n'affiche pas la fenêtre associée en mode `redirect`... ⚠** 

## Éléments additionnels

- [Instructions pour restaurer l'accès administrateur](https://docs.rocket.chat/setup-and-configure/advanced-workspace-management/restoring-an-admin) avec `mongosh` à la place de `mongo`

- Script permettant de **rediriger directement  les utilisateurs vers l'authentification Keycloak**, inspiré d'[une issue Github sur le sujet](https://github.com/RocketChat/Rocket.Chat/issues/2327)
```js
// Variables
const loginAreaSelector = '.rcx-css-1tmhcn7';
const loginButtonTitle = 'Keycloak';

// Script
if (window.location.search.includes('?noredir=1') == false)
{
  setTimeout(function()
  {
    //
    // Hide regular login form
    //

    const loginForm = document.querySelector(loginAreaSelector).children[0]; // form
    const loginElementsToKeep = [];
    
    for(let child of loginForm.childNodes)
    {
      if(child.tagName.toLowerCase() === 'header' || child.role === 'group')
      {
        loginElementsToKeep.push(child);
      }
    }

    loginForm.replaceChildren(...loginElementsToKeep);
    //
    // Style and click on SSO login button
    //

    const loginButton = document.querySelector(`button[title=${loginButtonTitle}]`);
    loginButton.classList.add('rcx-button--primary');
    loginButton.click();

  }, 500);
}
```

- Script plus simplifié

```js
if (window.location.search.indexOf('noredir=1') === -1) {
  setTimeout(function () {
    var keycloakButton = document.querySelector('button[title=Keycloak]');
    if (keycloakButton) {
      keycloakButton.click();
    }
  }, 500);
}
```