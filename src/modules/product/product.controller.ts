import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVersionDto } from './dto/update-version.dto';
import { CreateVersionDto } from './dto/create-version.dto';
import { AddOrganizationToVersionDto } from './dto/add-organization-to-version.dto';
import { Roles } from 'nest-keycloak-connect';

@Roles({ roles: ['realm:admin'] })
@UseInterceptors(ClassSerializerInterceptor)
@Controller(':organization_id')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post('service/:service_id/product')
  async create(
    @Param('organization_id') organization_id: string,
    @Param('service_id') service_id: string,
    @Body() createProductDto: CreateProductDto,
  ) {
    return await this.productService.create(
      organization_id,
      service_id,
      createProductDto,
    );
  }

  @Get('product')
  async findAll(@Param('organization_id') organization_id: string) {
    return await this.productService.getAll(organization_id);
  }

  @Patch('service/:service_id/product/:product_id')
  async update(
    @Param('organization_id') organization_id: string,
    @Param('service_id') service_id: string,
    @Param('product_id') product_id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return await this.productService.update(
      organization_id,
      service_id,
      product_id,
      updateProductDto,
    );
  }

  @Delete('service/:service_id/product/:product_id')
  async delete(
    @Param('organization_id') organization_id: string,
    @Param('service_id') service_id: string,
    @Param('product_id') product_id: string,
  ) {
    return await this.productService.delete(
      organization_id,
      service_id,
      product_id,
    );
  }

  @Post('service/:service_id/product/:product_id/version')
  async addVersion(
    @Param('organization_id') organization_id: string,
    @Param('service_id') service_id: string,
    @Param('product_id') product_id: string,
    @Body() createVersionDto: CreateVersionDto,
  ) {
    return await this.productService.addVersion(
      organization_id,
      service_id,
      product_id,
      createVersionDto,
    );
  }

  @Delete('service/:service_id/product/:product_id/version/:version_id')
  async removeVersion(
    @Param('organization_id') organization_id: string,
    @Param('service_id') service_id: string,
    @Param('product_id') product_id: string,
    @Param('version_id') version_id: string,
  ) {
    return await this.productService.removeVersion(
      organization_id,
      service_id,
      product_id,
      version_id,
    );
  }

  @Patch('service/:service_id/product/:product_id/version/:version_id')
  async updateVersion(
    @Param('organization_id') organization_id: string,
    @Param('service_id') service_id: string,
    @Param('product_id') product_id: string,
    @Param('version_id') version_id: string,
    @Body() updateVersionDto: UpdateVersionDto,
  ) {
    return await this.productService.updateVersion(
      organization_id,
      service_id,
      product_id,
      version_id,
      updateVersionDto,
    );
  }

  @Post(
    'service/:service_id/product/:product_id/version/:version_id/organization',
  )
  async addOrgToVersion(
    @Param('organization_id') organization_id: string,
    @Param('service_id') service_id: string,
    @Param('product_id') product_id: string,
    @Param('version_id') version_id: string,
    @Body() addOrganizationToVersionDto: AddOrganizationToVersionDto,
  ) {
    return await this.productService.addOrgToVersion(
      organization_id,
      service_id,
      product_id,
      version_id,
      addOrganizationToVersionDto.org_id,
      addOrganizationToVersionDto.depends_on,
    );
  }

  @Delete(
    'service/:service_id/product/:product_id/version/:version_id/organization/:org_id',
  )
  async removeOrgFromVersion(
    @Param('organization_id') organization_id: string,
    @Param('service_id') service_id: string,
    @Param('product_id') product_id: string,
    @Param('version_id') version_id: string,
    @Param('org_id') org_id: string,
  ) {
    return await this.productService.removeOrgFromVersion(
      organization_id,
      service_id,
      product_id,
      version_id,
      org_id,
    );
  }
}
