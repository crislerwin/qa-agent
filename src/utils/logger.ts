import adze from "adze";

/**
 * Create a new logger instance with a specific namespace.
 * @param namespace The namespace for the logger (e.g., 'server', 'file-processor')
 */
export const createLogger = (namespace: string) => {
  return adze.namespace(namespace).seal();
};

// Default logger for general use
export const logger = adze.seal();
