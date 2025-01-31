/* istanbul ignore file */

if (process.env.NEW_RELIC_ENABLED !== 'false') {
  require('newrelic')
}

import { getApp } from './app'
import type { Config } from './infrastructure/config'
import { getConfig } from './infrastructure/config'
import {
  executeAndHandleGlobalErrors,
  resolveGlobalErrorLogObject,
} from './infrastructure/errors/globalErrorHandler'

async function start() {
  const config = executeAndHandleGlobalErrors<Config>(getConfig)
  const app = await getApp()

  try {
    await app.listen({
      host: config.app.bindAddress,
      port: config.app.port,
    })
  } catch (err) {
    app.log.error(resolveGlobalErrorLogObject(err))
    process.exit(1)
  }
}

void start()
