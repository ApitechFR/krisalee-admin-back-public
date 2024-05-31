import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AddDateNow,
  ThrowDuplicateAttributeError,
  toTimeStamp,
} from 'src/helpers/mainHelper';
import { MongoRepository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';
import { UpdateProductDto } from './dto/update-product.dto';
import { GetCurrentDate } from 'src/helpers/getCurrentDate';
import { UpdateVersionDto } from './dto/update-version.dto';
import { SnapshotStatus } from 'src/enums/snapshotStatus';
import { OrganizationService } from '../organization/organization.service';
import { Version } from './entities/Version';
import { ServiceStatus } from 'src/enums/serviceStatus';
import { CreateVersionDto } from './dto/create-version.dto';
import { OrganizationVersion } from './entities/OrganizationVersion';

@Injectable()
export class ProductService {
  private organization_id: string;

  constructor(
    @InjectRepository(Product)
    private productRepository: MongoRepository<Product>,
    private readonly organizationService: OrganizationService,
  ) {}

  private async isOrganizationRoot() {
    const organization = await this.organizationService.findOne(
      this.organization_id,
    );
    if (!organization.is_root) {
      throw new ForbiddenException(
        'Only root organization can create/get/update/delete products',
      );
    }
  }

  async create(
    organization_id: string,
    service_id: string,
    createProductDto: CreateProductDto,
  ) {
    if (createProductDto.name.includes('_')) {
      throw new BadRequestException("Product name can't contain underscores");
    }

    try {
      const timestamp = Date.now();
      const product = new Product();
      for (const key in createProductDto) {
        product[key] = createProductDto[key];
      }

      product.service_id = service_id;
      product.product_id = createProductDto['name'].toLowerCase();
      product.create_date = GetCurrentDate(timestamp);
      product.update_date = null;
      product.organizations_versions = [];
      product.versions = [];

      return await this.productRepository.save(product);
    } catch (error) {
      console.log(error);
      if (error.code == 11000) {
        throw new ConflictException('Product name already exist');
      } else {
        throw new InternalServerErrorException(error.message);
      }
    }
  }

  async findAll(service_id?: string) {
    if (service_id) {
      return await this.productRepository.find({ where: { service_id } });
    } else {
      return await this.productRepository.find();
    }
  }

  async getAll(organization_id: string) {
    return await this.productRepository.find();
  }

  private async findOne(service_id: string, product_id: string) {
    try {
      const product = await this.productRepository.findOneOrFail({
        where: {
          service_id,
          product_id,
        },
      });
      return product;
    } catch (error) {
      console.log(error);
      throw new NotFoundException('Product not found');
    }
  }

  async update(
    organizatio_id: string,
    service_id: string,
    product_id: string,
    updateProductDto: UpdateProductDto,
  ) {
    this.organization_id = organizatio_id;
    await this.isOrganizationRoot();

    if (updateProductDto.name.includes('_')) {
      throw new BadRequestException("Product name can't contain underscores");
    }

    try {
      const timestamp = Date.now();
      const product = await this.findOne(service_id, product_id);
      for (const key in updateProductDto) {
        product[key] = updateProductDto[key];
      }

      product.update_date = GetCurrentDate(timestamp);

      return await this.productRepository.save(product);
    } catch (error) {
      console.log(error);
      if (error.code == 11000) {
        throw new ConflictException('Product name already exist');
      } else if (error.status == 404) {
        throw new NotFoundException('Product Not Found');
      } else {
        throw new InternalServerErrorException(error.message);
      }
    }
  }

  async delete(
    organization_id: string,
    service_id: string,
    product_id: string,
  ) {
    try {
      await this.productRepository.delete({ service_id, product_id });
    } catch (error) {}
  }

  async addVersion(
    organization_id: string,
    service_id: string,
    product_id: string,
    createVersionDto: CreateVersionDto,
  ) {
    if (createVersionDto.name.includes('_')) {
      throw new BadRequestException("Version name can't contain underscores");
    }

    const product = await this.findOne(service_id, product_id);

    const version_id = `${service_id}_${product_id}_${createVersionDto.name}`;

    //check if the version id already exist
    for (const v of product.versions) {
      if (v.version_id == version_id) {
        throw new ConflictException(
          'Collision dans les versions id (pensez à changer le nom)',
        );
      }
    }

    product.versions.push({
      name: createVersionDto.name,
      description: createVersionDto.description,
      version_id,
      node_pool: createVersionDto.node_pool,
    });

    return await this.productRepository.save(product);
  }

  async removeVersion(
    organization_id: string,
    service_id: string,
    product_id: string,
    version_id: string,
  ) {
    const product = await this.findOne(service_id, product_id);
    const newVersions = product.versions.filter(
      (version) => version.version_id !== version_id,
    );

    product.versions = newVersions;

    return await this.productRepository.save(product);
  }

  async updateVersion(
    organization_id: string,
    service_id: string,
    product_id: string,
    version_id: string,
    updateVersionDto: UpdateVersionDto,
  ) {
    this.organization_id = organization_id;
    await this.isOrganizationRoot();

    if (updateVersionDto.name.includes('_')) {
      throw new BadRequestException("Version name can't contain underscores");
    }

    const product = await this.findOne(service_id, product_id);

    const version = product.versions.find((v) => v.version_id == version_id);

    if (!version) {
      throw new NotFoundException("Can't find a version with the given id");
    }

    // check if there is another version with the same name
    for (const v of product.versions) {
      if (v.version_id !== version_id && v.name == updateVersionDto.name) {
        throw new ConflictException('This version name already exist');
      }
    }

    for (const key in updateVersionDto) {
      version[key] = updateVersionDto[key];
    }

    const newVersions = product.versions.filter(
      (version) => version.version_id !== version_id,
    );

    product.versions = newVersions;
    product.versions.push(version);

    return await this.productRepository.save(product);
  }

  async updateStatus(
    organization_id: string,
    service_id: string,
    status: number,
  ) {
    const product = await this.getOrgProduct(organization_id, service_id);

    const orgVersionIndex = product.organizations_versions.findIndex(
      (org_v) => org_v.organization_id === organization_id,
    );

    product.organizations_versions[orgVersionIndex].status = status;
    if (status === ServiceStatus.ACTIVE) {
      const timestamp = Date.now();
      product.organizations_versions[orgVersionIndex].last_run_datetime =
        GetCurrentDate(timestamp);
    }

    await this.productRepository.save(product);
  }

  /**
   * A method to set is_creating and is_deleting to false
   */
  async initiateCreatindDeleting() {
    try {
      const products = await this.findAll();

      for (const product of products) {
        const newOrgVersions = [];
        for (const orgVersion of product.organizations_versions) {
          orgVersion.is_creating = false;
          orgVersion.is_deleting = false;
          newOrgVersions.push(orgVersion);
        }
        product.organizations_versions = newOrgVersions;

        await this.productRepository.save(product);
      }
    } catch (error) {
      console.log(error);
    }
  }

  async updateIsCreating(
    organization_id: string,
    service_id: string,
    is_creating: boolean,
  ) {
    const product = await this.getOrgProduct(organization_id, service_id);

    const orgVersionIndex = product.organizations_versions.findIndex(
      (org_v) => org_v.organization_id === organization_id,
    );

    product.organizations_versions[orgVersionIndex].is_creating = is_creating;

    await this.productRepository.save(product);
  }

  async updateIsDeleting(
    organization_id: string,
    service_id: string,
    is_deleting: boolean,
  ) {
    const product = await this.getOrgProduct(organization_id, service_id);

    const orgVersionIndex = product.organizations_versions.findIndex(
      (org_v) => org_v.organization_id === organization_id,
    );

    product.organizations_versions[orgVersionIndex].is_deleting = is_deleting;

    await this.productRepository.save(product);
  }

  async updateProgress(
    organization_id: string,
    serviceIds: string[],
    prgress: number,
  ) {
    const products: Product[] = [];
    for (const serviceId of serviceIds) {
      const product = await this.getOrgProduct(organization_id, serviceId);

      const orgVersionIndex = product.organizations_versions.findIndex(
        (org_v) => org_v.organization_id === organization_id,
      );

      product.organizations_versions[orgVersionIndex].progress = prgress;
      products.push(product);
    }
    await this.productRepository.save(products);
  }

  async getOrgProduct(
    organization_id: string,
    service_id: string,
    isOrgRoot?: boolean,
  ) {
    const products = await this.findAll(service_id);

    if (isOrgRoot) {
      return products[0];
    }

    for (const product of products) {
      for (const org_v of product.organizations_versions) {
        if (org_v.organization_id === organization_id) {
          return product;
        }
      }
    }
  }

  async addOrgToVersion(
    organization_id: string,
    service_id: string,
    product_id: string,
    version_id: string,
    org_id: string,
    depends_on: string[],
  ) {
    const product = await this.findOne(service_id, product_id);

    const version = product.versions.find((v) => v.version_id === version_id);
    if (!version) {
      throw new NotFoundException('Version not found');
    }

    //check if the service is on status 0 and not creating or deleting
    const oldOrgVersion = product.organizations_versions.find(
      (org_v) => org_v.organization_id === org_id,
    );

    if (oldOrgVersion) {
      //check if the organization is already assigned to the specified version
      if (oldOrgVersion.version_id === version_id) {
        return product;
      }

      if (
        oldOrgVersion.status == ServiceStatus.ACTIVE ||
        oldOrgVersion.is_creating == true ||
        oldOrgVersion.is_deleting == true
      ) {
        throw new ForbiddenException(
          'Service is on use now (running or is_creating/is_deleting) try later',
        );
      }
    }

    try {
      const org_v = new OrganizationVersion();
      org_v.organization_id = org_id;
      org_v.version_id = version_id;
      org_v.status = 0;
      org_v.depends_on = depends_on;
      org_v.is_creating = false;
      org_v.is_deleting = false;
      org_v.last_run_datetime = null;

      //remove the organization from the old version
      const newOrgVersions = product.organizations_versions.filter(
        (org_v) => org_v.organization_id !== org_id,
      );
      //add the organization to the new version
      newOrgVersions.push(org_v);

      product.organizations_versions = newOrgVersions;
      return await this.productRepository.save(product);
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(error.message);
    }
  }

  async removeOrgFromVersion(
    organization_id: string,
    service_id: string,
    product_id: string,
    version_id: string,
    org_id: string,
  ) {
    const product = await this.findOne(service_id, product_id);

    const version = product.versions.find((v) => v.version_id === version_id);
    if (!version) {
      throw new NotFoundException('Version not found');
    }

    //check if the service is on status 0 and not creating or deleting
    const oldOrgVersion = product.organizations_versions.find(
      (org_v) => org_v.organization_id === org_id,
    );
    if (oldOrgVersion) {
      if (
        oldOrgVersion.status == ServiceStatus.ACTIVE ||
        oldOrgVersion.is_creating == true ||
        oldOrgVersion.is_deleting == true
      ) {
        throw new ForbiddenException(
          'Service is on use now (running or is_creating/is_deleting) try later',
        );
      }
    }

    try {
      //remove the organization from the old version
      const newOrgVersions = product.organizations_versions.filter(
        (org_v) => org_v.organization_id !== org_id,
      );
      product.organizations_versions = newOrgVersions;

      return await this.productRepository.save(product);
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Server Error');
    }
  }
}
