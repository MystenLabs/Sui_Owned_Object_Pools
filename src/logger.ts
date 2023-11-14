import { Logger, pino } from 'pino';

export enum LoggingLevel {
  fatal = 'fatal',
  error = 'error',
  warn = 'warn',
  info = 'info',
  debug = 'debug',
  trace = 'trace',
  silent = 'silent', // use this to disable logging
}

const levels: { [key: number]: string } = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};
export function setupLogger(level: LoggingLevel = LoggingLevel.silent): Logger {
  const logger = pino(
    {
      base: null,
      level,
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      pool_id: (workerId: string) => workerId,
      formatters: {
        level(label, number) {
          return { level: levels[number] };
        },
        log(object) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { hostname, ...rest } = object;
          return rest;
        },
      },
      depthLimit: 10,
    },
    process.stdout,
  );
  return logger;
}
