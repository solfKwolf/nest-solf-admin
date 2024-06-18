import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config';
import { MainModule } from './module/main/main.module';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { UserModule } from './module/system/user/user.module';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './common/guards/roles.guard';
import { AxiosModule } from './module/axios/axios.module';
import { MenuModule } from './module/system/menu/menu.module';
import { RoleModule } from './module/system/role/role.module';
import { DeptModule } from './module/system/dept/dept.module';
import { LoginlogModule } from './module/monitor/loginlog/loginlog.module';
import { RedisClientOptions } from '@liaoliaots/nestjs-redis';
import { RedisModule } from './module/redis/redis.module';
import { AuthModule } from './module/system/auth/auth.module';
import { HttpModule } from '@nestjs/axios';

@Global()
@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      cache: true,
      load: [configuration],
      isGlobal: true,
    }),
    // 数据库
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          type: 'mysql',
          entities: [`${__dirname}/**/*.entity{.ts,.js}`],
          autoLoadEntities: true,
          keepConnectionAlive: true,
          timezone: '+08:00',
          ...config.get('db.mysql'),
        } as TypeOrmModuleOptions;
      },
    }),
    // redis
    RedisModule.forRootAsync(
      {
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          return {
            closeClient: true,
            readyLog: true,
            errorLog: true,
            config: config.get<RedisClientOptions>('redis'),
          };
        },
      },
      true,
    ),
    // 模块
    HttpModule,
    AuthModule,
    UserModule,
    MainModule,
    AxiosModule,
    RoleModule,
    DeptModule,
    MenuModule,
    LoginlogModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
