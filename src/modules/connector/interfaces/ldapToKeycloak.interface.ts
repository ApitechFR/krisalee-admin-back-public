export interface SftpResult {
  ok: boolean;
  path: string;
}

export interface RoleMappingPayload {
  id: string;
  name: string;
}

export interface EmailDTO
{
  email: string;
  storageUsed?: string;
  storageLimit?: string;
  storagePercent?: string;
}

export class EmailAccount
{
  username: string;
  domain: string;
  storageUsed?: string;
  storageLimit?: string;
  // storageUsage: number;

  constructor(emailData: EmailDTO)
  {
    this.username = emailData.email.split('@')[0];
    this.domain = emailData.email.split('@')[1];
    this.storageUsed = emailData.storageUsed;
    this.storageLimit = emailData.storageLimit;
    // this.storageUsage = storagePercent.replace/split
  }

  getFullEmail()
  {
    return `${this.username}@${this.domain}`
  }

}

export interface CredentialsDTO
{
  username: string;
  password: string;
}
