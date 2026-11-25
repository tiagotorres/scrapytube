import { Hono } from 'hono';

import { createUserSchema, resetPasswordSchema, updateUserSchema } from '#shared/schemas.ts';

import type { AppContext, AppEnv } from '../http.ts';
import { idParam, readBody, sessionId, userId } from '../http.ts';
import { createUser, listUsers, removeUser, setPassword, updateUser } from '../store/users.ts';

export function userRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>();

  app.get('/', c => c.json(listUsers(db)));

  app.post('/', async c => {
    const input = await readBody(c, createUserSchema);
    return c.json(await createUser(db, input), 201);
  });

  app.patch('/:id', async c => {
    const input = await readBody(c, updateUserSchema);
    return c.json(updateUser(db, idParam(c), input));
  });

  app.post('/:id/password', async c => {
    const { password } = await readBody(c, resetPasswordSchema);
    const id = idParam(c);
    await setPassword(db, id, password, id === userId(c) ? sessionId(c) : undefined);
    return c.body(null, 204);
  });

  app.delete('/:id', c => {
    removeUser(db, userId(c), idParam(c));
    return c.body(null, 204);
  });

  return app;
}
