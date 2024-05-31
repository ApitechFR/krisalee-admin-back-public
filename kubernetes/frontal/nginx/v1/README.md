Démarrage frontal:
1 - pod synchro + synchro
2 - pod nginx frontal (voir cas des conf https sans les certif de présent, préciser que le vhost: default_http.conf)
3 - si cert existe pas : 
	->démarrage job certbot creation + delete
  - si present:
	->démarrage job renew + delete