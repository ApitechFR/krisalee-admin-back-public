# [Mail] Docker Mailserver

## Description

Roundcube est une solution PHP de Webmail, permettant de gérer emails, contacts, etc.

## Configuration OpenIDConnect

### Instructions

0. Créer le fichier `/etc/dovecot/conf.d/auth-oauth2.inc`
```diff
+passdb {
+  driver = oauth2
+  mechanisms = xoauth2 oauthbearer
+
+  # Path for OAuth2 configuration file
+  args = /etc/dovecot/dovecot-oauth2.conf.ext
+}
```

0. Modifier le fichier de configuration Dovecot
```diff
+ auth_mechanisms = xoauth2 oauthbearer plain login

+!include auth-passwdfile.inc
+!include auth-oauth2.inc
```

0. Créer le fichier `/etc/dovecot/dovecot-oauth2.conf.ext`
```diff
+introspection_url = https://keycloak-url.com/realms/ABCD/protocol/openid-connect/token/introspect
+
+introspection_mode = post
+
+client_id = mail-roundcube
+client_secret = xxxxxx
+
+username_attribute = internal_email
```

## Éléments additionnels

### Problème de blocage `fail2ban`

Il faut modifier la configuration `fail2ban` pour éviter que l'IP de la machine Roundcube se fasse bannir par le Mailserver (car chaque tentative d'authentification génère des échecs). On ajoute donc à fail2ban une exclusion sur les adresses IP privées en modifiant le fichier `/etc/fail2ban/jail.local`

```diff
+ignoreip = 127.0.0.1/8 10.0.0.0/8 192.168.1.0/24
```

## Génération des certificats autosignés

Suivre le guide https://docker-mailserver.github.io/docker-mailserver/edge/config/security/ssl/#self-signed-certificates

```
docker run -it --rm --name smallstep -v "$PWD":/app -w /app smallstep/step-cli

step certificate create "Smallstep Root CA" "cacert.pem" "cakey.pem" \
  --no-password --insecure \
  --profile root-ca \
  --not-before "2021-01-01T00:00:00+00:00" \
  --not-after "2031-01-01T00:00:00+00:00" \
  --san "krisalee.dev.joona.fr" \
  --san "mail.krisalee.dev.joona.fr" \
  --kty RSA --size 2048

step certificate create "Smallstep Leaf" mail.krisalee.dev.joona.fr-cert.pem mail.krisalee.dev.joona.fr-key.pem \
  --no-password --insecure \
  --profile leaf \
  --ca "cacert.pem" \
  --ca-key "cakey.pem" \
  --not-before "2021-01-01T00:00:00+00:00" \
  --not-after "2031-01-01T00:00:00+00:00" \
  --san "krisalee.dev.joona.fr" \
  --san "mail.krisalee.dev.joona.fr" \
  --kty RSA --size 2048
```

## Génération des clés DKIM

Suivre le guide https://docker-mailserver.github.io/docker-mailserver/edge/config/best-practices/dkim_dmarc_spf/
