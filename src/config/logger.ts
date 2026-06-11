export const logger = {
  info: (message: string, meta?: unknown) => {
    if (meta === undefined) {
      console.log(message);
      return;
    }
    console.log(message, meta);
  },
  warn: (message: string, meta?: unknown) => {
    if (meta === undefined) {
      console.warn(message);
      return;
    }
    console.warn(message, meta);
  },
  error: (message: string, meta?: unknown) => {
    if (meta === undefined) {
      console.error(message);
      return;
    }
    console.error(message, meta);
  },
};
