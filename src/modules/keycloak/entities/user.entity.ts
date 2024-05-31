import UserRepresentation from '@keycloak/keycloak-admin-client/lib/defs/userRepresentation';

export class User {
  constructor(user: UserRepresentation) {
    this.id = user.id;
    this.username = user.username;
    this.email = user.email;
    this.firstName = user.firstName;
    this.lastName = user.lastName;

    //Keycloak user attributes
    if (user.attributes) {
      if (user.attributes.phoneNumber) {
        this.phoneNumber = user.attributes.phoneNumber[0];
      }
      if (user.attributes.job_dept) {
        this.jobDepartment = user.attributes.job_dept[0];
      }
      if (user.attributes.job_title) {
        this.jobTitle = user.attributes.job_title[0];
      }
      if (user.attributes.alerted) {
        this.alerted = user.attributes.alerted[0] == 0 ? false : true;
      }
      if(user.attributes.alert_level) {
        this.alert_level = user.attributes.alert_level[0];
      }
    }
  }

  id: string = '';
  username: string = '';
  email: string = '';
  firstName: string = '';
  lastName: string = '';
  phoneNumber: string = '';
  jobDepartment: string = '';
  jobTitle: string = '';
  alerted: boolean = false;
  alert_level: string = null;
}
