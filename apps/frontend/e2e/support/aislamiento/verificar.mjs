// Verificación de las protecciones del aislamiento E2E (HT-AUTH-02 DEC-14 y DEC-15), sin Docker ni MongoDB reales:
// ejecuta los módulos reales de `e2e/support` con `node:child_process` sustituido por `fake-docker.mjs`.
// Uso: corepack pnpm test:e2e:aislamiento   (o: node e2e/support/aislamiento/verificar.mjs)
import { existsSync } from 'node:fs';
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
const { fake, resetFake } = await import('./fake-docker.mjs');
const run = await import('../e2e-run.mjs');
const backend = await import('../isolated-backend.mjs');
const testDb = await import('../test-db.mjs');
const globalSetup = (await import('../global-setup.mjs')).default;
const globalTeardown = (await import('../global-teardown.mjs')).default;

let failures = 0;
let total = 0;
const check = (cond, msg) => {
  total++;
  console.log(`${cond ? 'ok   ' : 'FALLA'} ${msg}`);
  if (!cond) failures++;
};
const quiet = async (fn) => {
  const [log, err] = [console.log, console.error];
  console.log = console.error = () => {};
  try {
    return await fn();
  } finally {
    [console.log, console.error] = [log, err];
  }
};
const settle = async (fn) => {
  try {
    await quiet(fn);
    return null;
  } catch (e) {
    return e;
  }
};
const setRun = (id) => {
  process.env.E2E_RUN_ID = id;
  process.env.E2E_RUN_SECRET = run.newRunSecret();
};
const clearRun = () => {
  delete process.env.E2E_RUN_ID;
  delete process.env.E2E_RUN_SECRET;
};
/** Marca de propiedad de `global-setup.mjs` (O-4b). `own` simula que el setup de este proceso creó ese RUN_ID. */
const RUN_OWNER = Symbol.for('omr.e2e.run-owner');
const own = (id) => {
  globalThis[RUN_OWNER] = id;
};
const disown = () => {
  delete globalThis[RUN_OWNER];
};

const OTHER = '20261101000000_aaaaaa';
const ID64 = /^[0-9a-f]{64}$/;
const foreign = () => ({
  containers: [
    { name: 'omr-e2e-backend', labels: {}, running: true },
    { name: 'omr-e2e-backend-activacion', labels: {}, running: true },
    { name: 'omr-e2e-backend-anterior-1794017404963', labels: {}, running: false },
    { name: 'omr-preicfes-mongo-1', labels: { 'com.docker.compose.service': 'mongo' }, running: true },
    { name: 'omr-preicfes-redis-1', labels: { 'com.docker.compose.service': 'redis' }, running: true },
    { name: `omr-e2e-${OTHER}-backend`, labels: { 'omr.e2e.run': OTHER }, running: true },
  ],
  images: [
    { tags: ['omr-preicfes-backend:e2e'], labels: {} },
    { tags: [`omr-preicfes-backend:e2e-${OTHER}`], labels: { 'omr.e2e.run': OTHER } },
  ],
  dbs: ['admin', 'config', 'local', 'omr_preicfes', 'omr_preicfes_e2e', 'omr_preicfes_e2e_activacion_1794269923668', `omr_test_e2e_${OTHER}`],
  users: [
    { user: 'admin', db: 'admin', pwd: 'raiz' },
    { user: 'omr_app', db: 'omr_preicfes', pwd: 'x' },
    { user: `u_omr_test_e2e_${OTHER}`, db: `omr_test_e2e_${OTHER}`, pwd: 'y' },
  ],
});
const snapshotForeign = () => {
  const f = foreign();
  const names = new Set(f.containers.map((c) => c.name));
  const tags = new Set(f.images.flatMap((i) => i.tags));
  return JSON.stringify({
    containers: fake.containers.filter((c) => names.has(c.name)).map(({ name, labels, running }) => ({ name, labels, running })),
    images: fake.images.filter((i) => i.tags.some((t) => tags.has(t))),
    dbs: [...fake.dbs].filter((d) => f.dbs.includes(d)).sort(),
    users: fake.users.filter((u) => f.users.some((x) => x.user === u.user && x.db === u.db)).map(({ user, db, pwd }) => ({ user, db, pwd })),
  });
};
resetFake(foreign());
const FOREIGN = snapshotForeign();
const foreignIntact = () => snapshotForeign() === FOREIGN;
const destructive = () => fake.calls.filter((a) => ['rm', 'stop', 'rename'].includes(a[0]) || (a[0] === 'image' && a[1] === 'rm') || /dropUser|dropDatabase/.test(a.at(-1)));
const ofRun = (id) => ({
  containers: fake.containers.filter((c) => c.name.startsWith(`omr-e2e-${id}-`)),
  dbs: [...fake.dbs].filter((d) => d.startsWith(`omr_test_e2e_${id}`)),
  users: fake.users.filter((u) => u.db.startsWith(`omr_test_e2e_${id}`)),
  image: fake.images.some((i) => i.tags.includes(`omr-preicfes-backend:e2e-${id}`)),
});
const withRun = (id, { containers = true } = {}) => {
  const f = foreign();
  const r = run.runResources(id);
  const act1 = `${r.activationDatabasePrefix}1`;
  return {
    containers: [
      ...f.containers,
      ...(containers
        ? [
            { name: r.redis, labels: { 'omr.e2e.run': id, 'omr.e2e.role': 'redis' }, running: true },
            { name: r.backend, labels: { 'omr.e2e.run': id, 'omr.e2e.role': 'backend' }, running: true },
            { name: r.activation, labels: { 'omr.e2e.run': id, 'omr.e2e.role': 'activation' }, running: true },
          ]
        : []),
    ],
    images: [...f.images, { tags: [`omr-preicfes-backend:e2e-${id}`], labels: { 'omr.e2e.run': id } }],
    dbs: [...f.dbs, r.database, act1],
    users: [
      ...f.users,
      { user: `u_${r.database}`, db: r.database, pwd: run.runPassword(id, r.database) },
      { user: `u_${act1}`, db: act1, pwd: run.runPassword(id, act1) },
    ],
  };
};

