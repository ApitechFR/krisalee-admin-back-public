import { IsString, IsOptional, ValidateNested, IsBoolean  } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLogDto {
    @IsString()
    level: string;

    @IsString()
    message: string;

    @ValidateNested({ each: true })
    @Type(() => Meta)
    data: Meta;
}
class Meta {

    @IsString()
    organization_id: string;

    @IsOptional()
    @IsString()
    context?: string;

    @IsOptional()
    @IsString()
    connector_id?: string;

    @IsOptional()
    @IsString()
    service_id?: string;

    /**
     * a property set to true when log is to be shown only for admins
     */
    @IsOptional()
    @IsBoolean()
    admin?: true;
}