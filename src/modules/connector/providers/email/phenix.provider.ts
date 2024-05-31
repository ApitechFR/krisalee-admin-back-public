import { NotImplementedException } from "@nestjs/common";
import { MessageProviderTypeEnum } from "../message.dto";
import { freeMessageCost } from "../message.provider";
import { MailMessageProvider } from "./base.provider";

export class PhenixMailMessageProvider extends MailMessageProvider
{
    constructor()
    {
        super('Phenix', MessageProviderTypeEnum.EMAIL, freeMessageCost);
    }

    protected sendMessage(msg: string, receiver: string): Promise<boolean>
    {
        throw new NotImplementedException("This should send an email, using deployed mailserver as a provider, and an account like 'do-not-reply@phenix.joona.fr'.");
    }
}