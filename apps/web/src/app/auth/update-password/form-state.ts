export interface UpdatePasswordState {
  status: 'idle' | 'error';
  message?: string;
  fieldErrors: {
    password?: string[];
    confirm?: string[];
  };
}

export const UPDATE_PASSWORD_IDLE: UpdatePasswordState = {
  status: 'idle',
  fieldErrors: {},
};