// ---------- 1. E2E_KEEP=1 en los tres escenarios (y su contraste sin KEEP) ----------
for (const keep of [true, false]) {
  const tag = keep ? 'KEEP=1' : 'sin KEEP';
  if (keep) process.env.E2E_KEEP = '1';
  else delete process.env.E2E_KEEP;

  console.log(`\n== A. Setup fallido (${tag}): Redis responde; el backend termina tras migrar; luego Playwright llama al teardown`);
  clearRun();
  resetFake({ ...foreign(), containerRunning: (name) => name.endsWith('-redis') });
  const errA = await settle(() => globalSetup());
  const idA = process.env.E2E_RUN_ID;
  check(errA && /terminó antes de responder/.test(errA.message), `${tag}: globalSetup relanza el error original del arranque`);
  const sA = ofRun(idA);
  check(
    keep ? sA.containers.length === 2 && sA.dbs.length === 1 && sA.users.length === 1 && sA.image : sA.containers.length + sA.dbs.length + sA.users.length === 0 && !sA.image,
    `${tag}: tras el setup fallido, ${keep ? 'se conservan Redis, backend, base, usuario e imagen' : 'no queda nada de la ejecución (contenedores, base, usuario, imagen)'}`,
  );
  const errTdA = await settle(() => globalTeardown());
  const tA = ofRun(idA);
  check(errTdA === null, `${tag}: el teardown posterior (Playwright lo ejecuta aunque falle el setup) termina sin error`);
  check(keep ? JSON.stringify(tA) === JSON.stringify(sA) && destructive().length === 0 : tA.containers.length + tA.dbs.length + tA.users.length === 0,
    `${tag}: tras el teardown, ${keep ? 'todo sigue igual y no hubo ninguna orden destructiva' : 'sigue sin quedar nada (el segundo down no falla)'}`);
  check(foreignIntact(), `${tag}: recursos ajenos intactos (contenedores, imágenes, bases y usuarios)`);

  console.log(`\n== B. Reemplazo del backend de activación (${tag})`);
  const idB = run.newRunId();
  setRun(idB);
  resetFake(withRun(idB));
  const rB = run.runResources(idB);
  const oldId = fake.containers.find((c) => c.name === rB.activation).id;
  const errB = await settle(() => backend.upActivation(idB, `${rB.activationDatabasePrefix}2`));
  check(errB && /terminó antes de responder/.test(errB.message), `${tag}: se crea el nuevo backend de activación (la simulación lo detiene al esperar)`);
  const old = fake.containers.find((c) => c.id === oldId);
  if (keep) {
    check(old && old.name.startsWith(`${rB.activation}-`) && old.labels['omr.e2e.run'] === idB && old.running === false,
      `${tag}: el anterior se detiene y se renombra (${old?.name}) conservando su etiqueta`);
    check(!fake.calls.some((a) => a[0] === 'rm'), `${tag}: ningún docker rm`);
  } else {
    check(!old && fake.calls.some((a) => a[0] === 'rm' && a[2] === oldId), `${tag}: el anterior se elimina por su ID`);
  }
  const sB = ofRun(idB);
  check(sB.dbs.length === 3 && sB.users.length === 3 && !fake.calls.some((a) => /dropUser|dropDatabase/.test(a.at(-1))),
    `${tag}: no se borra ninguna base ni usuario (principal, act_1 y act_2, cada una con su usuario)`);
  check(foreignIntact(), `${tag}: recursos ajenos intactos (incluido omr-e2e-backend-activacion de DEC-13)`);
  if (keep) {
    const res = await quiet(() => backend.down(idB));
    check(res.containers.length === 4 && res.users.length === 3 && res.databases.length === 3 && res.imageRemoved && ofRun(idB).containers.length === 0,
      `${tag}: después, down <RUN_ID> también encuentra el renombrado (4 contenedores, 3 usuarios, 3 bases, imagen)`);
    check(foreignIntact(), `${tag}: recursos ajenos intactos tras down`);
  }

  console.log(`\n== C. Teardown normal (${tag})`);
  const idC = run.newRunId();
  setRun(idC);
  own(idC); // Como si `global-setup.mjs` de este proceso hubiera creado la ejecución.
  resetFake(withRun(idC));
  const errC = await settle(() => globalTeardown());
  const sC = ofRun(idC);
  check(errC === null, `${tag}: el teardown termina sin error`);
  check(
    keep ? sC.containers.length === 3 && sC.dbs.length === 2 && sC.users.length === 2 && sC.image && destructive().length === 0
      : sC.containers.length + sC.dbs.length + sC.users.length === 0 && !sC.image,
    `${tag}: ${keep ? 'conserva 3 contenedores, 2 bases, 2 usuarios e imagen, sin órdenes destructivas' : 'elimina 3 contenedores, 2 usuarios, 2 bases e imagen de la ejecución'}`,
  );
  check(foreignIntact(), `${tag}: recursos ajenos intactos`);
}
delete process.env.E2E_KEEP;

