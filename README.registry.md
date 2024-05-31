
# Krisalee - Registry

## Description

Le container `registry` permet de monter un miroir/cache du DockerHub (`https://registry-1.docker.io`), afin d'éviter les problèmes liés aux limitations mises en place par le DockerHub. On `pull` donc désormais les images en contactant la `registry`, qui ira récupérer l'image sur le DockerHub seulement en cas de besoin (image récupérée précédement, expirée ou mise à jour depuis).

**Les identifiants sont stockés dans Bitwarden. Cherchez `Krisalee - Registry Docker`**

## Guides associés

### **Générer de nouveaux identifiants**
```bash
# Démarrer un container docker temporaire adapté
# => permet de ne garder aucune trace, et de s'assurer le bon encodage
docker run -it --rm httpd:2 /bin/bash

# Génération d'une nouvelle ligne à partir d'un login/password
htpasswd -Bbn login password

# Il suffit ensuite d'ajouter le résultat dans le fichier associé
cat ./registry/credentials
```

### **Tester et valider les identifiants**
```bash
# Tentative de récupération d'une image
# => échec car non authentifié
docker pull registry.krisalee.dev.joona.fr/library/alpine:3.18.2

# Authentification auprès de la registry
# => demande le login et le password
docker login registry.krisalee.dev.joona.fr

# Tentative de récupération d'une image
# => réussite car désormais authentifié
docker pull registry.krisalee.dev.joona.fr/library/alpine:3.18.2
```

### **Utiliser la registry dans K8S via `imagePullSecret` dans le `service account`**
```bash
# Variable correspondant au nom du secret
REG_SECRET_KEY=
REG_SERVER_URL='registry.krisalee.dev.joona.fr'

# Création d'un nouveau secret correspondant aux identifiants
# TODO - Faut-il modifier l'url ? @see https://github.com/kubernetes/kubernetes/issues/57801#issuecomment-520712243
kubectl create secret docker-registry ${REG_SECRET_KEY} --docker-server=${REG_SERVER_URL} --docker-username='USERNAME' --docker-password='' --docker-email="k8s@${REG_SERVER_URL}" --namespace='default'

# Vérification de la bonne création du secret
kubectl get secrets ${REG_SECRET_KEY}

# Modification du 'service account' par défaut pour utiliser ce secret en tant que 'imagePullSecret'
kubectl patch serviceaccount default -p "{\"imagePullSecrets\": [{\"name\": \"${REG_SECRET_KEY}\"}]}"

# Vérifier la bonne modification (ou éditer manuellement le 'service account')
kubectl edit serviceaccount/default

# Vérifier que le paramètre imagePullSecrets est bien utilisé lors du lancement de nouveaux pods
kubectl run nginx --image=${REG_SERVER_URL}/library/nginx --restart=Never
kubectl get pod nginx -o=jsonpath='{.spec.imagePullSecrets[0].name}{"\n"}'
kubectl describe pod nginx | grep Image
```

⚠ Malgré cette configuration, lors du le lancement d'un pod avec une image publique (ex: `nginx`), K8S ira directement chercher sur le DockerHub...
⚠ En attendant de trouver la cause, le plus simple et le plus fiable est de d'ajouter explicitement le miroir devant l'image (ex: `registry.krisalee.dev.joona.fr/library/nginx`, `registry.krisalee.dev.joona.fr/shlinkio/shlink:3.6.0`, etc)
