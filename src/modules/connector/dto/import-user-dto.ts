import UserRepresentation from '@keycloak/keycloak-admin-client/lib/defs/userRepresentation';

export class CSV_USERS_FORMAT_GRANDLYON {
  O_Email: string = '';
  P_Firstname: string = '';
  P_Lastname: string = '';
  P_Phone: string = '';
  P_Email: string = '';
  O_Level: string = '';
  //O_ADMIN: string = '';
  O_Profile: string = '';
  O_JobDepartment: string = '';
  O_JobTitle: string = '';
  O_Alias: string = '';
  O_DateOBirth : string = '';

  static COLUMNS = Object.keys(new CSV_USERS_FORMAT_GRANDLYON());
}

export class ImportUserDTO {
  // Organization
  orgEmail: string;
  orgLevel: string;
  //orgAdmin: string;
  orgProfile: string;
  orgJobTitle: string;
  orgJobDepartment: string;
  orgAlias: string

  // Personal
  firstName: string;
  lastName: string;
  phoneNumber: string;
  emailAddress: string;
  dateOfBirth: string;

  // For now, we're using GrandLyon's provided CSV format
  constructor(csvData: CSV_USERS_FORMAT_GRANDLYON) {
    this.orgEmail = csvData.O_Email;
    this.firstName = csvData.P_Firstname;
    this.lastName = csvData.P_Lastname;
    this.phoneNumber = csvData.P_Phone;
    this.emailAddress = csvData.P_Email;
    this.orgLevel = csvData.O_Level;
    //this.orgAdmin = csvData.O_ADMIN;
    this.orgProfile = csvData.O_Profile;
    this.orgJobTitle = csvData.O_JobTitle;
    this.orgJobDepartment = csvData.O_JobDepartment;
    this.orgAlias = csvData.O_Alias;
    this.dateOfBirth = csvData.O_DateOBirth
  }
}

export class UserRoundcubeDTO {
  first_name: string;
  last_name: string;
  gender: string;
  email_address: string;
  company: string;
  job_title: string;
  department: string;
  groups: string;

  constructor(user: UserRepresentation, organization: string) {
    const missingInformation = ''; // => 'N/A' or 'Information manquante' ?

    // Basic information
    this.first_name = user.firstName ? user.firstName : missingInformation;
    this.last_name = user.lastName ? user.lastName : missingInformation;
    this.gender = ''; // NotImplemented
    this.email_address =
      user.attributes &&
      user.attributes.internal_email != undefined &&
      user.attributes.internal_email.length > 0
        ? user.attributes.internal_email[0]
        : missingInformation;

    // Company information
    this.company = organization;
    this.job_title =
      user.attributes &&
      user.attributes.job_title != undefined &&
      user.attributes.job_title.length > 0
        ? user.attributes.job_title[0]
        : missingInformation; // "Fonction de l’agent"
    this.department =
      user.attributes &&
      user.attributes.job_dept != undefined &&
      user.attributes.job_dept.length > 0
        ? user.attributes.job_dept[0]
        : missingInformation; // "Entité d’appartenance de l’agent"

    // Groups
    const groups = [
      this.department, // "Ce champ sera utilisé pour créer des groupes de distribution en automatique"
      'TOUS', // Groupe contenant tous les utilisateurs (temporaire/inutile ?)
    ];
    this.groups = groups.filter((g) => g != missingInformation).join(';');
  }
}
