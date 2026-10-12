// Tests du backend /api/submit : sauvegarde AVANT e-mail, échec e-mail sans perte, doublon,
// questionnaire vide, format invalide, échec de stockage. GitHub et Gmail sont simulés.
// Lancer : node --test test/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// Gmail simulé (nodemailer) : comportement réglé par chaque test.
let mailBehaviour = "ok";
const sentMails = [];
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "nodemailer") {
    return {
      createTransport: () => ({
        sendMail: async (mail) => {
          if (mailBehaviour === "fail") {
            const err = new Error("Invalid login: 535-5.7.8 Username and Password not accepted");
            err.code = "EAUTH";
            err.responseCode = 535;
            throw err;
          }
          sentMails.push(mail);
        },
      }),
    };
  }
  return originalLoad.call(this, request, ...rest);
};

// Dépôt GitHub simulé : fichiers en mémoire, 422 si le fichier existe sans sha.
const files = new Map();
let githubDown = false;
global.fetch = async (url, options) => {
  if (githubDown) return { ok: false, status: 503, json: async () => ({}) };
  const path = decodeURIComponent(String(url).split("/contents/")[1]);
  const body = JSON.parse(options.body);
  if (files.has(path) && !body.sha) return { ok: false, status: 422, json: async () => ({}) };
  const content = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
  const sha = "sha-" + (files.size + 1) + "-" + Math.random().toString(16).slice(2);
  files.set(path, { content, sha });
  return { ok: true, status: body.sha ? 200 : 201, json: async () => ({ content: { sha } }) };
};

process.env.GITHUB_TOKEN = "jeton-de-test";
process.env.SMTP_USER = "expediteur@example.test";
process.env.SMTP_APP_PASSWORD = "mot-de-passe-de-test";
process.env.MAIL_TO = "destinataire@example.test";

const handler = require("../api/submit.js");

function call(body, { origin = "https://questionnaire-sante-gules.vercel.app" } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload, headers: this.headers }); },
      end() { resolve({ status: this.statusCode, body: null, headers: this.headers }); },
    };
    handler({ method: "POST", headers: { origin }, body }, res);
  });
}

const ID = "3f1d2c4b-5a6e-4f70-8a9b-0c1d2e3f4a5b";
const answers = { profession: "Kiné", satisfaction: "Plutôt satisfait", submission_id: ID };

test.beforeEach(() => {
  files.clear();
  sentMails.length = 0;
  mailBehaviour = "ok";
  githubDown = false;
});

test("questionnaire complet : sauvegardé puis e-mail envoyé, statut conservé", async () => {
  const r = await call(JSON.stringify(answers));
  assert.equal(r.status, 201);
  assert.deepEqual(
    { ok: r.body.ok, saved: r.body.saved, email: r.body.email_status, id: r.body.submission_id },
    { ok: true, saved: true, email: "sent", id: ID }
  );
  assert.equal(files.size, 1);
  const [record] = [...files.values()].map((f) => f.content);
  assert.equal(record.email_status, "sent");
  assert.equal(record.data.profession, "Kiné");
  assert.equal(sentMails.length, 1);
});

test("échec de l'e-mail : la réponse reste sauvegardée avec email_status = failed", async () => {
  mailBehaviour = "fail";
  const r = await call(JSON.stringify(answers));
  assert.equal(r.status, 201);
  assert.equal(r.body.saved, true);
  assert.equal(r.body.email_status, "failed");
  const record = [...files.values()][0].content;
  assert.equal(record.email_status, "failed");
  assert.match(record.email_error, /EAUTH 535/);
  assert.doesNotMatch(record.email_error, /@/); // aucune adresse dans l'erreur conservée
});

test("double envoi du même questionnaire : une seule réponse enregistrée", async () => {
  const [a, b] = await Promise.all([call(JSON.stringify(answers)), call(JSON.stringify(answers))]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(files.size, 1);
  assert.ok([a.body, b.body].some((x) => x.duplicate === true));
});

test("questionnaire vide : refusé avec un message clair, rien n'est stocké", async () => {
  const r = await call(JSON.stringify({ profession: "", note_1: "  ", submission_id: ID }));
  assert.equal(r.status, 400);
  assert.match(r.body.error, /vide/);
  assert.equal(files.size, 0);
});

test("format invalide : refusé", async () => {
  const r = await call("ceci n'est pas du JSON");
  assert.equal(r.status, 400);
  assert.equal(files.size, 0);
});

test("stockage indisponible : jamais de succès, réponses tentées par e-mail", async () => {
  githubDown = true;
  const r = await call(JSON.stringify(answers));
  assert.equal(r.status, 500);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.saved, false);
  assert.equal(sentMails.length, 1); // filet de sécurité : le contenu part par e-mail
});

test("origine inconnue : refusée ; GitHub Pages autorisé", async () => {
  const bad = await call(JSON.stringify(answers), { origin: "https://pirate.example" });
  assert.equal(bad.status, 403);
  const pages = await call(JSON.stringify(answers), { origin: "https://vidal1274-dotcom.github.io" });
  assert.equal(pages.status, 201);
  assert.equal(pages.headers["access-control-allow-origin"], "https://vidal1274-dotcom.github.io");
});

test("identifiant client invalide : remplacé par un identifiant serveur", async () => {
  const r = await call(JSON.stringify({ profession: "Kiné", submission_id: "../../evil" }));
  assert.equal(r.status, 201);
  assert.match(r.body.submission_id, /^[0-9a-f-]{36}$/);
  assert.ok([...files.keys()][0].endsWith(`${r.body.submission_id}.json`));
});
