import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";

export type Role = "worker" | "foreman" | "admin" | "client";

export interface CurrentUser {
  id: number;
  name: string;
  role: Role;
  company_id: number;
  company_name: string;
  brand_color: string;
  time_zone: string;
}

export interface DemoUser {
  id: number;
  name: string;
  role: Role;
  company_id: number;
  company_name: string;
}

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const Actor = createParamDecorator(
  (_value: unknown, context: ExecutionContext): CurrentUser =>
    context.switchToHttp().getRequest<{ actor: CurrentUser }>().actor,
);
