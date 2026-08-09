export type AttendanceErrorCode = 'validation' | 'forbidden' | 'not_found' | 'conflict';

export class AttendanceError extends Error {
  readonly code: AttendanceErrorCode;

  constructor(code: AttendanceErrorCode, message: string) {
    super(message);
    this.name = 'AttendanceError';
    this.code = code;
  }
}

export function isAttendanceError(value: unknown): value is AttendanceError {
  return value instanceof AttendanceError;
}
