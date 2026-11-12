import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @IsString()
  @IsNotEmpty({ message: 'productId is required' })
  productId: string;

  @Type(() => Number)
  @IsInt({ message: 'quantity must be a whole number' })
  @Min(0, { message: 'quantity cannot be negative' })
  @Max(100000, { message: 'quantity is too large' })
  quantity: number;
}

export class QuoteRequestDto {
  @IsArray({ message: 'items must be a list' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
