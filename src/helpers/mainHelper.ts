import { BadRequestException } from '@nestjs/common/exceptions';

export function AddDateNow(prefix: string): string {
  return prefix + '_' + Date.now();
}

export function ThrowDuplicateAttributeError(error: any, name: string) {
  if (error.code == 11000) {
    throw new BadRequestException(`${name} already exist`);
  }
}

export function logCommandWithResult(command: string, result: string | Buffer) {
  console.log(
    '\x1b[33m%s\x1b[0m',
    `${getFormattedDate()}\nCommand: `,
    `${command}`,
  );
  console.log('\x1b[33m%s\x1b[0m', `Command result: `, `${result}`);
}

export function toTimeStamp(strDate: Date) {
  return new Date(strDate).getTime();
}

function getFormattedDate() {
  const currentDate = new Date();

  // Format the date in the France time zone (Central European Time, CET)
  const formattedDate = currentDate.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return formattedDate;
}

export function isUserAdmin(user: any): boolean{
  if(user.realm_access.roles.includes('admin'))
    return true;
  return false;
}
