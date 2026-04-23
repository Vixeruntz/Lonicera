export interface LogFields {
  [key: string]: unknown;
}

export interface StructuredLogger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

function emit(level: 'INFO' | 'WARN' | 'ERROR', event: string, fields?: LogFields) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };

  const line = JSON.stringify(payload);
  if (level === 'ERROR') {
    console.error(line);
    return;
  }
  if (level === 'WARN') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function createLogger(): StructuredLogger {
  return {
    info(event, fields) {
      emit('INFO', event, fields);
    },
    warn(event, fields) {
      emit('WARN', event, fields);
    },
    error(event, fields) {
      emit('ERROR', event, fields);
    },
  };
}
