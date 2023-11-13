import pino from 'pino';

/**
 * Attach a logger to the process.
 * @param level - The minimum level to log: will not log
 * messages with a lower level.
 */

export enum LoggingLevel {
  fatal = 'fatal',
  error = 'error',
  warn = 'warn',
  info = 'info',
  debug = 'debug',
  trace = 'trace',
  silent = 'silent',
}
export function setupLogger(level: LoggingLevel = LoggingLevel.silent) {
  const logger = pino(
    {
      level,
      depthLimit: 10,
    },
    process.stdout,
  );
  return logger;
}
