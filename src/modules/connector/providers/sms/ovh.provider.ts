import { PhoneMessageProvider } from "./base.provider"
import OvhApi, { OvhError } from '@ovh-api/api';
import { OvhParamsFull } from '@ovh-api/api/dist/esm/OvhParams';
import { sms } from '@ovh-api/sms';
import { InternalServerErrorException } from "@nestjs/common";
import { MessageProviderTypeEnum } from "../message.dto";
import { MessageCost } from "../message.provider";

class OvhSmsParams
{
  charset?: sms.CharsetEnum;
  class?: sms.ClassEnum;
  coding?: sms.CodingEnum;
  differedPeriod?: number;
  message: string;
  noStopClause?: boolean;
  priority?: sms.PriorityEnum;
  receivers?: string[];
  receiversDocumentUrl?: string;
  receiversSlotId?: string;
  sender?: string;
  senderForResponse?: boolean;
  tag?: string;
  validityPeriod?: number;
}

class OvhSmsSentParams
{
    validReceivers: string[];
    invalidReceivers: string[];
    ids: number[];
    totalCreditsRemoved: number;
}

class OvhSmsEstimate
{
    characters: number;
    charactersClass: string;
    maxCharactersPerPart: number;
    parts: number;
}

class OvhSenderParams
{
  description?: string;
  reason?: string;
  sender: string;
}

class OvhSenderValidation
{
  serviceName: string;
  sender: string;
  code: string;
}

const ovhMessageCost = new MessageCost('credit(s)', 0.058);

export class OvhPhoneMessageProvider extends PhoneMessageProvider
{
    constructor()
    {
        super('OVHCloud', MessageProviderTypeEnum.SMS, ovhMessageCost);
    }

    protected async sendMessage(msg: string, receiver: string): Promise<boolean>
    {
        const config: Partial<OvhParamsFull> =
        {
            endpoint: 'ovh-eu',
            appKey: String(process.env.OVH_SMS_APP_KEY),
            appSecret: String(process.env.OVH_SMS_APP_SECRET),
            consumerKey: String(process.env.OVH_SMS_CONSUMER_KEY),
            //
            // certCache: './cert-cache.json', // optional cache certificat on disk.
            //
            accessRules: [ // optional limit the requested privileges.
                'GET /me',
                'GET /sms',
                'GET /sms/*',
                'POST /sms',
                'POST /sms/*',
                'PUT /sms',
                'PUT /sms/*',
                'DELETE /sms',
                'DELETE /sms/*',
                // 'GET /me',
                // 'GET /sms', // Get message services
                // 'GET /sms/*', // Get message service details
                // 'GET /sms/*/senders', // Get message service senders
                // 'GET /sms/*/senders/*', // Get message service sender details
                // 'GET /sms/*/jobs', // Get jobs for selected message service
                // 'POST /sms/*/jobs', // Add job to selected message service
            ],
        }

        const ovh = new OvhApi(config);
        this.logger.log(ovh.accessRules);

        const ovhMsgServices: string[] = await ovh.request('GET', `/sms`, {});

        if (ovhMsgServices.length > 0)
        {
            const ovhMsgServiceName = ovhMsgServices.at(0);
            this.logger.log(`Using message service ${ovhMsgServiceName}`);

            //=====
            // Check SMS
            //=====

            const ovhMsgServiceJobs: any = await ovh.request('GET', `/sms/${ovhMsgServiceName}/jobs`, {});
            this.logger.log(`${ovhMsgServiceJobs.length} messages currently in queue !`);

            //=====
            // Find Sender
            //=====

            const ovhMsgServiceSenders: string[] = await ovh.request('GET', `/sms/${ovhMsgServiceName}/senders`, {});
            this.logger.log(`${ovhMsgServiceSenders.length} messages senders currently configured (${ovhMsgServiceSenders.join('/')})`);

            // const senderName: string = createSenderParams.sender;
            const senderName: string = process.env.OVH_SMS_SENDER_NAME;
            const senderNameEncoded: string = encodeURIComponent(senderName);

            if (ovhMsgServiceSenders.length > 0 && ovhMsgServiceSenders.includes(senderName))
            {
                const ovhMsgServiceSender: any = await ovh.request('GET', `/sms/${ovhMsgServiceName}/senders/${senderNameEncoded}`, {});

                if (ovhMsgServiceSender.status !== "enable")
                {
                    throw new InternalServerErrorException('Messages sender not validated !')
                }
            }
            else
            {
                // const createSenderParams:OvhSenderParams = {
                //   sender: 'POS-GL',
                //   description: 'Krisalee - KRISALEE',
                //   reason: "Envoi des SMS d'activation pour Krisalee (Krisalee)"
                // }

                // // Create sender if needed
                // const createSenderResult = await ovh.request('POST', `/sms/${ovhMsgServiceName}/senders`, createSenderParams);
                // this.logger.log('Message sender created !', createSenderResult);

                throw new InternalServerErrorException('Messages sender not found !');
            }

            //=====
            // Send SMS
            //=====

            const sendMsgParams: OvhSmsParams = {
                message: msg,
                noStopClause: true,
                senderForResponse: false,
                sender: senderName,
                receivers: [receiver],
            }

            // Get sms message estimation
            const estimateSms: OvhSmsEstimate = await ovh.request('POST', `/sms/estimate`, { message: msg, noStopClause: true, senderType: 'alpha' });
            this.logger.debug('Cost details :', estimateSms);
            this.logger.log(`Message will cost ${this.cost.getPrice(estimateSms.parts)}`);

            if (estimateSms.parts <= parseInt(process.env.ALERT_MAX_COST))
            {
                // Send the sms for real
                const sendMsgResult:OvhSmsSentParams = await ovh.request('POST', `/sms/${ovhMsgServiceName}/jobs`, sendMsgParams);

                if(sendMsgResult.validReceivers.includes(receiver) || sendMsgResult.invalidReceivers.length == 0)
                {
                    this.logger.debug('Message sent !');
                    this.logger.debug(sendMsgResult);

                    return true;
                }
                else
                {
                    this.logger.error("Failed to send the message !");
                    this.logger.debug(sendMsgResult);

                    return false;
                }
            }
            else
            {
                this.logger.error('Message cost is too high !');
                this.logger.debug(estimateSms);

                return false;
            }
        }
    }

    protected catchError(error: any): void
    {
      if(error instanceof OvhError)
      {
        const errResTime = error.message.substring(error.message.length - 12, error.message.length - 1);
        const errMessage = error.message.replace(errResTime, '');

        this.logger.error(`${errMessage} (${errResTime.replace(' in ', '')})`);
        this.logger.error(`${error.errorCode} ${error.httpCode} on ${error.method} ${error.path}`);
      }
      else
      {
          super.catchError(error);
      }
    }
}