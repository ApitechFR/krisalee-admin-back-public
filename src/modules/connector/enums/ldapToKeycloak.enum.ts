export enum AlertLevelEnum {
  ALERT_LEVEL_0 = 0, // Le niveau 0 d'alerte SMS/Email
  ALERT_LEVEL_1 = 1, // Premier niveau d'alerte SMS/Email
  ALERT_LEVEL_2 = 2, // Second niveau d'alerte SMS/Email
  ALERT_LEVEL_3 = 3, // Troisième niveau d'alerte SMS/Email
}

export enum adminEnum {
  ADMIN_0 = 0,
  ADMIN_1 = 1
}

export enum DriveRoleEnum {
  DOCUMENTS_LEVEL_1 = 0, // Pas d'accès aux documents de gestion de crise
  DOCUMENTS_LEVEL_2 = 1, // Accès aux documents de gestion de crise
  DOCUMENTS_LEVEL_3 = 2, // Accès aux documents de gestion de crise et aux documents techniques
}

export enum IntranetRoleEnum {
  INTRANET_READER = 0,
  INTRANET_EDITOR = 1, // Création de contenu sur le site intranet
}

export enum ExtranetRoleEnum {
  EXTRANET_READER = 0,
  EXTRANET_EDITOR = 1, // Création de contenu sur le site intranet
}
