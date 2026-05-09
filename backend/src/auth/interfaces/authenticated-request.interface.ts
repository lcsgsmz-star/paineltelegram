import { Request } from 'express';

export interface LoginUser {
  id: number;
  username: string;
  role: string;
  email: string;
  permissions?: string;
}

export interface JwtUser {
  userId: number;
  username: string;
  role: string;
  permissions?: string;
}

export interface LocalAuthRequest extends Request {
  user: LoginUser;
}

export interface AuthenticatedRequest extends Request {
  user: JwtUser;
}