// ---------- 2. down() ante recursos manipulados ----------
console.log('\n== D. down() con contenedores, bases, usuarios e imágenes manipulados');
const id = run.newRunId();
setRun(id);
const r = run.runResources(id);
const decoys = [
  { name: r.backend, labels: {}, running: true, why: 'nombre de la ejecución sin etiqueta' },
  { name: 'omr-preicfes-mongo-copia', labels: { 'omr.e2e.run': id }, running: true, why: 'etiqueta de la ejecución con nombre ajeno' },
  { name: `omr-e2e-${id}-x`, labels: { 'omr.e2e.run': OTHER }, running: true, why: 'prefijo de la ejecución con etiqueta de otra' },
  { name: `omr-e2e-${id}-y`, labels: { 'omr.e2e.run': `${id} ` }, running: true, why: 'etiqueta con espacio final' },
  { name: `omr-e2e-${id}-z`, labels: { 'omr.e2e.run': `${id}x` }, running: true, why: 'etiqueta con sufijo' },
  { name: `omr-e2e-${id}-w`, labels: { 'omr.e2e.RUN': id }, running: true, why: 'clave de etiqueta distinta' },
];
const legit = withRun(id).containers.filter((c) => c.name === r.redis || c.name === r.activation);
const decoyDbs = [`${r.database}x`, `${r.database}_backup`, r.activationDatabasePrefix, `${r.activationDatabasePrefix}1x`,
  `${r.activationDatabasePrefix}٣`, `${r.activationDatabasePrefix}-1`, r.database.toUpperCase(), `${r.database}_act_1_copia`];
