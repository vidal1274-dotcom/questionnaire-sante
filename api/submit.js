const crypto = require("crypto");
const nodemailer = require("nodemailer");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://vidal1274-dotcom.github.io";
const GH_OWNER = process.env.GH_OWNER || "vidal1274-dotcom";
const GH_REPO = process.env.GH_RESPONSES_REPO || "questionnaire-sante-reponses";

function cors(res, origin) {
  if (origin === ALLOWED_ORIGIN || origin === ALLOWED_ORIGIN + "/") {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

function makeMailText(data, id, receivedAt) {
  const lines = [
    "Nouvelle réponse au questionnaire santé",
    "",
    "ID : " + id,
    "Date : " + receivedAt,
    ""
  ];
  for (const [key, value] of Object.entries(data)) {
    const shown = Array.isArray(value) ? value.join(", ") : value;
    if (shown !== "") lines.push(key + " : " + shown);
  }
  return lines.join("\n");
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

  const content = Buffer.from(JSON.stringify(record, null, 2), "utf8").toString("base64");
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;

  const r = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `Nouvelle réponse questionnaire ${id}`,
      content
    })
  });

  if (!r.ok) throw new Error("Erreur enregistrement GitHub");
  return path;
}

async function sendEmail(data, id, receivedAt) {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_APP_PASSWORD;
  const mailTo = process.env.MAIL_TO;

  if (!smtpUser || !smtpPass || !mailTo) return false;

  const recipients = mailTo
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

  if (!recipients.length) return false;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  await transporter.sendMail({
    from: `Questionnaire Santé <${smtpUser}>`,
    to: recipients.join(","),
    subject: "Nouvelle réponse - Questionnaire professionnels de santé",
    text: makeMailText(data, id, receivedAt)
  });

  return true;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || "";
  cors(res, origin);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  if (origin && origin !== ALLOWED_ORIGIN && origin !== ALLOWED_ORIGIN + "/") {
    return res.status(403).json({ ok: false, error: "Origine non autorisée" });
  }

  try {
    const data = normalize(req.body);
    const receivedAt = new Date().toISOString();
    const id = crypto.randomUUID();
    const record = { id, receivedAt, source: "questionnaire-sante", data };

    const githubPath = await saveToGitHub(record, id, receivedAt);

    let emailSent = false;
    try {
      emailSent = await sendEmail(data, id, receivedAt);
    } catch (emailError) {
      console.error("Erreur email:", emailError);
    }

    return res.status(201).json({ ok: true, id, githubPath, emailSent });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Enregistrement impossible" });
  }
};