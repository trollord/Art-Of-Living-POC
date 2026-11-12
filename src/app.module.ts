import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { fileURLToPath } from 'node:url';
import { OrdersModule } from './orders/orders.module.js';
import { ProductsModule } from './products/products.module.js';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: fileURLToPath(new URL('../public', import.meta.url)),
      exclude: ['/api/{*path}'],
    }),
    ProductsModule,
    OrdersModule,
  ],
})
export class AppModule {}
