import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true, // 开启跨域访问
  });

  const config = app.get(ConfigService);

  // 设置 api 访问前缀
  const prefix = config.get<string>('app.prefix');
  app.setGlobalPrefix(prefix);
  // 全局验证
  app.useGlobalPipes(
    new ValidationPipe({
      // 自动将有效负载转换为根据其 DTO 类类型化的对象
      transform: true,
      // 如果设置为 true，验证器将删除已验证（返回）对象的任何不使用任何验证装饰器的属性
      whitelist: true,
    }),
  );
  // swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('nest-solf-admin')
    .setDescription('nest-solf-admin API description')
    .setVersion('1.0')
    .addTag('cats')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${prefix}/swagger-ui`, app, document);
  //服务端口
  const port = config.get<number>('app.port') || 8080;
  await app.listen(port);
  console.log(
    `Nest-Admin 服务启动成功 `,
    '\n',
    '\n',
    '服务地址',
    `http://localhost:${port}${prefix}/`,
    '\n',
    'swagger 文档地址        ',
    `http://localhost:${port}${prefix}/swagger-ui/`,
  );
}
bootstrap();
