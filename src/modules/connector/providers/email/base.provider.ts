import { NotImplementedException } from "@nestjs/common";
import { MessageContentData } from "../message.dto";
import { MessageProvider } from "../message.provider";

/**
 * Base provider to send emails
 */
export abstract class MailMessageProvider extends MessageProvider
{
    protected checkDestination(dst: string): Promise<string>
    {
        throw new NotImplementedException('This should validate that the input is a valid email address, and return this email address.');
    }

    protected buildMessage(data: MessageContentData): Promise<string>
    {
        throw new NotImplementedException('This should return an HTML formatted email including the link URL to activate the user account.');
    }
}