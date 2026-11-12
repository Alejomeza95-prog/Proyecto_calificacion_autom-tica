// Simulación en memoria de Docker y de mongosh para `verificar.mjs` (DEC-14 y DEC-15). Ningún comando real se ejecuta.
// Reproduce estas reglas documentadas de Docker y MongoDB:
// - el filtro `label=k=v` exige igualdad exacta; las etiquetas de un contenedor no cambian tras crearlo;
// - `inspect --type container` solo considera contenedores; un ID o un nombre identifican un contenedor;
// - `image rm <tag>` quita esa etiqueta y solo borra la imagen si no le quedan otras;
// - un usuario de MongoDB con `readWrite` en una base solo opera en ella; `dropDatabase` no borra sus usuarios.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const ROOT_MARK = '-u "$MONGO_INITDB_ROOT_USERNAME"';

export const fake = (globalThis.__omrFakeDocker ??= {});

/** Estado inicial: `containers` sin `id` reciben uno; `users` es una lista de `{ user, db, pwd }`. */
export function resetFake(state = {}) {
  Object.assign(fake, {
    containers: (state.containers ?? []).map((c) => ({ id: randomBytes(32).toString('hex'), ...c })),
    images: state.images ?? [],
    otherObjects: state.otherObjects ?? [], // volúmenes o redes: `inspect --type container` no los ve
    dbs: new Set(state.dbs ?? []),
    users: [...(state.users ?? [])],
    calls: [], // argumentos de cada orden, tal cual
    envFiles: [], // contenido de los `--env-file` en el momento de `docker run`
    containerRunning: state.containerRunning ?? (() => false),
    afterPs: state.afterPs ?? null, // para simular cambios entre el listado y la inspección
  });
}

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const fail = () => ({ status: 1, stdout: '', stderr: 'Error: No such object' });
const labelsFrom = (args) => {
  const labels = {};
  args.forEach((a, i) => {
    if (a === '--label') {
      const [k, ...v] = args[i + 1].split('=');
      labels[k] = v.join('=');
    }
  });
  return labels;
};
const byRef = (ref) => fake.containers.find((c) => c.id === ref || c.name === ref);
const findImage = (tag) => fake.images.find((i) => i.tags.includes(tag));

function docker(args) {
  fake.calls.push([...args]);
  const [a0, a1] = args;
  if (a0 === 'inspect') {
    if (args[1] !== '--type' || args[2] !== 'container') throw new Error('inspect sin --type container');
    const fmt = args[4];
    const c = byRef(args[5]);
    if (!c) return fail();
    if (fmt === '{{.State.Running}}') return ok(String(c.running));
    return ok(`${c.id}\t/${c.name}\t${c.labels['omr.e2e.run'] ?? ''}`);
  }
  if (a0 === 'image' && a1 === 'inspect') {
    const img = findImage(args[4]);
    if (!img) return fail();
    return ok(img.labels['omr.e2e.run'] ?? '');
  }
  if (a0 === 'image' && a1 === 'ls') {
    return ok(fake.images.filter((i) => 'omr.e2e.run' in i.labels).flatMap((i) => i.tags.map((t) => t.split(':')[1])).join('\n'));
  }
  if (a0 === 'image' && a1 === 'rm') {
    const img = findImage(args[2]);
    if (!img) return fail();
    img.tags = img.tags.filter((t) => t !== args[2]);
    if (img.tags.length === 0) fake.images = fake.images.filter((i) => i !== img);
    return ok();
  }
  if (a0 === 'ps') {
    const filter = args[args.indexOf('--filter') + 1].slice('label='.length);
    const format = args[args.indexOf('--format') + 1];
    const [key, ...rest] = filter.split('=');
    const value = rest.length ? rest.join('=') : undefined;
    const match = fake.containers.filter((c) => key in c.labels && (value === undefined || c.labels[key] === value));
    const out = match.map((c) => (format === '{{.ID}}' ? c.id : c.labels[key])).join('\n');
    if (fake.afterPs) fake.afterPs();
    return ok(out);
  }
  if (a0 === 'rm' || a0 === 'stop') {
    const c = byRef(a0 === 'rm' ? args[2] : args[1]);
    if (!c) return fail();
    if (a0 === 'rm') fake.containers = fake.containers.filter((x) => x !== c);
    else c.running = false;
    return ok();
  }
  if (a0 === 'rename') {
    const c = byRef(args[1]);
    if (!c || byRef(args[2])) return fail();
    c.name = args[2];
    return ok();
  }
  if (a0 === 'build') {
    const tag = args[args.indexOf('-t') + 1];
    for (const i of fake.images) i.tags = i.tags.filter((t) => t !== tag);
    fake.images.push({ tags: [tag], labels: labelsFrom(args) });
    return ok();
  }
  if (a0 === 'run') {
    const name = args[args.indexOf('--name') + 1];
    if (byRef(name)) return fail();
    const envFiles = args.flatMap((a, i) => (a === '--env-file' ? [args[i + 1]] : []));
    for (const file of envFiles) fake.envFiles.push({ file, content: file === '.env' ? '<.env del repositorio>' : readFileSync(file, 'utf8') });
    fake.containers.push({ id: randomBytes(32).toString('hex'), name, labels: labelsFrom(args), running: fake.containerRunning(name) });
    // La migración, dentro del contenedor, crea la base con el usuario de la URI.
    const uri = envFiles.map((f) => fake.envFiles.find((e) => e.file === f)?.content ?? '').join('\n').match(/MONGODB_URI=mongodb:\/\/([^:]+):([^@]+)@mongo:27017\/([^?]+)\?authSource=(\S+)/);
    if (uri) {
      const [, user, pwd, db, authDb] = uri;
      if (fake.users.some((u) => u.user === user && u.db === authDb && u.pwd === pwd) && db === authDb) fake.dbs.add(db);
      else throw new Error('La migración no podría autenticarse con la URI del backend');
    }
    return ok();
  }
  if (a0 === 'exec' && args[2] === 'redis-cli') return ok('PONG');
  throw new Error(`Orden docker no simulada: ${args.join(' ')}`);
}

