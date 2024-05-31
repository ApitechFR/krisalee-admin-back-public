import { MessageProviderTypeEnum } from "../message.dto";
import { freeMessageCost } from "../message.provider";
import { PhoneMessageProvider } from "./base.provider";

export class FakePhoneMessageProvider extends PhoneMessageProvider
{
    constructor()
    {
        super('Fake', MessageProviderTypeEnum.SMS, freeMessageCost);
    }

    protected async sendMessage(msg: string, receiver: string): Promise<boolean>
    {
        this.logger.log(`Message (virtually) sent to ${receiver} !`, msg);

        return true;
    }
}