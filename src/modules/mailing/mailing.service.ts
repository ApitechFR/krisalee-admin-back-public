import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { OrganizationService } from '../organization/organization.service';

@Injectable()
export class MailingService {

    constructor(private readonly mailerService: MailerService,
                private readonly organizationService: OrganizationService) {}

    async sendAuthenticationEmail(user: any, body: any): Promise<void> {
        try {
            await this.mailerService.sendMail({
                to: user.email,
                subject: 'Bienvenue sur Krisalee',
                template: 'connexion',
                context: {
                    username: user.name,
                    date: new Date().toLocaleString().split(' ')[0],
                    time: new Date().toLocaleString().split(' ')[1],
                    browser: body.browser,
                    email: process.env.ADMIN_APITECH_EMAIL
                },
            });
            console.log('Authentication email sent successfully.');
        } catch (error) {
            console.error('Error sending authentication email:', error);
        }
    }

    async servicesUpEmail(launchedServices: string[], nonLaunchedServices: string[], user: any, organizationName: string): Promise<void> {
        try {
            if(!user){
                return;
            }
            await this.mailerService.sendMail({
                to: [user.email, process.env.ADMIN_APITECH_EMAIL],
                subject: 'Démarrage des services terminé',
                template: 'services-up',
                context: {
                    username: user.name,
                    organization: organizationName,
                    launchedServices,
                    nonLaunchedServices
                },
            });
            console.log('Services up email sent successfully.');
        } catch (error) {
            console.error('Error sending services up email:', error);
        }
    }

    async servicesUpErrorEmail(user: any, organizationName: string, status: number): Promise<void> {
        try {
            let message = 'Une erreur interne du serveur a empêché le démarrage des services.';
            console.log(message);
            const mailOptions = {
                to: [user.email],
                subject: 'Erreur de démarrage des services',
                template: 'services-up-error',
                context: {
                    username: user.name,
                    organization: organizationName,
                    message,
                    email: process.env.ADMIN_APITECH_EMAIL
                }
            };

            // Send email to admin
            await this.mailerService.sendMail(mailOptions);

            // Send email to user
            if (status === 504) {
                mailOptions.context.message = 'Une erreur est survenue lors de la création des noeuds sur le serveur.';
            }
            mailOptions.to = [process.env.ADMIN_APITECH_EMAIL];
            await this.mailerService.sendMail(mailOptions);
            console.log('Services up error email sent successfully.');
        } catch (error) {
            console.error('Error sending services up error email:', error);
        }
    }

    async sendSSLRenewalEmail(orgsSucces: string[], orgsFailed: string[]) {
        try {
            // Send SSL renewal success email
            await this.mailerService.sendMail({
                to: [process.env.ADMIN_APITECH_EMAIL],
                subject: 'Renouvellement du certificat SSL',
                template: 'renewSSL',
                context: {
                    date: new Date().toLocaleString().split(' ')[0],
                    time: new Date().toLocaleString().split(' ')[1],
                    orgsFailed,
                    orgsSucces
                },
            });
            console.log('Renew SSL certification sent successfully.');
        } catch (error) {
            console.error('Error sending renew SSL email:', error);
        }
       
    }
}
