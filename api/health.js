const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || process.env.ORIGINE_AUTORIS || "https://vidal1274-dotcom.github.io";

function normalizeOrigin(value) {
  try {
    return new URL(String(value || "")).origin;
  } catch {
    return String(value || "").replace(/\/$/, "");
  }
}

const allowed = new Set([
  "https://vidal1274-dotcom.github.io",
  "https://questionnaire-sante-gules.vercel.app",
  "https://questionnaire-sante-git-main-vidal1274-8339.vercel.app",
  normalizeOrigin(ALLOWED_ORIGIN)
].filter(Boolean));

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || "";
  const normalized = normalizeOrigin(origin);

  if (origin && allowed.has(normalized)) {
    res.setHeader("Access-Control-Allow-Origin", normalized);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Méthode non autorisée" });

  if (origin && !allowed.has(normalized)) {
    return res.status(403).json({ ok: false, error: "Origine non autorisée" });
  }

  const smtpUser = process.env.SMTP_USER || process.env["UTILISATEUR SMTP"] || process.env.UTILISATEUR_SMTP;
  const smtpPass = process.env.SMTP_APP_PASSWORD;
  const mailTo = process.env.MAIL_TO;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GH_RESPONSES_REPO || "questionnaire-sante-reponses";

  const githubConfigured = Boolean(githubToken && githubRepo);
  const emailConfigured = Boolean(smtpUser && smtpPass && mailTo);

  return res.status(githubConfigured || emailConfigured ? 200 : 503).json({
    ok: githubConfigured || emailConfigured,
    service: "questionnaire-sante",
    version: "stable-2026-09-30",
    githubConfigured,
    emailConfigured
  });
};