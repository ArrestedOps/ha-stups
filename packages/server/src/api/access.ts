import { type Account } from '../accounts.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { checkDashboardPath } from '../dashboard-path.js';
import { sessionToken } from '../session-auth.js';
import { type FastifyInstance, type FastifyRequest } from 'fastify';
import { type ApiKit, type Params } from './kit.js';
import { t } from '../i18n/index.js';
import { hasPermission, PERMISSIONS, requirePermission, type Permission } from '../permissions.js';

/** Anmeldung, Personen, Zugriff und Konten */
export function registerAccessRoutes(app: FastifyInstance, k: ApiKit): void {
  const { deps, store, body, requireAdmin, noContent } = k;

  // ----- identity -----
  app.get('/api/me', async (req) => {
    const allowed = req.access?.allowed ?? false;
    const onboarding = req.user && allowed ? store.onboardingOf(req.user.id) : null;
    return {
      user: req.user,
      people: allowed ? store.people() : [],
      isAdmin: req.access?.isAdmin ?? false,
      isChild: req.access?.isChild ?? false,
      /** Was diese Person zusätzlich darf (Administrator: alles, Kind: nichts); die Oberfläche blendet danach ein und aus, der Server prüft selbst */
      permissions: req.access?.permissions ?? [],
      allowed,
      accessMode: store.getAccessMode(),
      /** Einrichtung beim ersten Start: Status der Person, gemerkter Schritt und die eine Regel, ob sie jetzt erscheint (store.needsOnboarding) */
      onboarding: onboarding?.status ?? null,
      onboardingProgress: onboarding?.progress ?? null,
      needsOnboarding: req.user && allowed ? store.needsOnboarding(req.user.id, { isAdmin: req.access?.isAdmin ?? false }) : false,
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
  // Eigene Akzentfarbe der Person (Farbton 0–359, null = Orange)
  app.put('/api/me/accent', async (req, reply) => {
    const b = body(req);
    if (!req.user) throw new ForbiddenError();
    store.setAccentHue(req.user.id, b.hue === null ? null : typeof b.hue === 'number' ? b.hue : Number.NaN);
    return noContent(reply);
  });
  // Dashboard der Person: wohin der Home-Knopf führt (Pfad in Home Assistant, null = Standard); gilt auf allen Geräten. Kind: verboten.
  app.put('/api/me/dashboard', async (req, reply) => {
    const b = body(req);
    if (!req.user) throw new ForbiddenError();
    store.setDashboardPath(req.user.id, checkDashboardPath(b.path === undefined ? Number.NaN : b.path));
    return noContent(reply);
  });
  // Einrichtung beim ersten Start: nur der eigene Status. „fertig"/„übersprungen" setzen, löschen = nochmal durchgehen, Fortschritt merken
  app.put('/api/me/onboarding', async (req, reply) => {
    const b = body(req);
    if (!req.user) throw new ForbiddenError();
    if (b.status !== 'done' && b.status !== 'skipped') throw new ValidationError(t('Der Status muss „done" oder „skipped" sein'));
    store.setOnboardingStatus(req.user.id, b.status);
    return noContent(reply);
  });
  app.delete('/api/me/onboarding', async (req, reply) => {
    if (!req.user) throw new ForbiddenError();
    store.resetOnboarding(req.user.id);
    return noContent(reply);
  });
  app.put('/api/me/onboarding/progress', async (req, reply) => {
    const b = body(req);
    if (!req.user) throw new ForbiddenError();
    store.setOnboardingProgress(req.user.id, b);
    return noContent(reply);
  });
  app.get('/api/people', async () => store.people());
  // ----- Personen & Zugriff -----
  app.get('/api/access', async (req) => {
    const isAdmin = req.access?.isAdmin ?? false;
    // Wer Personen freigeben darf (Administrator oder Recht „people"), sieht auch die Wartenden und die Personen aus Home Assistant
    const mayApprove = hasPermission(req.access, 'people');
    const [haPersons, notifyServices] = await Promise.all([
      mayApprove ? deps.directory?.persons().catch(() => null) : null,
      deps.ha?.listNotifyServices?.().catch(() => null),
    ]);
    const people = store.people();
    const granted = isAdmin ? store.allPermissions() : {};
    // Das ntfy-Thema schützt die Nachrichten: nur die Person selbst und Administratoren sehen es; Berechtigungen nur Administratoren
    const withRole = await Promise.all(
      people.map(async (p) => ({
        ...p,
        isAdmin: p.haUserId ? ((await deps.directory?.isAdmin(p.haUserId)) ?? false) : false,
        ...(isAdmin ? { permissions: granted[p.id] ?? [] } : {}),
        ...(deps.ntfy && (isAdmin || req.user?.id === p.id) ? { ntfyTopic: store.ntfyTopic(p.id) } : {}),
      })),
    );
    // Wer als Administrator ohnehin hinein darf, wartet auf nichts
    const pending = mayApprove
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
      ...(isAdmin ? { permissionKeys: [...PERMISSIONS] } : {}),
      directoryAvailable: mayApprove ? haPersons !== null && haPersons !== undefined : null,
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
    requirePermission(req, 'people'); // Person freigeben: Administrator oder Recht „people"; das neue Mitglied hat noch keine Berechtigungen
    notManaged();
    const b = body(req);
    return reply.code(201).send(store.addPerson({ haUserId: typeof b.haUserId === 'string' ? b.haUserId : null, name: b.name }));
  });
  app.patch<{ Params: Params }>('/api/access/people/:id', async (req) => {
    const b = body(req);
    // Die eigenen Push-Geräte wählt jeder selbst. Den Namen ändern Administratoren und wer das Recht „people" hat; nur den Namen,
    // alles andere an anderen Personen (Geräte, Ruhezeit, Rollen, Berechtigungen) nur Administratoren.
    const own = req.user?.id === req.params.id;
    if (b.permissions !== undefined) requireAdmin(req);
    if (b.displayName !== undefined) requirePermission(req, 'people');
    const onlyName = Object.keys(b).length > 0 && Object.keys(b).every((k) => k === 'displayName');
    if (!own && !onlyName) requireAdmin(req);
    let person = store.userById(req.params.id);
    if (!person) throw new NotFoundError(t('Person nicht gefunden'));
    if (b.notifyServices !== undefined) notManaged();
    // Berechtigungen zuerst (und vor allem anderen): ein Fehler ändert dann nichts. Administratoren brauchen keine, Kinder bekommen keine.
    let permissions: Permission[] = [];
    if (b.permissions !== undefined) {
      if (person.haUserId && (await deps.directory?.isAdmin(person.haUserId))) throw new ConflictError(t('Administratoren dürfen ohnehin alles'));
      permissions = store.setPermissions(person.id, b.permissions);
    }
    if (b.displayName !== undefined) person = store.renamePerson(person.id, b.displayName);
    if (b.notifyServices !== undefined) person = store.setNotifyServices(person.id, b.notifyServices);
    if (b.ntfyTopic !== undefined) {
      if (!deps.ntfy) throw new ConflictError(t('ntfy ist nicht eingerichtet (STUPS_NTFY_URL)'));
      person = store.setNtfyTopic(person.id, b.ntfyTopic);
    }
    if (b.quietStart !== undefined || b.quietEnd !== undefined || b.quietOff !== undefined) {
      person = store.setNudgeQuiet(person.id, { start: b.quietStart, end: b.quietEnd, off: b.quietOff });
    }
    if (b.weeklySummary !== undefined) person = store.setWeeklySummary(person.id, b.weeklySummary);
    if (b.busyUntil !== undefined) person = store.setBusyUntil(person.id, b.busyUntil);
    // Die Rolle „Kind" legen nur Administratoren fest (auch ein Kind ändert seine Regeln nicht selbst)
    if (b.isChild !== undefined || b.childScope !== undefined || b.confirmDefault !== undefined || b.confirmers !== undefined) {
      requireAdmin(req);
      if (b.isChild === true && person.haUserId && (await deps.directory?.isAdmin(person.haUserId))) {
        throw new ConflictError(t('Ein Administrator kann kein Kind sein'));
      }
      person = store.setChild(person.id, { isChild: b.isChild, childScope: b.childScope, confirmDefault: b.confirmDefault, confirmers: b.confirmers });
    }
    return b.permissions !== undefined ? { ...person, permissions } : person;
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
