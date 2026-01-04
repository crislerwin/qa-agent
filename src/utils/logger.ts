import adze from "adze";

let isVerbose = false;

export const setVerbose = (verbose: boolean) => {
  isVerbose = verbose;
};

/**
 * Create a new logger instance with a specific namespace.
 * @param namespace The namespace for the logger (e.g., 'server', 'file-processor')
 */
export const createLogger = (namespace: string) => {
  const base = adze.namespace(namespace).seal();

  return {
    log: (...args: any[]) => {
      if (isVerbose) base.log(...(args as [any, ...any[]]));
    },
    info: (...args: any[]) => {
      if (isVerbose) base.info(...(args as [any, ...any[]]));
    },
    warn: (...args: any[]) => base.warn(...(args as [any, ...any[]])),
    error: (...args: any[]) => base.error(...(args as [any, ...any[]])),
    // Pass-through for other potential methods if needed, or expand as required
    success: (...args: any[]) => base.success(...(args as [any, ...any[]])),
  };
};

export const logger = createLogger("global");
