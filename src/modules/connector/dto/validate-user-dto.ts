import { ImportUserDTO } from "./import-user-dto";
import {AlertLevelEnum, DriveRoleEnum, ExtranetRoleEnum, IntranetRoleEnum, adminEnum} from "../enums/ldapToKeycloak.enum"

export class ValidateUserDTO
{
  // @IsEmail()
  username: string;

  firstName: string;
  lastName: string;

  // @IsPhoneNumber()
  phoneNumber: string;
  // @IsEmail
  emailAddress: string;

  // @IsNumber @IsEnum
  alertLevel: AlertLevelEnum;

  //admin: adminEnum;

  // @IsNumber @IsEnum
  driveRole: DriveRoleEnum;
  // @IsNumber @IsEnum
  intranetRole: IntranetRoleEnum;
  // @IsNumber @IsEnum
  extranetRole: ExtranetRoleEnum;

  jobTitle: string;
  jobDepartment: string;

  alias: string;
  
  dateOfBirth: string;

  constructor(userData: ImportUserDTO)
  {
    // L'email de l'organisation (email entreprise) devient l'username
    this.username = userData.orgEmail;

    // L'alias de l'organisation
    this.alias = userData.orgAlias;

    // Récupération telle quelle des informations utilisateur
    this.firstName = userData.firstName;
    this.lastName = userData.lastName;
    this.phoneNumber = userData.phoneNumber;
    // If the personal email is set we set the email to its value
    // Otherwise we set it to the internal email value
    let username = userData.orgAlias ? userData.orgAlias : userData.orgEmail;
    username = username.includes('@') ? username.split("@")[0] : username
    username = username.toLowerCase();
    const internal_email = `${username}@${process.env.ORG_DOMAIN}`
    this.emailAddress = userData.emailAddress ? userData.emailAddress : internal_email;

    // Récupération des droits
    this.alertLevel = parseInt(userData.orgLevel);
    //this.admin = parseInt(userData.orgAdmin)
    const roles = userData.orgProfile.split('|');
    this.driveRole = parseInt(roles[0]);
    this.extranetRole = parseInt(roles[1]);
    this.intranetRole = parseInt(roles[2]);
    this.dateOfBirth = userData.dateOfBirth;

    // Récupération des autres informations de l'organisation
    this.jobTitle = userData.orgJobTitle;
    this.jobDepartment = userData.orgJobDepartment;
  }

  getClientRoles(): Record<string, any>
  {
    const clientRoles:Record<string, any> = {};


    //--------------------------------------------------------------
    const CLIENT_DRIVE = 'drive-nextcloud';
    clientRoles[CLIENT_DRIVE] = [];
    //
    switch(this.driveRole)
    {
      // Access to documents : normal, crisis, technical
      case DriveRoleEnum.DOCUMENTS_LEVEL_3:
        clientRoles[CLIENT_DRIVE].push('documents_level_technical');

      // Access to documents : normal, crisis
      case DriveRoleEnum.DOCUMENTS_LEVEL_2:
        clientRoles[CLIENT_DRIVE].push('documents_level_crisis');

      // Access to documents : normal
      default:
      case DriveRoleEnum.DOCUMENTS_LEVEL_1:
        clientRoles[CLIENT_DRIVE].push('documents_level_normal');
        break;
    }
    //--------------------------------------------------------------


    //--------------------------------------------------------------
    const CLIENT_EXTRANET = 'extranet-wordpress';
    clientRoles[CLIENT_EXTRANET] = [];
    //
    switch(this.extranetRole)
    {
      // Access to extranet as a reader and editor
      case ExtranetRoleEnum.EXTRANET_EDITOR:
        clientRoles[CLIENT_EXTRANET].push('extranet_level_editor')

      // Access to extranet as a reader only
      default:
      case ExtranetRoleEnum.EXTRANET_READER:
        clientRoles[CLIENT_EXTRANET].push('extranet_level_reader')
        break;
    }
    //--------------------------------------------------------------


    //--------------------------------------------------------------
    const CLIENT_INTRANET = 'intranet-wordpress';
    clientRoles[CLIENT_INTRANET] = [];
    //
    switch(this.intranetRole)
    {
      // Access to extranet as a reader and editor
      case IntranetRoleEnum.INTRANET_EDITOR:
        clientRoles[CLIENT_INTRANET].push('intranet_level_editor')

      // Access to extranet as a reader only
      default:
      case IntranetRoleEnum.INTRANET_READER:
        clientRoles[CLIENT_INTRANET].push('intranet_level_reader')
        break;
    }
    //--------------------------------------------------------------

    return clientRoles;
  }

  getRealmRoles(): string[]
  {
    const realmRoles = [];

    // @see AlertLevelEnum
    switch(this.alertLevel)
    {
      default:
      case AlertLevelEnum.ALERT_LEVEL_3:
        realmRoles.push('alert_level_3');
        break;

      case AlertLevelEnum.ALERT_LEVEL_2:
        realmRoles.push('alert_level_2');
        break;

      case AlertLevelEnum.ALERT_LEVEL_1:
        realmRoles.push('alert_level_1');
        break;  
        
      case AlertLevelEnum.ALERT_LEVEL_0:
        realmRoles.push('alert_level_0');
        break;  
    }
    
    // return [ `alert_level_${this.alertLevel} `];
    return realmRoles;
  }

  getGroups(): string[]
  {
    return [];
  }
}

export class userValidationRules {
  static firstName = {
      minLength: 1,
      maxLength: 50
  };

  static lastName = {
      minLength: 1,
      maxLength: 50
  };
  
  static username = {
    minLength: 3,
    maxLength: 50
  }
  
  //""""""""""""""
  //   REGEX
  //""""""""""""""
  static alphabeticRegex = /^[A-Za-zÀ-ÿ]+$/;
  static alphanumericRegex = /^[a-zA-Z0-9]+$/; 
  static numericRegex = /^\d+$/;
  static booleanRegex = /^[0-1]$/;
  static alphaAndSpecialCharsRegex = /[a-zA-Z\W]/;
  /**
   * Regular expression to validate an email address. Does not allow accents
   */
  static emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  /** This regular expression matches a string that:
     - Can be empty
      - Contains only alphabetical characters and dots (.)
      - Does not end with a dot 
  */
  static alphabeticWithDotsRegex = /^[a-zA-Z.]+(?<!\.)$/; // ^(|^[a-zA-Z.]+(?<!.)$) chaine peut être vide
  static dateRegex = /^\d{2}-\d{2}-\d{4}$/;
  static phoneNumberRegex = /^\+\d{1,3}\s?\(?\d{1,4}\)?[-.\s]?\d{1,9}[-.\s]?\d{1,9}$/; // /^\+\d{1,3}\d{9,15}$/;
  static dateOfBirthRegex = /^\d{2}-\d{2}-\d{4}$/
}
