import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { PayOrderDto } from './dto/pay-order.dto.js';
import { QuoteRequestDto } from './dto/quote.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('quote')
  @HttpCode(200)
  quote(@Body() dto: QuoteRequestDto) {
    return this.ordersService.quote(dto.items);
  }

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Post(':id/pay')
  @HttpCode(200)
  pay(@Param('id') id: string, @Body() dto: PayOrderDto) {
    return this.ordersService.pay(id, dto.method);
  }
}
