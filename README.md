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

## Fiabilité de l’envoi (12 octobre 2026)

1. Le formulaire envoie un `submission_id` unique (réutilisé en cas de nouvel essai) : un double clic ou un renvoi ne crée pas de doublon (fichier `reponses/AAAA/MM/JJ/<submission_id>.json`).
2. Le serveur refuse un questionnaire vide (400, message affiché au praticien).
3. La réponse est d’abord sauvegardée dans le dépôt privé ; **seule cette sauvegarde** déclenche le message « Merci. Votre questionnaire a bien été enregistré. ».
4. L’e-mail est envoyé ensuite ; son résultat est écrit dans la réponse : `email_status` (`pending`, `sent`, `failed`) et `email_error` (code technique, sans adresse ni secret). Un échec d’e-mail ne fait jamais perdre une réponse.
5. Si la sauvegarde échoue : réponse 500, message d’erreur au praticien, et tentative de transmission du contenu par e-mail.
6. Journaux Vercel : `FORM_RECEIVED`, `FORM_VALIDATED`, `FORM_SAVED`, `EMAIL_SENT`, `EMAIL_FAILED` (horodatage, identifiant, code ; jamais de réponse ni de coordonnée).
7. Le formulaire n’utilise plus `mode: "no-cors"` : il lit la réponse réelle du serveur.

Tests : `npm test` (GitHub et Gmail simulés).