const decoyUsers = [
  { user: `u_${r.database}`, db: 'admin', pwd: 'z', why: 'nombre de usuario de la ejecución definido en admin' },
  { user: 'otro', db: r.database, pwd: 'z', why: 'otro nombre dentro de la base de la ejecución' },
  { user: `u_${r.database}x`, db: `${r.database}x`, pwd: 'z', why: 'usuario de una base señuelo' },
  { user: `u_${r.activationDatabasePrefix}1`, db: r.database, pwd: 'z', why: 'usuario de activación definido en otra base' },
];
const base = withRun(id, { containers: false });
resetFake({
  containers: [...base.containers, ...legit, ...decoys.map(({ why, ...c }) => c)],
  images: [...foreign().images, { tags: ['omr-preicfes-backend:latest', `omr-preicfes-backend:e2e-${id}`], labels: {} }],
  dbs: [...base.dbs, ...decoyDbs],
  users: [...base.users, ...decoyUsers.map(({ why, ...u }) => u)],
});
const errD = await settle(() => backend.down(id));
for (const d of decoys) check(fake.containers.some((c) => c.name === d.name), `se conserva el contenedor señuelo: ${d.why}`);
check(legit.every((c) => !fake.containers.some((x) => x.name === c.name)), 'los contenedores legítimos (etiqueta y nombre) sí se eliminan');
check(errD && /incompleta/.test(errD.message) && /omr-preicfes-mongo-copia/.test(errD.message), 'down informa el contenedor sospechoso y termina con error, tras completar el resto');
for (const db of decoyDbs) check(fake.dbs.has(db), `se conserva la base señuelo ${JSON.stringify(db)}`);
for (const u of decoyUsers) check(fake.users.some((x) => x.user === u.user && x.db === u.db), `se conserva el usuario señuelo: ${u.why}`);
check(ofRun(id).dbs.filter((d) => !decoyDbs.includes(d)).length === 0, 'las dos bases legítimas sí se borran');
check(!fake.users.some((u) => (u.user === `u_${r.database}` && u.db === r.database) || u.db === `${r.activationDatabasePrefix}1`), 'los dos usuarios legítimos sí se borran');
const foreignImg = fake.images.find((i) => i.tags.includes('omr-preicfes-backend:latest'));
check(foreignImg?.tags.includes(`omr-preicfes-backend:e2e-${id}`) && /imagen ajena/.test(errD.message), 'la imagen ajena con la etiqueta e2e-<RUN_ID> no se toca');
check(foreignIntact(), 'recursos ajenos de referencia intactos');

console.log('\n== E. Imagen de la ejecución con otra etiqueta añadida');
resetFake({ ...foreign(), images: [...foreign().images, { tags: [`omr-preicfes-backend:e2e-${id}`, 'mi-imagen:importante'], labels: { 'omr.e2e.run': id } }] });
await quiet(() => backend.down(id));
check(fake.images.some((i) => i.tags.includes('mi-imagen:importante')), 'image rm <tag> solo quita e2e-<RUN_ID>: la imagen sigue con su otra etiqueta');
for (const label of [`${id} `, ` ${id}`, `${id}x`]) {
  resetFake({ ...foreign(), images: [...foreign().images, { tags: [`omr-preicfes-backend:e2e-${id}`], labels: { 'omr.e2e.run': label } }] });
  await settle(() => backend.down(id));
  check(fake.images.some((i) => i.tags.includes(`omr-preicfes-backend:e2e-${id}`)), `no se borra la imagen e2e-<RUN_ID> con etiqueta ${JSON.stringify(label)}`);
}

console.log('\n== F. RUN_ID manipulado');
for (const bad of ['', 'omr_preicfes_e2e', `${id};rm -rf /`, `${id} `, '*', `${id}\n${OTHER}`, `${OTHER.toUpperCase()}X`]) {
  resetFake(foreign());
  let threw = false;
  try {
    await quiet(() => backend.down(bad));
  } catch {
    threw = true;
  }
  check(threw && fake.calls.length === 0, `down(${JSON.stringify(bad)}) se rechaza sin ninguna orden a Docker ni a MongoDB`);
}

