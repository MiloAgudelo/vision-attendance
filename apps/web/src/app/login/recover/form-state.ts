export interface RecoverState {
  status: 'idle' | 'error' | 'success';
  message?: string;
  fieldErrors: {
    email?: string[];
  };
}

export const RECOVER_IDLE: RecoverState = {
  status: 'idle',
  fieldErrors: {},
};
