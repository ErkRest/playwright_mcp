export const logger = {
  info: (message: string, payload?: unknown) => {
    console.log(`[INFO] ${message}`, payload ?? "");
  },
  error: (message: string, payload?: unknown) => {
    console.error(`[ERROR] ${message}`, payload ?? "");
  }
};