// ---------- 3. F6 y F7 ----------
console.log('\n== G. F6 (--type container) y F7 (operaciones por ID)');
const idG = run.newRunId();
setRun(idG);
resetFake(withRun(idG));
await quiet(() => backend.down(idG));
const inspects = fake.calls.filter((a) => a[0] === 'inspect');
check(inspects.length > 0 && inspects.every((a) => a[1] === '--type' && a[2] === 'container'), `F6: las ${inspects.length} inspecciones de contenedores usan --type container`);
const targets = fake.calls.filter((a) => a[0] === 'rm').map((a) => a[2]);
check(targets.length === 3 && targets.every((t) => ID64.test(t)), 'F7: docker rm actúa sobre IDs completos, nunca sobre nombres');
resetFake(withRun(idG));
const rG = run.runResources(idG);
const listedId = fake.containers.find((c) => c.name === rG.backend).id;
fake.afterPs = () => {
  // Entre el listado y la inspección, el contenedor de la ejecución desaparece y otro ajeno ocupa su nombre.
  fake.containers = fake.containers.filter((c) => c.id !== listedId);
  fake.containers.push({ id: 'f'.repeat(64), name: rG.backend, labels: {}, running: true });
  fake.afterPs = null;
};
await settle(() => backend.down(idG));
check(fake.containers.some((c) => c.id === 'f'.repeat(64)), 'F7: un contenedor ajeno que ocupa el nombre tras el listado no se elimina');
resetFake({ ...withRun(idG), otherObjects: [{ type: 'volume', name: rG.activation }] });
fake.containers = fake.containers.filter((c) => c.name !== rG.activation);
await settle(() => backend.upActivation(idG, `${rG.activationDatabasePrefix}9`));
check(!fake.calls.some((a) => ['rm', 'stop', 'rename'].includes(a[0])), 'F6: un volumen con el nombre del backend de activación no se toma por contenedor ni se toca');
for (const label of [`${idG}x`, `${idG} `, idG.slice(0, -1)]) {
  // Aquí el contenedor se busca por nombre, sin el filtro de Docker: la comparación exacta de la etiqueta es la barrera.
  resetFake(withRun(idG));
  const act = fake.containers.find((c) => c.name === rG.activation);
  act.labels = { 'omr.e2e.run': label };
  const errAct = await settle(() => backend.upActivation(idG, `${rG.activationDatabasePrefix}9`));
  check(/no pertenece/.test(errAct?.message ?? '') && fake.containers.includes(act) && !fake.calls.some((a) => ['rm', 'stop', 'rename'].includes(a[0])),
    `upActivation no reemplaza un contenedor con el nombre de activación y etiqueta ${JSON.stringify(label)}`);
}

// ---------- 4. DEC-15: usuario de MongoDB por ejecución ----------
console.log('\n== H. DEC-15: usuario propio por base, sin credenciales raíz en los backends ni en las pruebas');
clearRun();
resetFake({ ...foreign(), containerRunning: (name) => name.endsWith('-redis') });
process.env.E2E_KEEP = '1';
await settle(() => globalSetup());
delete process.env.E2E_KEEP;
const idH = process.env.E2E_RUN_ID;
const rH = run.runResources(idH);
const userH = fake.users.find((u) => u.db === rH.database);
check(userH?.user === `u_${rH.database}` && userH.roles === `[{ role: "readWrite", db: "${rH.database}" }]`, 'el usuario de la base tiene solo readWrite sobre su propia base');
const backendRun = fake.calls.find((a) => a[0] === 'run' && a.includes(rH.backend));
const envFiles = backendRun.flatMap((a, i) => (a === '--env-file' ? [backendRun[i + 1]] : []));
check(envFiles.length === 1 && envFiles[0] !== '.env', 'el backend no recibe --env-file .env');
const content = fake.envFiles.find((e) => e.file === envFiles[0])?.content ?? '';
const uri = /^MONGODB_URI=mongodb:\/\/([^:]+):([0-9a-f]{64})@mongo:27017\/([^?]+)\?authSource=(\S+)$/m.exec(content);
check(uri && uri[1] === userH.user && uri[3] === rH.database && uri[4] === rH.database, 'MONGODB_URI usa el usuario de la base y se autentica en ella misma');
check(!/MONGO_ROOT|MONGO_INITDB|authSource=admin/.test(content), 'el entorno del backend no contiene credenciales raíz ni authSource=admin');
check(!existsSync(envFiles[0]), 'el archivo temporal de entorno se borra tras arrancar el contenedor');
const pwdH = userH.pwd;
check(!fake.calls.some((a) => a.join(' ').includes(pwdH)), 'la contraseña no aparece en los argumentos de ninguna orden');
const createCall = fake.calls.find((a) => /db\.createUser/.test(a.at(-1)));
check(createCall && createCall[1] === '-e' && createCall[2] === 'E2E_DB_PASSWORD', 'createUser recibe la contraseña por entorno (docker exec -e)');
fake.calls = [];
check(testDb.setAccountFields('persona@example.test', { estado: 'ACTIVA' }) === 1, 'setAccountFields opera con el usuario de la base');
const testCall = fake.calls.at(-1);
check(testCall[1] === '-e' && testCall.at(-1).includes(`-u ${userH.user} -p "$E2E_DB_PASSWORD" --authenticationDatabase ${rH.database}`) && !testCall.at(-1).includes('MONGO_INITDB'),
  'las ayudas de las pruebas no usan la cuenta raíz');
