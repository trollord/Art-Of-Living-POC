import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { INDIAN_STATES_AND_UTS } from '../../common/indian-states.js';
import { QuoteRequestDto } from './quote.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class TeacherDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Teacher name is required' })
  @MaxLength(80)
  name: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '')
      : value,
  )
  @IsString()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'Mobile must be a valid 10-digit Indian number',
  })
  phone: string;

  @Transform(trim)
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  teacherCode?: string;
}

export class AddressDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Address line 1 is required' })
  @MaxLength(120)
  line1: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  line2?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  @MaxLength(60)
  city: string;

  @IsIn(INDIAN_STATES_AND_UTS, {
    message: 'State must be a valid Indian state or union territory',
  })
  state: string;

  @Transform(trim)
  @Matches(/^[1-9]\d{5}$/, { message: 'Pincode must be a valid 6-digit PIN' })
  pincode: string;
}

export class CreateOrderDto extends QuoteRequestDto {
  @ValidateNested()
  @Type(() => TeacherDto)
  @IsNotEmpty({ message: 'teacher details are required' })
  teacher: TeacherDto;

  @ValidateNested()
  @Type(() => AddressDto)
  @IsNotEmpty({ message: 'address is required' })
  address: AddressDto;
}
