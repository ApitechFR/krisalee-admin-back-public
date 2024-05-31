import { MessageProviderTypeEnum } from "../message.dto";
import { freeMessageCost } from "../message.provider";
import { MailMessageProvider } from "./base.provider";

export class FakeMailMessageProvider extends MailMessageProvider
{
    constructor()
    {
        super('Fake', MessageProviderTypeEnum.EMAIL, freeMessageCost);
    }

    protected async sendMessage(msg: string, receiver: string): Promise<boolean>
    {
        this.logger.log(`Message (virtually) sent to ${receiver} !`, msg);

        return true;
    }
}