const goodSecret = process.env.E2E_RUN_SECRET;
process.env.E2E_RUN_SECRET = run.newRunSecret();
check(/Authentication failed/.test((await settle(() => testDb.setAccountFields('x@example.test', {})))?.message ?? ''), 'con otro secreto la contraseña no coincide y MongoDB rechaza la autenticación');
process.env.E2E_RUN_SECRET = goodSecret;
check(/Solo se escribe/.test((await settle(() => testDb.expireTokens('x@example.test', 'ACTIVAR_CUENTA', 'omr_preicfes_e2e')))?.message ?? ''), 'expireTokens rechaza omr_preicfes_e2e antes de conectar');
check(/bases de activación/.test((await settle(() => testDb.runBootstrapAdmin(rH.database, 'N', 'n@example.test')))?.message ?? ''), 'runBootstrapAdmin rechaza la base principal: solo bases de activación');
fake.containers.push({ id: 'a'.repeat(64), name: rH.activation, labels: { 'omr.e2e.run': OTHER }, running: true });
check(/no pertenece/.test((await settle(() => testDb.runBootstrapAdmin(`${rH.activationDatabasePrefix}1`, 'N', 'n@example.test')))?.message ?? ''), 'runBootstrapAdmin rechaza un contenedor de activación con etiqueta ajena');
fake.containers = fake.containers.filter((c) => c.id !== 'a'.repeat(64));
const res = await quiet(() => backend.down(idH));
check(res.users.length === 1 && !fake.users.some((u) => u.db.startsWith(`omr_test_e2e_${idH}`)), 'down borra el usuario de la ejecución (dropDatabase no lo haría)');
resetFake({ ...foreign(), users: [...foreign().users, { user: `u_${rH.database}`, db: rH.database, pwd: 'p' }] });
const orphan = await quiet(() => backend.down(idH));
check(orphan.users.length === 1 && orphan.databases.length === 0, 'down borra también el usuario de una base que nunca llegó a tener datos');
check(foreignIntact(), 'recursos ajenos intactos, incluidos los usuarios admin, omr_app y los de otra ejecución');
clearRun();

// ---------- 5. O-4b: propiedad del RUN_ID ----------
console.log('\n== I. O-4b: el teardown solo limpia el RUN_ID que creó el setup de este proceso');
delete process.env.E2E_KEEP;
const idI = run.newRunId(); // Otra ejecución, viva o conservada con E2E_KEEP=1.
// Los recursos de la otra ejecución se preparan una vez, con su propio secreto, que este proceso no conserva.
setRun(idI);
const stateI = withRun(idI);
clearRun();
const inheritedState = () => ({
  ...stateI,
  containers: stateI.containers.map((c) => ({ ...c, labels: { ...c.labels } })),
  images: stateI.images.map((i) => ({ ...i, tags: [...i.tags] })),
  users: stateI.users.map((u) => ({ ...u })),
});
const snapshotI = () => JSON.stringify(ofRun(idI));
const inheritedCases = [
  ['E2E_RUN_ID heredado, sin secreto', () => { process.env.E2E_RUN_ID = idI; }],
  ['E2E_RUN_ID y E2E_RUN_SECRET heredados', () => { setRun(idI); }],
  ['E2E_RUN_ID heredado y una variable E2E_RUN_OWNER falsa en el entorno', () => {
    process.env.E2E_RUN_ID = idI;
    process.env.E2E_RUN_OWNER = idI;
  }],
  ['E2E_RUN_ID heredado y una marca de otra ejecución anterior del mismo proceso', () => {
    process.env.E2E_RUN_ID = idI;
    own(run.newRunId());
  }],
];
for (const [why, prepare] of inheritedCases) {
  clearRun();
  disown();
  delete process.env.E2E_RUN_OWNER;
  resetFake(inheritedState());
  prepare();
  const before = snapshotI();
  const errSetup = await settle(() => globalSetup());
  check(errSetup && /ya están definidos/.test(errSetup.message), `${why}: el setup lo rechaza`);
  check(process.env.E2E_RUN_ID === idI && globalThis[RUN_OWNER] === undefined, `${why}: el setup no se apropia del RUN_ID heredado`);
  const errTd = await settle(() => globalTeardown());
  check(errTd === null && destructive().length === 0, `${why}: el teardown posterior no emite ninguna orden destructiva`);
  check(snapshotI() === before && ofRun(idI).containers.length === 3 && ofRun(idI).dbs.length === 2 && ofRun(idI).users.length === 2 && ofRun(idI).image,
    `${why}: los recursos de la otra ejecución siguen intactos (3 contenedores, 2 bases, 2 usuarios e imagen)`);
  check(foreignIntact(), `${why}: recursos ajenos y señuelos de referencia intactos`);
}
delete process.env.E2E_RUN_OWNER;

