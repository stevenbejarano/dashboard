# Personal Dashboard — Setup Guide

## Deploy to GitHub Pages (5 min)

1. Go to github.com → **New repository** → name it `dashboard` → **Public** → Create
2. Upload the three files (`index.html`, `style.css`, `app.js`) via the web UI or:
   ```bash
   cd ~/dashboard
   git init && git add . && git commit -m "init"
   git remote add origin https://github.com/YOUR_USERNAME/dashboard.git
   git push -u origin main
   ```
3. In the repo → **Settings → Pages** → Source: `main` / `/ (root)` → Save
4. Your dashboard is live at `https://YOUR_USERNAME.github.io/dashboard`

---

## Connect Google Calendar

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → New Project
2. **APIs & Services → Enable APIs** → search "Google Calendar API" → Enable
3. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://YOUR_USERNAME.github.io`
4. Copy the **Client ID**
5. Open your dashboard → **⚙ Settings** → paste Client ID → Save
6. Click **Connect Calendar** — authorize once and meetings load automatically

---

## Using the Dashboard

### Meetings
- Meetings containing **"DoorDash Onboarding Support"** or **"Same Day Onboarding Scheduler"** are hidden by default
- Click "Show hidden meetings" to reveal them temporarily
- If a meeting description contains a Google Doc link, an **Agenda ↗** link appears
- Meetings happening right now show a **Now** badge

### Resources
- **Suggested Today** shows your top resources based on usage frequency, day of week, and calendar matches (e.g., if "Merchant WBR" is on your calendar, that doc surfaces automatically)
- Click a resource to open it — each click increases its ranking
- Use **+ Add** to add any link with optional day/keyword targeting
- Category tabs filter the grid

### WBR Commentary
- The **Merchant WBR** card appears every week on the configured day (default: Monday)
- The **Iops WBR** card appears every other week on the configured day (default: Wednesday)
- Draft your commentary in the text area → **Copy Commentary** → paste into your Google Doc or Slack
- **Dismiss** hides the card for this cycle

### Settings (⚙)
- Change WBR days, add/remove meeting filter keywords, manage categories
- Add your Google Client ID here

---

## Adding Resources

Each resource can have:
- **Days of week** — surfaces in Suggested Today on those days
- **Calendar keywords** — surfaces when a matching meeting is on today's calendar
- Both signals combine with click frequency to rank suggestions