export function spawnSync(command, args) {
  if (command !== 'docker') throw new Error(`Comando no simulado: ${command}`);
  return docker(args);
}

/** mongosh dentro del contenedor `mongo`: raíz o usuario propio, con la contraseña tomada del entorno. */
export function execFileSync(command, args, options = {}) {
  if (command !== 'docker' || args[0] !== 'exec') throw new Error(`execFileSync no simulado: ${command} ${args.join(' ')}`);
  fake.calls.push([...args]);
  // `bootstrap:admin` en el backend de activación (O-5): `docker exec <ID> node <script> ...`, sin shell. Docker pasa
  // los argumentos tal cual al proceso; quedan en `fake.calls` para comprobarlos.
  if (args[2] === 'node') {
    if (!fake.containers.some((c) => c.id === args[1])) throw new Error('Error: No such container');
    return '';
  }
  const envIndex = args.indexOf('-e');
  const passwordVar = envIndex === 1 ? args[2] : undefined;
  const password = passwordVar ? options.env?.[passwordVar] : undefined;
  const shell = args[args.length - 1];
  const m = /^mongosh --quiet (.+?) (\S+) --eval '([\s\S]*)'$/.exec(shell);
  if (!m) throw new Error('mongosh no simulado');
  const [, credentials, database, script] = m;
  const isRoot = credentials === `${ROOT_MARK} -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin`;

  if (!isRoot) {
    const cred = /^-u (\S+) -p "\$(\w+)" --authenticationDatabase (\S+)$/.exec(credentials);
    if (!cred || cred[2] !== passwordVar) throw new Error('credenciales de mongosh no simuladas');
    const [, user, , authDb] = cred;
    const account = fake.users.find((u) => u.user === user && u.db === authDb);
    if (!account || account.pwd !== password) throw new Error('MongoServerError: Authentication failed');
    if (authDb !== database || /getSiblingDB|adminCommand|getMongo/.test(script)) throw new Error('MongoServerError: not authorized');
  }
  if (database !== 'admin') {
    const guard = /^if \(db\.getName\(\) !== "([^"]+)"\) quit\(3\);/.exec(script);
    if (!guard || guard[1] !== database) throw new Error('Falta la comprobación db.getName() en mongosh');
  }
  if (script.includes('getDBNames') && script.includes('usersInfo')) {
    return JSON.stringify([[...fake.dbs], fake.users.map((u) => u.db)]);
  }
  if (script.includes('getDBNames')) return JSON.stringify([...fake.dbs]);
  if (script.includes('usersInfo')) return JSON.stringify(fake.users.map((u) => [u.user, u.db]));
  if (script.includes('db.createUser')) {
    const user = /user: "([^"]+)"/.exec(script)[1];
    const roles = /roles: (\[[^\]]+\])/.exec(script)[1];
    if (!script.includes('pwd: process.env.') || !password) throw new Error('createUser sin contraseña por entorno');
    if (fake.users.some((u) => u.user === user && u.db === database)) throw new Error('MongoServerError: User already exists');
    fake.users.push({ user, db: database, pwd: password, roles });
    return 'ok';
  }
  if (script.includes('db.dropUser')) {
    const user = /dropUser\("([^"]+)"\)/.exec(script)[1];
    fake.users = fake.users.filter((u) => !(u.user === user && u.db === database));
    return 'ok';
  }
  if (script.includes('dropDatabase')) {
    fake.dbs.delete(database); // No borra usuarios, como MongoDB.
    return 'true';
  }
  if (script.includes('updateOne') || script.includes('updateMany')) return '1';
  throw new Error(`script de mongosh no simulado: ${script.slice(0, 60)}`);
}