// Una ejecución propia sí se limpia en el teardown: setup fallido conservado con KEEP, y teardown posterior.
for (const keep of [true, false]) {
  const tag = keep ? 'KEEP=1' : 'sin KEEP';
  clearRun();
  disown();
  resetFake({ ...foreign(), containerRunning: (name) => name.endsWith('-redis') });
  process.env.E2E_KEEP = '1'; // El setup conserva lo creado, para que la limpieza la haga el teardown.
  await settle(() => globalSetup());
  const idOwn = process.env.E2E_RUN_ID;
  check(globalThis[RUN_OWNER] === idOwn && ofRun(idOwn).containers.length === 2, `${tag}: el setup marca como propio el RUN_ID que generó`);
  if (keep) process.env.E2E_KEEP = '1';
  else delete process.env.E2E_KEEP;
  fake.calls = [];
  const errOwn = await settle(() => globalTeardown());
  const sOwn = ofRun(idOwn);
  check(errOwn === null && (keep
    ? sOwn.containers.length === 2 && sOwn.dbs.length === 1 && sOwn.users.length === 1 && sOwn.image && destructive().length === 0
    : sOwn.containers.length + sOwn.dbs.length + sOwn.users.length === 0 && !sOwn.image),
  `${tag}: el teardown de la ejecución propia ${keep ? 'la conserva, sin órdenes destructivas' : 'elimina sus 2 contenedores, su usuario, su base y su imagen'}`);
  check(foreignIntact(), `${tag}: recursos ajenos intactos`);
  check(globalThis[RUN_OWNER] === undefined, `${tag}: el teardown retira la marca de propiedad`);
}
delete process.env.E2E_KEEP;
clearRun();
disown();

// ---------- 6. O-5: bootstrap:admin sin shell ----------
console.log('\n== J. O-5: runBootstrapAdmin pasa nombre y correo como argumentos, sin sh -c');
const idJ = run.newRunId();
setRun(idJ);
const rJ = run.runResources(idJ);
const hostile = [
  '$(touch /tmp/pwned)',
  '`id`',
  '${HOME} y $PATH',
  '"; rm -rf / #',
  "O'Brien \"comillas\"",
  'barra \\ y \\" y \\$HOME',
  '$1 & | ; > < * ? ~',
  'línea\nnueva',
];
for (const value of hostile) {
  resetFake(withRun(idJ));
  const actId = fake.containers.find((c) => c.name === rJ.activation).id;
  const correo = `a${value}@example.test`;
  const errJ = await settle(() => testDb.runBootstrapAdmin(`${rJ.activationDatabasePrefix}1`, value, correo));
  const execs = fake.calls.filter((a) => a[0] === 'exec');
  const label = JSON.stringify(value);
  check(errJ === null && execs.length === 1 && execs[0][1] === actId && ID64.test(actId), `${label}: un único docker exec, sobre el ID del backend de activación`);
  check(JSON.stringify(execs[0]) === JSON.stringify(['exec', actId, 'node', 'dist/cli/bootstrap-admin.js', '--nombre', value, '--correo', correo]),
    `${label}: nombre y correo llegan literales, como argumentos separados`);
  check(!execs[0].includes('sh') && !execs[0].includes('-c') && !execs[0].includes('-e'), `${label}: sin sh -c ni variables de entorno`);
  check(fake.calls.length === 2 && fake.calls[0][0] === 'inspect' && destructive().length === 0 && foreignIntact(),
    `${label}: ninguna orden adicional (solo la inspección del contenedor y el exec)`);
}
clearRun();

console.log(`\nResultado: ${total - failures} de ${total} comprobaciones superadas`);
process.exitCode = failures === 0 ? 0 : 1;
