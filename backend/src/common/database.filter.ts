import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
@Catch(Prisma.PrismaClientKnownRequestError)
export class DatabaseFilter implements ExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const conflict = ['P2002', 'P2034'].includes(error.code);
    const status = conflict ? 409 : error.code === 'P2025' ? 404 : error.code === 'P2003' ? 400 : 500;
    host.switchToHttp().getResponse().status(status).json({ statusCode: status, message: conflict ? 'Os dados mudaram ou já existem. Atualize o ecrã antes de repetir.' : status === 404 ? 'Registo não encontrado.' : status === 400 ? 'Referência inválida.' : 'Não foi possível guardar os dados.' });
  }
}
