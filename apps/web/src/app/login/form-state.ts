export interface LoginState {
  status: 'idle' | 'error';
  message?: string;
  fieldErrors: {
    email?: string[];
    password?: string[];
  };
}

export const LOGIN_IDLE: LoginState = {
  status: 'idle',
  fieldErrors: {},
};
