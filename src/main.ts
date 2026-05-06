import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from './config/config.type';
import { I18nValidationExceptionFilter, I18nValidationPipe } from 'nestjs-i18n';
import { ClassSerializerInterceptor, VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });
  const configService = app.get(ConfigService<AllConfigType>);
  app.useGlobalPipes(new I18nValidationPipe({
    stopAtFirstError: true,
    transform: true
  }));
  app.useGlobalFilters(
    new I18nValidationExceptionFilter({
      errorFormatter(errors) {
        return Object.values(errors.at(0).constraints).at(0) as unknown as object
      },
    }),
  );

  //config cookie
  app.use(cookieParser())

  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector))
  )
  const isDevMode = configService.get('app.nodeEnv', { infer: true }) !== 'production';
  const corsOrigins: string[] = [configService.get('app.frontendDomain', { infer: true })];
  if (isDevMode) {
    corsOrigins.push('http://localhost:3000');
  }
  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
  });

  // Swagger API Documentation (non-production only)
  if (isDevMode) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('TMix Education API')
      .setDescription('API documentation for TMix Education Center — Backend services including Auth, Users, Classes, Tests, Chatbot, TTS, and more.')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization', in: 'header' },
        'access-token',
      )
      .addCookieAuth('refresh_token')
      .addServer('http://localhost:8080', 'Local Development')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
      customSiteTitle: 'TMix Education — API Docs',
    });
  }

  //config versioning
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'api/v',
    defaultVersion: ['1']
  })
  await app.listen(configService.get('app.port', { infer: true }), '0.0.0.0');
}
bootstrap();