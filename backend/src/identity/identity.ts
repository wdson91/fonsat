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
export const Public = () => SetMetadata("public", true);
export const Roles = (...roles: Role[]) => SetMetadata("roles", roles);
export const Actor = createParamDecorator(
  (_value: unknown, context: ExecutionContext): CurrentUser =>
    context.switchToHttp().getRequest().actor,
);
