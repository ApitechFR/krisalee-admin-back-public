import { Controller, Get, Param, Post } from '@nestjs/common';
import { KeycloakService } from './keycloak.service';

@Controller(':organization_id/user')
export class KeycloakController {
  constructor(private readonly keycloakService: KeycloakService) {}

  @Get()
  async getUsers(@Param('organization_id') organization_id: string) {
    return await this.keycloakService.getUsers(organization_id);
  }

  @Post(':id/alert')
  async alertUser(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
  ) {
    return await this.keycloakService.alertUser(organization_id, id);
  }
}
