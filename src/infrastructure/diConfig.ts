import type { JWT } from '@fastify/jwt'
import type { NewRelicTransactionManager } from '@lokalise/fastify-extras'
import { reportErrorToBugsnag } from '@lokalise/fastify-extras'
import { PrismaClient } from '@prisma/client'
import type { AwilixContainer, Resolver } from 'awilix'
import { asClass, asFunction, Lifetime } from 'awilix'
import type { FastifyInstance, FastifyLoggerInstance } from 'fastify'
import Redis from 'ioredis'
import type P from 'pino'
import { pino } from 'pino'

import { DeleteOldUsersJob } from '../modules/users/jobs/DeleteOldUsersJob'
import { ProcessLogFilesJob } from '../modules/users/jobs/ProcessLogFilesJob'
import { SendEmailsJob } from '../modules/users/jobs/SendEmailsJob'
import { ConfigStore } from '../modules/users/repositories/ConfigStore'
import { UrlCache } from '../modules/users/repositories/UrlCache'
import { UserCache } from '../modules/users/repositories/UserCache'
import { UserRepository } from '../modules/users/repositories/UserRepository'
import { UserService } from '../modules/users/services/UserService'

import type { Config } from './config'
import { getConfig } from './config'
import type { ErrorReporter } from './errors/errorReporter'

export type ExternalDependencies = {
  app?: FastifyInstance
  logger?: P.Logger
}
export const SINGLETON_CONFIG = { lifetime: Lifetime.SINGLETON }

export type DependencyOverrides = Partial<DiConfig>

export function registerDependencies(
  diContainer: AwilixContainer,
  dependencies: ExternalDependencies = {},
  dependencyOverrides: DependencyOverrides = {},
): void {
  const diConfig: DiConfig = {
    jwt: asFunction(() => {
      return dependencies.app?.jwt
    }, SINGLETON_CONFIG),
    logger: asFunction(() => dependencies.logger ?? pino(), SINGLETON_CONFIG),

    redis: asFunction(
      ({ config }: Dependencies) => {
        const redisConfig = config.redis

        return new Redis({
          host: redisConfig.host,
          db: redisConfig.db,
          port: redisConfig.port,
          username: redisConfig.username,
          password: redisConfig.password,
          tls: redisConfig.useTls ? {} : undefined,
        })
      },
      {
        dispose: (redis) => {
          return new Promise((resolve, reject) => {
            void redis.quit((err, result) => {
              if (err) {
                return reject(err)
              }
              return resolve(result)
            })
          })
        },
        lifetime: Lifetime.SINGLETON,
      },
    ),

    prisma: asFunction(
      ({ config }: Dependencies) => {
        return new PrismaClient({
          datasources: {
            db: {
              url: config.db.databaseUrl,
            },
          },
        })
      },
      {
        dispose: (prisma) => {
          return prisma.$disconnect()
        },
        lifetime: Lifetime.SINGLETON,
      },
    ),

    config: asFunction(() => {
      return getConfig()
    }, SINGLETON_CONFIG),

    userRepository: asClass(UserRepository, SINGLETON_CONFIG),
    userService: asClass(UserService, SINGLETON_CONFIG),
    userCache: asClass(UserCache, SINGLETON_CONFIG),
    urlCache: asClass(UrlCache, SINGLETON_CONFIG),
    configStore: asClass(ConfigStore, SINGLETON_CONFIG),

    processLogFilesJob: asClass(ProcessLogFilesJob, SINGLETON_CONFIG),
    deleteOldUsersJob: asClass(DeleteOldUsersJob, SINGLETON_CONFIG),
    sendEmailsJob: asClass(SendEmailsJob, SINGLETON_CONFIG),

    // vendor-specific dependencies
    newRelicBackgroundTransactionManager: asFunction(() => {
      return dependencies.app?.newrelicTransactionManager
    }, SINGLETON_CONFIG),
    errorReporter: asFunction(() => {
      return {
        report: (report) => reportErrorToBugsnag(report),
      } satisfies ErrorReporter
    }),
  }
  diContainer.register(diConfig)

  for (const [dependencyKey, dependencyValue] of Object.entries(dependencyOverrides)) {
    diContainer.register(dependencyKey, dependencyValue)
  }
}

type DiConfig = Record<keyof Dependencies, Resolver<unknown>>

export interface Dependencies {
  jwt: JWT
  config: Config
  logger: FastifyLoggerInstance & P.Logger

  redis: Redis
  prisma: PrismaClient

  deleteOldUsersJob: DeleteOldUsersJob
  processLogFilesJob: ProcessLogFilesJob
  sendEmailsJob: SendEmailsJob

  userRepository: UserRepository
  userService: UserService
  userCache: UserCache
  urlCache: UrlCache
  configStore: ConfigStore

  // vendor-specific dependencies
  newRelicBackgroundTransactionManager: NewRelicTransactionManager

  errorReporter: ErrorReporter
}

declare module '@fastify/awilix' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Cradle extends Dependencies {}

  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface RequestCradle extends Dependencies {}
}
