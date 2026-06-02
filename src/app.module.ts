import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { GracefulShutdownModule } from 'nestjs-graceful-shutdown';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';

import configuration from './config/configuration';
import { configValidationSchema } from './config/config.validation';
import { HealthModule } from './health/health.module';
import { DocumentIntelligenceModule } from './document-intelligence/document-intelligence.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: configValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttl') ?? 60_000,
            limit: config.get<number>('throttle.limit') ?? 60,
          },
        ],
      }),
    }),
    GracefulShutdownModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        gracefulShutdownTimeout:
          config.get<number>('shutdown.timeoutMs') ?? 15_000,
      }),
    }),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (request) =>
          request.headers['x-request-id']?.toString() ?? randomUUID(),
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        serializers: {
          req: (req: IncomingMessage) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
        },
        ...(process.env.NODE_ENV !== 'production' && {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              levelFirst: true,
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname,req,res,responseTime',
              messageFormat: '{context} — {msg}',
              singleLine: false,
            },
          },
        }),
      },
    }),
    HealthModule,
    DocumentIntelligenceModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
