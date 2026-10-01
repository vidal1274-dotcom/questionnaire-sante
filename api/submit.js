const crypto = require("crypto");
const nodemailer = require("nodemailer");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || process.env.ORIGINE_AUTORIS || "https://vidal1274-dotcom.github.io";

function normalizeOrigin(value) {
  try {
    return new URL(String(value || "")).origin;
  } catch {
    return String(value || "").replace(/\/$/, "");
  }
}

const ALLOWED_ORIGINS = new Set([
  "https://vidal1274-dotcom.github.io",
  "https://questionnaire-sante-gules.vercel.app",
  "https://questionnaire-sante-git-main-vidal1274-8339.vercel.app",
  normalizeOrigin(ALLOWED_ORIGIN)
].filter(Boolean));
function timeoutController(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

const GH_OWNER = process.env.GH_OWNER || process.env["PROPRIÉTAIRE DE GH"] || process.env.PROPRIETAIRE_DE_GH || "vidal1274-dotcom";
const GH_REPO = process.env.GH_RESPONSES_REPO || "questionnaire-sante-reponses";

const QUESTION_LABELS = {
  profession: "1. Votre activité principale",
  note_1: "Note / Autre – activité principale",
  structure: "2. Votre mode d’exercice",
  note_2: "Note / Autre – mode d’exercice",
  logiciel: "3. Nom de votre logiciel métier principal",
  note_3: "Note / Autre – logiciel métier",
  satisfaction: "4. Globalement, êtes-vous satisfait(e) de votre logiciel actuel ?",
  note_4: "Note / Autre – satisfaction",
  problemes: "5. Quels problèmes rencontrez-vous régulièrement ?",
  note_5: "Note / Autre – problèmes récurrents",
  frequence: "6. À quelle fréquence survient votre principal problème ?",
  note_6: "Note / Autre – fréquence",
  temps_perdu: "7. Combien de temps ces problèmes vous font-ils perdre environ chaque semaine ?",
  note_7: "Note / Autre – temps perdu",
  consequences: "8. Quelles conséquences ces problèmes ont-ils pour vous ?",
  note_8: "Note / Autre – conséquences",
  contournements: "9. Aujourd’hui, comment contournez-vous principalement ces difficultés ?",
  note_9: "Note / Autre – solutions actuelles",
  fonctions_manquantes: "10. Quelles fonctions vous manquent le plus aujourd’hui ?",
  note_10: "Note / Autre – fonctions manquantes",
  indispensables: "11. Parmi ces fonctions, lesquelles seraient indispensables dans un nouvel outil ?",
  note_11: "Note / Autre – fonctions indispensables",
  automatisation: "12. Quelles tâches accepteriez-vous qu’un outil automatise ?",
  note_12: "Note / Autre – automatisation",
  benefice: "13. Pour qu’un nouvel outil soit intéressant, il devrait surtout…",
  note_13: "Note / Autre – bénéfice attendu",
  cout_actuel: "14. Quel est approximativement le coût mensuel de votre logiciel métier actuel ?",
  note_14: "Note / Autre – coût actuel",
  prix_justifie: "15. Ce tarif vous paraît-il justifié par les services rendus ?",
  note_15: "Note / Autre – rapport qualité / prix",
  budget: "16. Pour un nouvel outil réellement utile, quel budget mensuel vous semblerait acceptable ?",
  note_16: "Note / Autre – budget",
  paiement: "17. Quel mode de paiement vous conviendrait le mieux ?",
  note_17: "Note / Autre – mode de paiement",
  freins: "18. Quels éléments pourraient vous empêcher d’adopter un nouvel outil ?",
  note_18: "Note / Autre – freins à l’adoption",
  decideur: "19. Qui décide habituellement de l’achat ou du changement d’un logiciel ?",
  note_19: "Note / Autre – décideur",
  test_pilote: "20. Seriez-vous prêt(e) à tester gratuitement un prototype pendant quelques semaines ?",
  note_20: "Note / Autre – test pilote",
  achat: "21. Si le test était concluant, pourriez-vous envisager une version payante ?",
  note_21: "Note / Autre – version payante",
  autre_besoin: "22. Un besoin important manque-t-il dans cette liste ?",
  note_22: "Note / Autre – besoin complémentaire",
  impayes: "23. La gestion et la relance des impayés représentent-elles une difficulté dans votre activité ?",
  note_23: "Note / Autre – relances des impayés",
  contact: "24. Coordonnées : Nom, Prénom, Mail, Téléphone"
};

const FIELD_ORDER = [
  "profession","note_1","structure","note_2","logiciel","note_3","satisfaction","note_4",
  "problemes","note_5","frequence","note_6","temps_perdu","note_7","consequences","note_8",
  "contournements","note_9","fonctions_manquantes","note_10","indispensables","note_11",
  "automatisation","note_12","benefice","note_13","cout_actuel","note_14","prix_justifie","note_15",
  "budget","note_16","paiement","note_17","freins","note_18","decideur","note_19",
  "test_pilote","note_20","achat","note_21","autre_besoin","note_22","impayes","note_23","contact"
];

function cors(res, origin) {
  const normalized = normalizeOrigin(origin);
  if (ALLOWED_ORIGINS.has(normalized)) {
    res.setHeader("Access-Control-Allow-Origin", normalized);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function clean(value) {
  if (Array.isArray(value)) return value.map(v => String(v).slice(0, 2000));
  if (value == null) return "";
  return String(value).slice(0, 5000);
}

function normalize(body) {
  const out = {};
  for (const [key, value] of Object.entries(body || {})) out[key] = clean(value);
  return out;
}

function displayValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value || "").trim();
}

function orderedEntries(data) {
  const seen = new Set();
  const entries = [];

  for (const key of FIELD_ORDER) {
    if (!(key in data)) continue;
    const value = displayValue(data[key]);
    if (!value) continue;
    entries.push([QUESTION_LABELS[key] || key, value]);
    seen.add(key);
  }

  for (const [key, raw] of Object.entries(data)) {
    if (seen.has(key)) continue;
    const value = displayValue(raw);
    if (!value) continue;
    entries.push([QUESTION_LABELS[key] || key, value]);
  }

  return entries;
}

function formatDate(receivedAt) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "full",
      timeStyle: "medium",
      timeZone: "Europe/Paris"
    }).format(new Date(receivedAt));
  } catch {
    return receivedAt;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeMailText(data, id, receivedAt) {
  const lines = [
    "NOUVELLE RÉPONSE – QUESTIONNAIRE PROFESSIONNELS DE SANTÉ",
    "",
    "Date : " + formatDate(receivedAt),
    "Identifiant : " + id,
    ""
  ];

  for (const [label, value] of orderedEntries(data)) {
    lines.push(label);
    lines.push("→ " + value);
    lines.push("");
  }

  return lines.join("\n");
}

function makeMailHtml(data, id, receivedAt) {
  const rows = orderedEntries(data).map(([label, value]) => `
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #e8edf4;vertical-align:top;width:46%;font-weight:700;color:#172033;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #e8edf4;vertical-align:top;color:#39465a;">
        ${escapeHtml(value).replace(/\n/g, "<br>")}
      </td>
    </tr>`).join("");

  return `
  <!doctype html>
  <html lang="fr">
  <body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="max-width:860px;margin:0 auto;padding:28px 16px;">
      <div style="background:#ffffff;border:1px solid #dfe6f0;border-radius:16px;overflow:hidden;">
        <div style="padding:24px;background:#eef3ff;">
          <div style="font-size:12px;font-weight:700;color:#275efe;text-transform:uppercase;letter-spacing:.05em;">
            Questionnaire professionnels de santé
          </div>
          <h1 style="margin:8px 0 6px;font-size:24px;">Nouvelle réponse reçue</h1>
          <div style="color:#5f6c80;font-size:14px;">
            ${escapeHtml(formatDate(receivedAt))}
          </div>
        </div>

        <table role="presentation" style="width:100%;border-collapse:collapse;">
          ${rows || '<tr><td style="padding:18px;">Aucune réponse renseignée.</td></tr>'}
        </table>

        <div style="padding:16px 20px;background:#fafbfd;color:#7a8799;font-size:12px;">
          Identifiant de la réponse : ${escapeHtml(id)}
        </div>
      </div>
    </div>
  </body>
  </html>`;
}

async function saveToGitHub(record, id, receivedAt) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN manquant");

  const d = new Date(receivedAt);
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const stamp = receivedAt.replace(/[:.]/g, "-");
  const path = `reponses/${yyyy}/${mm}/${dd}/${stamp}_${id}.json`;

  const recordWithLabels = {
    ...record,
    readableResponses: orderedEntries(record.data).map(([question, answer]) => ({ question, answer }))
  };

  const encoded = Buffer.from(JSON.stringify(recordWithLabels, null, 2), "utf8").toString("base64");
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;

  const timeout = timeoutController(7000);
  let r;
  try {
    r = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Nouvelle réponse questionnaire ${id}`,
        content: encoded
      }),
      signal: timeout.signal
    });
  } catch (err) {
    if (err && err.name === "AbortError") throw new Error("Délai GitHub dépassé");
    throw err;
  } finally {
    timeout.clear();
  }

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`Erreur enregistrement GitHub (HTTP ${r.status})${detail ? ": " + detail.slice(0, 120) : ""}`);
  }
  return path;
}

async function sendEmail(data, id, receivedAt) {
  const smtpUser = process.env.SMTP_USER || process.env["UTILISATEUR SMTP"] || process.env.UTILISATEUR_SMTP;
  const smtpPass = process.env.SMTP_APP_PASSWORD;
  const mailTo = process.env.MAIL_TO;

  if (!smtpUser || !smtpPass || !mailTo) return false;

  const recipients = mailTo.split(",").map(v => v.trim()).filter(Boolean);
  if (!recipients.length) return false;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 7000
  });

  const profession = displayValue(data.profession);
  const subjectSuffix = profession ? ` – ${profession}` : "";

  await transporter.sendMail({
    from: `Questionnaire Santé <${smtpUser}>`,
    to: recipients.join(","),
    subject: `Nouvelle réponse – Questionnaire professionnels de santé${subjectSuffix}`,
    text: makeMailText(data, id, receivedAt),
    html: makeMailHtml(data, id, receivedAt)
  });

  return true;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || "";
  cors(res, origin);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  if (origin && !ALLOWED_ORIGINS.has(normalizeOrigin(origin))) {
    return res.status(403).json({ ok: false, error: "Origine non autorisée" });
  }

  try {
    let requestBody = req.body;
    if (typeof requestBody === "string") {
      try { requestBody = JSON.parse(requestBody); }
      catch (_) { requestBody = {}; }
    }
    const data = normalize(requestBody);
    const receivedAt = new Date().toISOString();
    const id = crypto.randomUUID();
    const record = { id, receivedAt, source: "questionnaire-sante", data };

    let githubSaved = false;
    let githubPath = null;
    let githubError = null;
    try {
      githubPath = await saveToGitHub(record, id, receivedAt);
      githubSaved = true;
    } catch (err) {
      githubError = err instanceof Error ? err.message : String(err);
      console.error("Erreur GitHub:", err);
    }

    let emailSent = false;
    let emailError = null;
    try {
      emailSent = await sendEmail(data, id, receivedAt);
      if (!emailSent) emailError = "Configuration email absente";
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error("Erreur email:", err);
    }

    if (!githubSaved && !emailSent) {
      return res.status(500).json({
        ok: false,
        error: "Enregistrement et transmission impossibles",
        githubSaved,
        emailSent
      });
    }

    return res.status(201).json({
      ok: true,
      id,
      githubSaved,
      githubPath,
      emailSent,
      warning: (!githubSaved || !emailSent) ? "Transmission partielle" : null
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Enregistrement impossible" });
  }
};