export enum MessageProviderTypeEnum {
  SMS = 'SMS',
  EMAIL = 'EMAIL',
}

export class MessageContentData {
  static projectName = "Solution Phénix";

  sms_header: string;

  username: string;
  password: string;
  internalEmail: string;

  destination: string; // user (email, phone, etc) destination address
  organization: string; // client organization
  activationUrl: string; // user account activation link
}

export class MessageSentResult {
  sent: boolean;
  content: string;
  receiver: string;
}
