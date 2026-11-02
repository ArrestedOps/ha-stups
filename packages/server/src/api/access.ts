import { type Account } from '../accounts.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { sessionToken } from '../session-auth.js';
import { type FastifyInstance, type FastifyRequest } from 'fastify';
import { type ApiKit, type Params } from './kit.js';
import { t } from '../i18n/index.js';

/** Anmeldung, Personen, Zugriff und Konten */
export function registerAccessRoutes(app: FastifyInstance, k: ApiKit): void {
  const { deps, store, body, requireAdmin, noContent } = k;

  // ----- identity -----
  app.get('/api/me', async (req) => {
    const allowed = req.access?.allowed ?? false;
    return {
      user: req.user,
      people: allowed ? store.people() : [],
      isAdmin: req.access?.isAdmin ?? false,
      allowed,
      accessMode: store.getAccessMode(),
    };
  });
  // Sprache der Person: die Wahl und die Sprache, die ihr Gerät zeigt (für Push, wenn kein Browser dabei ist)
  app.put('/api/me/language', async (req, reply) => {
    const b = body(req);
    const choices = ['auto', 'de', 'en'];
    if (!choices.includes(b.choice) || !['de', 'en'].includes(b.effective)) throw new ValidationError(t('Die Sprache muss „de" oder „en" sein'));
    if (!req.user) throw new ForbiddenError();
    store.setLanguage(req.user.id, { choice: b.choice, effective: b.effective });
    return noContent(reply);
  });
  app.get('/api/people', async () => store.people());
  // ----- Personen & Zugriff -----
  app.get('/api/access', async (req) => {
    const isAdmin = req.access?.isAdmin ?? false;
    const [haPersons, notifyServices] = await Promise.all([
      isAdmin ? deps.directory?.persons().catch(() => null) : null,
      deps.ha?.listNotifyServices?.().catch(() => null),
    ]);
    const people = store.people();
    // Das ntfy-Thema schützt die Nachrichten: nur die Person selbst und Administratoren sehen es
    const withRole = await Promise.all(
      people.map(async (p) => ({
        ...p,
        isAdmin: p.haUserId ? ((await deps.directory?.isAdmin(p.haUserId)) ?? false) : false,
        ...(deps.ntfy && (isAdmin || req.user?.id === p.id) ? { ntfyTopic: store.ntfyTopic(p.id) } : {}),
      })),
    );
    // Wer als Administrator ohnehin hinein darf, wartet auf nichts
    const pending = isAdmin
      ? (
          await Promise.all(
            store.pendingUsers().map(async (u) => ((u.haUserId ? await deps.directory?.isAdmin(u.haUserId) : false) ? null : u)),
          )
        ).filter((u): u is NonNullable<typeof u> => u !== null)
      : [];
    const added = new Set(people.map((p) => p.haUserId).filter((id): id is string => !!id));
    const addedNames = new Set(people.map((p) => p.name.toLowerCase()));
    return {
      mode: store.getAccessMode(),
      managed: store.isManaged(),
      isAdmin,
      people: withRole,
      pending,
      // Personen aus Home Assistant, die noch nicht dabei sind
      haPersons: (haPersons ?? []).filter((p) => !(p.userId && added.has(p.userId)) && !addedNames.has(p.name.toLowerCase())),
      services: notifyServices ? notifyServices.filter((s) => s.startsWith('mobile_app_')) : null,
      ntfy: deps.ntfy ? { url: deps.ntfy.url, buttons: deps.capabilities?.publicUrl != null } : null,
      directoryAvailable: isAdmin ? haPersons !== null && haPersons !== undefined : null,
    };
  });
  // Steht eine Personenliste in der Add-on-Konfiguration, gilt sie: Personen, Geräte und Zugriff sind in der App gesperrt
  const notManaged = () => {
    if (store.isManaged()) {
      throw new ConflictError(t('Das wird in der Add-on-Konfiguration von Home Assistant verwaltet (Einstellungen › Apps › Stups › Konfiguration)'));
    }
  };
  app.put('/api/access/mode', async (req) => {
    requireAdmin(req);
    notManaged();
    return { mode: store.setAccessMode(body(req).mode) };
  });
  app.post('/api/access/people', async (req, reply) => {
    requireAdmin(req);
    notManaged();
    const b = body(req);
    return reply.code(201).send(store.addPerson({ haUserId: typeof b.haUserId === 'string' ? b.haUserId : null, name: b.name }));
  });
  app.patch<{ Params: Params }>('/api/access/people/:id', async (req) => {
    const b = body(req);
    // Die eigenen Push-Geräte wählt jeder selbst, alles andere nur ein Administrator
    const own = req.user?.id === req.params.id;
    if (b.displayName !== undefined || !own) requireAdmin(req);
    let person = store.userById(req.params.id);
    if (!person) throw new NotFoundError(t('Person nicht gefunden'));
    if (b.notifyServices !== undefined) notManaged();
    if (b.displayName !== undefined) person = store.renamePerson(person.id, b.displayName);
    if (b.notifyServices !== undefined) person = store.setNotifyServices(person.id, b.notifyServices);
    if (b.ntfyTopic !== undefined) {
      if (!deps.ntfy) throw new ConflictError(t('ntfy ist nicht eingerichtet (STUPS_NTFY_URL)'));
      person = store.setNtfyTopic(person.id, b.ntfyTopic);
    }
    if (b.quietStart !== undefined || b.quietEnd !== undefined || b.quietOff !== undefined) {
      person = store.setNudgeQuiet(person.id, { start: b.quietStart, end: b.quietEnd, off: b.quietOff });
    }
    return person;
  });
  // ----- Konten (nur ohne Home Assistant: eigene Anmeldung) -----
  const accounts = deps.accounts;
  if (accounts) {
    const view = (a: Account) => ({ userId: a.userId, username: a.username, displayName: a.displayName, isAdmin: a.isAdmin, createdAt: a.createdAt });
    app.get('/api/auth/users', async (req) => {
      requireAdmin(req);
      return accounts.list().map(view);
    });
    app.post('/api/auth/users', async (req, reply) => {
      requireAdmin(req);
      const b = body(req);
      const account =
        typeof b.userId === 'string'
          ? await accounts.createFor(b.userId, { username: b.username, password: b.password, isAdmin: b.isAdmin === true })
          : await accounts.create({ username: b.username, displayName: b.displayName, password: b.password, isAdmin: b.isAdmin === true });
      return reply.code(201).send(view(account));
    });
    app.patch<{ Params: Params }>('/api/auth/users/:id', async (req) => {
      requireAdmin(req);
      const b = body(req);
      let account = accounts.byUserId(req.params.id);
      if (!account) throw new NotFoundError(t('Benutzer nicht gefunden'));
      if (b.isAdmin !== undefined) {
        if (typeof b.isAdmin !== 'boolean') throw new ValidationError(t('isAdmin muss wahr oder falsch sein'));
        if (account.userId === req.user?.id && !b.isAdmin) throw new ConflictError(t('Du kannst dir die Administratorrechte nicht selbst nehmen'));
        account = accounts.setAdmin(account.userId, b.isAdmin);
      }
      if (b.password !== undefined) await accounts.setPassword(account.userId, b.password);
      return view(accounts.byUserId(account.userId)!);
    });
    app.delete<{ Params: Params }>('/api/auth/users/:id', async (req, reply) => {
      requireAdmin(req);
      if (req.params.id === req.user?.id) throw new ConflictError(t('Du kannst dich nicht selbst löschen'));
      accounts.remove(req.params.id);
      return noContent(reply);
    });
    // Das eigene Passwort ändern: die anderen Geräte müssen sich danach neu anmelden
    app.post('/api/auth/password', async (req, reply) => {
      const b = body(req);
      const me = req.user ? accounts.byUserId(req.user.id) : null;
      if (!me) throw new ForbiddenError(t('Nur mit einem Konto möglich'));
      if (!(await accounts.verify(me.username, b.current))) throw new ForbiddenError(t('Das aktuelle Passwort stimmt nicht'));
      await accounts.setPassword(me.userId, b.next, sessionToken(req.headers));
      return noContent(reply);
    });
    // Passkeys: jede Person verwaltet nur ihre eigenen
    const passkeys = deps.passkeys;
    if (passkeys) {
      const mine = (req: FastifyRequest): Account => {
        const me = req.user ? accounts.byUserId(req.user.id) : null;
        if (!me) throw new ForbiddenError(t('Nur mit einem Konto möglich'));
        return me;
      };
      app.get('/api/passkeys', async (req) => passkeys.list(mine(req).userId));
      app.post('/api/passkeys/options', async (req) => passkeys.registrationOptions(mine(req)));
      app.post('/api/passkeys', async (req, reply) => {
        const b = body(req);
        return reply.code(201).send(await passkeys.register(mine(req), b.ceremonyId, b.response, b.name));
      });
      app.delete<{ Params: Params }>('/api/passkeys/:id', async (req, reply) => {
        passkeys.remove(mine(req).userId, req.params.id);
        return noContent(reply);
      });
    }
  }
  app.delete<{ Params: Params }>('/api/access/people/:id', async (req, reply) => {
    requireAdmin(req);
    notManaged();
    if (req.params.id === req.user?.id && accounts) throw new ConflictError(t('Du kannst dich nicht selbst entfernen'));
    // Mit der Person verschwindet auch ihr Konto (Anmeldung), sonst käme sie weiter hinein
    if (accounts?.byUserId(req.params.id)) accounts.remove(req.params.id);
    store.removePerson(req.params.id);
    return noContent(reply);
  });
}
