/** Tiny leveled logger. Swap for pino later if structured logs are needed. */
const ts = () => new Date().toISOString();

export const log = {
  info: (...a: unknown[]) => console.log(`[${ts()}] [info]`, ...a),
  warn: (...a: unknown[]) => console.warn(`[${ts()}] [warn]`, ...a),
  error: (...a: unknown[]) => console.error(`[${ts()}] [error]`, ...a),
  debug: (...a: unknown[]) => {
    if (process.env.DEBUG) console.debug(`[${ts()}] [debug]`, ...a);
  },
};
