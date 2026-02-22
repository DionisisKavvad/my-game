export class StructuredLogger {
  static info(event: string, data?: Record<string, unknown>) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        event,
        ...data,
      }),
    );
  }

  static warn(event: string, data?: Record<string, unknown>) {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        event,
        ...data,
      }),
    );
  }

  static error(event: string, data?: Record<string, unknown>) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event,
        ...data,
      }),
    );
  }
}
