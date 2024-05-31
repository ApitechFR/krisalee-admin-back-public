import { Type } from "class-transformer";
import { IsArray, IsNotEmpty, IsString, ValidateNested, IsOptional } from "class-validator";

export class ProductUpDTO {
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    product_id: string;

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    version: string;
    
  }