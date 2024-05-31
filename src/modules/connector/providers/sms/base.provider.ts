import {
  BadRequestException,
  InternalServerErrorException,
  NotImplementedException,
} from '@nestjs/common';
import { ShlinkClient } from 'shlink-client';
import { ShortUrl } from 'shlink-client/lib/cjs/types/endpoints/short-urls';
import { MessageContentData } from '../message.dto';
import { MessageProvider } from '../message.provider';
import parsePhoneNumber from 'libphonenumber-js';

/**
 * Base provider to send SMS
 */
export abstract class PhoneMessageProvider extends MessageProvider {
  protected async checkDestination(dst: string): Promise<string> {
    const phoneNumber = parsePhoneNumber(dst);

    // Any phone number already in international format
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.formatInternational().replace(/\s+/g, ''); // Without spaces
    }
    // French phone number already in other format
    else {
      const phoneNumberFR = parsePhoneNumber(dst, 'FR');

      if (phoneNumberFR && phoneNumberFR.isValid()) {
        return phoneNumberFR.formatInternational().replace(/\s+/g, ''); // Without spaces
      }
    }

    throw new BadRequestException(
      `Could not validate provided phone number '${dst}'`,
    );
  }

  private async shortenLink(originalUrl: string): Promise<string> {
    try {
      const client = new ShlinkClient({
        url: process.env.SHORT_LINK_API_URL,
        token: process.env.SHORT_LINK_API_KEY,
      });

      const shortURL: ShortUrl = await client.createShortUrl({
        findIfExists: true,
        // validUntil:
        longUrl: originalUrl,
      });

      this.logger.log(
        `Generated shortURL '${shortURL.shortCode}' at ${shortURL.dateCreated}`,
      );

      return shortURL.shortUrl;
    } catch (error) {
      // Display all data
      // console.error(error);

      // Hide data by throwing a new error containing only the message
      throw new InternalServerErrorException(
        `Shlink connection error - ${error.message ?? ''}`,
      );
    }
  }

  protected async buildMessage(data: MessageContentData): Promise<string> {
    // const shortLink = await this.shortenLink(data.activationUrl)

    // /!\ ----- /!\
    // Attention aux caractères spéciaux ! Ajoutez simplement '«' et '»'
    // dans ce message, et il coûtera 3 crédits au lieu d'un seul !
    // /!\ ----- /!\
    const messageContent = [
      //`${data.sms_header}\n`,
      `Krisalee démo - Système de secours activé\n`,
      `Accès: ${data.activationUrl}\n`,
      `Login: ${data.username}\n`,
      `Password: ${data.password}`,
    ];

    //const smsContent = messageContent.join('');
    //const userSmsData = [smsContent, data.password];

    //return userSmsData.join('--');
    return messageContent.join('');
  }
}
