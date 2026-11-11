// Proxy HTTPS solo para las pruebas (DEC-12): WebKit no envía la cookie `Secure` sobre `http://localhost`, y sobre
// HTTPS sí. Permite probar los flujos de sesión en ese motor, sin cambiar la aplicación ni el backend.
// El backend aislado solo admite orígenes `http://`, así que aquí se reescribe `Origin`; lo que se comprueba es la
// relación entre el navegador y la cookie, no la validación de `Origin`, que ya verifican los otros dos motores.
// El certificado es desechable: se genera en una carpeta temporal y no entra en Git.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LISTEN_PORT = 5443;
const TARGET_PORT = 5174;
const GIT_OPENSSL = 'C:/Program Files/Git/usr/bin/openssl.exe';

function findOpenssl() {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return 'openssl';
  } catch {
    if (existsSync(GIT_OPENSSL)) return GIT_OPENSSL;
    throw new Error('Las pruebas de WebKit sobre HTTPS necesitan openssl en el PATH');
  }
}

function createCertificate() {
  const dir = mkdtempSync(join(tmpdir(), 'omr-e2e-tls-'));
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  execFileSync(
    findOpenssl(),
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'],
    { stdio: 'ignore' },
  );
  const material = { key: readFileSync(key), cert: readFileSync(cert) };
  rmSync(dir, { recursive: true, force: true });
  return material;
}

const server = https.createServer(createCertificate(), (request, response) => {
  const headers = { ...request.headers, host: `localhost:${TARGET_PORT}` };
  if (headers.origin) headers.origin = `http://localhost:${TARGET_PORT}`;
  const upstream = http.request(
    { host: 'localhost', port: TARGET_PORT, path: request.url, method: request.method, headers },
    (answer) => {
      response.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(response);
    },
  );
  upstream.on('error', () => {
    response.writeHead(502);
    response.end();
  });
  request.pipe(upstream);
});

server.listen(LISTEN_PORT, 'localhost');
