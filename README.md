# Questionnaire professionnels de santé

## Architecture stable

- Formulaire public : GitHub Pages
- API de production : `https://questionnaire-sante-gules.vercel.app`
- Enregistrement : dépôt privé `questionnaire-sante-reponses`
- Transmission : SMTP Gmail via Vercel

## Règle importante

Ne jamais remplacer l'URL API de production par une URL Vercel de prévisualisation ou de déploiement du type :

`*-git-main-*.vercel.app`

Ces URLs peuvent être protégées par Vercel Authentication et provoquer un échec `Failed to fetch` depuis GitHub Pages.

## Endpoints

- `/api/submit` : réception des réponses
- `/api/health` : contrôle de santé sans exposition de secrets

## Variables d'environnement

Variables canoniques :

- `GITHUB_TOKEN`
- `GH_RESPONSES_REPO`
- `SMTP_USER`
- `SMTP_APP_PASSWORD`
- `MAIL_TO`
- `ALLOWED_ORIGIN`

Compatibilité conservée avec les noms actuellement utilisés dans Vercel :

- `UTILISATEUR SMTP`
- `PROPRIÉTAIRE DE GH`
- `ORIGINE_AUTORIS`

## Protection Vercel

Conserver **Protection standard**. Les URLs de preview peuvent rester protégées ; le domaine de production stable doit rester public.
