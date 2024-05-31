
# [Auth] Keycloak

### Links

- https://www.keycloak.org/getting-started/getting-started-kube
- https://www.keycloak.org/operator/basic-deployment
- https://medium.com/@shubhamdhote9717/keycloak-deployment-on-kubernetes-cluster-834bee73a567
- https://blog.knoldus.com/how-to-deploy-keycloak-with-postgresql-on-gke/
- https://github.com/bitnami/charts/issues/10236#issuecomment-1412552357
- https://www.keycloak.org/server/db
- https://www.keycloak.org/server/configuration-production

### Commands

Appliquer la configuration
```bash
kubectl apply -f auth/keycloak-secret.yaml
kubectl apply -f auth/keycloak.yaml
kubectl get all
```

Modifier les secrets (credentials)
```bash
echo -en "newUsername" | base64
echo -en "newPassword" | base64

# write to file

./utils/find-secret-dependent-pods.sh keycloak-secret | xargs -n1 kubectl delete pod
```

Obtenir la liste des URLs d'accès à Keycloak
```bash
KEYCLOAK_URL=http://http://3livh9.nodes.c1.sbg5.k8s.ovh.net:$(kubectl get services/keycloak-service -o go-template='{{(index .spec.ports 0).nodePort}}') &&
echo "" &&
echo "Keycloak:                 $KEYCLOAK_URL" &&
echo "Keycloak Admin Console:   $KEYCLOAK_URL/admin" &&
echo "Keycloak Account Console: $KEYCLOAK_URL/realms/myrealm/account" &&
echo ""
```

Désactiver le "SSL requis" pour pouvoir accéder à la console Admin en HTTP
```bash
kubectl exec -it services/keycloak-service -- /bin/bash
cd /opt/keycloak/bin/
./kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin
./kcadm.sh update realms/master -s sslRequired=NONE
```