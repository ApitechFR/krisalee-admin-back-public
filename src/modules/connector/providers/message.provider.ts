import { setTimeout } from 'timers/promises';
import { Logger } from '@nestjs/common';
import {
  MessageContentData,
  MessageProviderTypeEnum,
  MessageSentResult,
} from './message.dto';

export class MessageCost {
  unitName: string;
  unitCost: number;

  constructor(unitName: string, unitCost: number) {
    this.unitCost = unitCost;
    this.unitName = unitName;
  }

  public getPrice(units: number): string {
    // e.g : 1 credit(s) (0.058€ HT)
    // e.g : 3 credit(s) (0.174€ HT)
    return `${units} ${this.unitName} (${this.unitCost * units} € HT)`;
  }
}

export const freeMessageCost = new MessageCost('message(s)', 0);

/**
 * Base provider to send any type of message
 */
export abstract class MessageProvider {
  name: string;
  type: MessageProviderTypeEnum;
  cost: MessageCost;
  logger: Logger;

  protected abstract checkDestination(dst: string): Promise<string>;
  protected abstract buildMessage(data: MessageContentData): Promise<string>;
  protected abstract sendMessage(
    msg: string,
    receiver: string,
  ): Promise<boolean>;

  protected getFullName() {
    return `${this.name} ${this.type}`;
  }

  constructor(
    providerName: string,
    providerType: MessageProviderTypeEnum,
    providerCost: MessageCost,
  ) {
    this.cost = providerCost;
    this.type = providerType;
    this.name = providerName;

    this.logger = new Logger(`${this.getFullName()}`);
  }

  protected catchError(error: any) {
    this.logger.error(error);
  }

  public async run(data: MessageContentData): Promise<MessageSentResult> {
    try {
      const receiver = await this.checkDestination(data.destination);

      const message = await this.buildMessage(data);
      //const firstSms = message.split('--')[0];
      //const secondSms = message.split('--')[1];

      //this.logger.debug(`First message content :`, firstSms);
      //this.logger.debug(`Second message content :`, secondSms);

      //const messageFinal = firstSms + "Password: " + secondSms;
      //const sent1 = await this.sendMessage(firstSms, receiver);
      //const sent = await this.sendMessage(messageFinal, receiver);
      const sent = await this.sendMessage(message, receiver);
      await setTimeout(2000);
      //const sent2 = await this.sendMessage(secondSms, receiver);
      //const sent = sent1 && sent2;

      return {
        sent,
        content: message,
        receiver,
      };
    } catch (err) {
      this.catchError(err);
      return { sent: false, content: err, receiver: data.destination };
    }
  }
}
