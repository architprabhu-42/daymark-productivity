# Daymark

Daymark is a small personal productivity app for keeping tasks, focus sessions, calendar activity, and daily notes together. It uses JavaScript and a familiar MERN-style setup: React and Vite in the browser, Express for the API, and MongoDB with Mongoose for saved data.

## What it does

- **Tasks:** add, edit, search, and filter tasks by priority. Categories stay as task labels and can be found with search. Add an optional due date and note. The app asks before marking a task complete. Completing it removes it from the active list and keeps it in history. Reopen it from the completed list, or permanently delete it; permanent deletion also removes focus sessions linked to that task.
- **Focus timer:** start a focus block on a task or on your own. The default is 25 minutes of focus and a 5-minute break; adjust both in Settings. Pause and resume as needed. Only completed focus blocks are saved or counted. Breaks and incomplete blocks do not appear in reports. If the network is down when a block finishes, it is kept in the current browser with a retry button.
- **Timer alerts:** a styled in-app notification appears when a focus block or break ends, without asking for browser notification permission. Other saved actions use the same visual notification style.
- **Calendar:** browse months or jump directly to any date. Select a day to see tasks due or completed on that date, focus sessions, and its private daily note. The calendar uses your browser’s local timezone and starts weeks on Monday.
- **Dashboard:** see today’s focus time, completed tasks, active work, overdue tasks, this week’s focus, a quick daily note, and upcoming due dates.
- **Reports:** view weekly or monthly focus minutes and completed tasks, daily averages, the most focused day, and simple charts.
- **Export:** download a JSON backup containing your tasks, daily notes, focus history, and preferences. Download task and focus-history CSV files for a spreadsheet.
- **Accounts:** create an account with an email and password. Each account’s records are private to that account; passwords are stored as hashes.
- **Sample workspace:** only the configured admin account can load five example tasks, three completed focus blocks, and two daily notes. It is a one-time action for an empty account; other accounts do not see sample records or the sample-data action. Register the configured admin email with the configured password to use it.

## Project structure

```text
client/              React screens, browser-side timer, styles, and API calls
  src/App.jsx         App state and the dashboard, tasks, timer, calendar, reports, settings
  src/api.js          Small fetch helper and file downloads
  src/utils.js        Local date keys, report grouping, and timer storage helpers
  src/styles.css      Tailwind entry point plus the app’s responsive visual styles
server/              Express API and MongoDB models
  src/index.js        Middleware, API routes, production static serving, and startup
  src/models.js       User, task, focus session, and daily note schemas
  src/routes/         Account, task, activity, and export endpoints
  .env.example        Local environment variable template
PROJECT_CONTEXT.md    Concise project and architecture reference
render.yaml           Render Blueprint for the production web service
```

The client keeps the screen state in React and sends JSON requests to the Express API. The API reads the signed-in user from an HTTP-only session cookie, scopes every data query to that user, and stores records in MongoDB. In development, Vite forwards `/api` requests to Express. In production, Express serves the built React files and API from one origin.

## Run locally

You need Node.js 20.19 or newer (or Node.js 22.12 or newer) and npm, plus a MongoDB Atlas connection string. In Atlas, create a database user and allow your development IP address to connect. Copy the connection string for the `daymark` database.

1. Copy `server/.env.example` to `server/.env` and fill in `MONGODB_URI`, a long random `SESSION_SECRET`, and the private admin password. Keep `.env` private; it is ignored by Git.
2. In one terminal, install and start the API:

   ```powershell
   cd server
   npm install
   npm run dev
   ```

3. In a second terminal, install and start the React app:

   ```powershell
   cd client
   npm install
   npm run dev
   ```

4. Open the local address printed by Vite (normally `http://localhost:5173`) and create your account.

The API listens on port `5000` by default. `CLIENT_ORIGIN` controls the browser origin allowed by Express. The Vite proxy handles the local development setup.

## Environment variables

| Variable                | Purpose                                                           | Local default                 |
| ----------------------- | ----------------------------------------------------------------- | ----------------------------- |
| `PORT`                  | Express API port                                                  | `5000`                        |
| `MONGODB_URI`           | MongoDB Atlas connection string                                   | Required                      |
| `SESSION_SECRET`        | Secret used to sign account sessions                              | Required; replace the example |
| `CLIENT_ORIGIN`         | Browser origin allowed by the API                                 | `http://localhost:5173`       |
| `NODE_ENV`              | Enables production cookie settings and static serving             | `development`                 |
| `SAMPLE_ADMIN_EMAIL`    | Email allowed to use the sample workspace                         | `archit@gmail.com`            |
| `SAMPLE_ADMIN_PASSWORD` | Password required when registering or promoting the admin account | Set a private password        |

## Deploy to Render

The repository includes a Render Blueprint that builds the React client and runs the Express server as one web service. Express serves the built client and API from the same origin.

1. Push the repository to GitHub, then in Render choose **New → Blueprint** and select the repository.
2. When prompted, provide `MONGODB_URI` for a MongoDB Atlas database. Render generates `SESSION_SECRET` for the service.
3. Deploy. The service uses `/api/health` as its health check and deploys new commits to the linked branch automatically.

To enable the optional sample workspace, add `SAMPLE_ADMIN_EMAIL` and `SAMPLE_ADMIN_PASSWORD` as private environment variables in the Render service settings. Make sure your Atlas network access rules allow the Render service to connect.

For a manual production run, build the client with `npm ci --prefix client && npm run build`, then set `NODE_ENV=production`, configure `MONGODB_URI` and `SESSION_SECRET`, and run `npm start` from the project root.

## API overview

All saved-data endpoints require a signed-in session. The API uses JSON except for CSV file downloads.

| Area          | Endpoints                                                                                                                  | Purpose                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Account       | `GET /api/auth/me`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `PATCH /api/auth/settings` | Sign in, create an account, sign out, read preferences                                                |
| Tasks         | `GET /api/tasks`, `POST /api/tasks`, `PUT /api/tasks/:id`, `PATCH /api/tasks/:id/completion`, `DELETE /api/tasks/:id`      | Manage tasks and their completed state                                                                |
| Focus history | `GET /api/sessions`, `POST /api/sessions`                                                                                  | Read and save completed focus blocks                                                                  |
| Daily notes   | `GET /api/notes`, `PUT /api/notes/:dateKey`                                                                                | Read or save a note for a local calendar date (`YYYY-MM-DD`); sending blank content deletes that note |
| Sample data   | `POST /api/demo/sample-data`                                                                                               | Admin-only: add the sample workspace to an empty account once                                         |
| Export        | `GET /api/export/json`, `GET /api/export/tasks.csv`, `GET /api/export/sessions.csv`                                        | Download account-scoped records                                                                       |
| Health        | `GET /api/health`                                                                                                          | Check that the API is responding                                                                      |

## Data and timing rules

- MongoDB stores one user record, task records, completed focus-session records, and daily-note records. Each record has an owner ID; the server gets that ID from the authenticated session instead of trusting an ID from the browser.
- A task keeps its completion timestamp so it can leave the active list and remain visible in calendar history. Marking a task complete asks for confirmation. Removing a task is a separate, confirmed action and removes its linked focus sessions too.
- A focus timer runs in the current browser. Its remaining time is saved in that browser’s local storage so a refresh can resume it. Completed sessions are sent to MongoDB and sync across devices; a running timer itself does not sync live.
- Each completed timer has a unique ID, so retrying a session save after a dropped response cannot add the same block twice.
- Focus session timestamps are stored as dates. The browser groups sessions and task completions into local calendar days. Weeks begin on Monday. Report charts are simple CSS bars so the project does not need a charting library.
- Reports are calculated from the signed-in user’s tasks and sessions in the browser. This keeps report math visible and easy to follow for the small personal datasets this app targets.

## Keeping the code understandable

The app avoids a separate state-management framework and database abstraction layer. `App.jsx` owns shared data and passes actions into small screen sections; the API route files perform database work; `models.js` documents the stored shape. Comments explain timer persistence and alerts, admin checks, account ownership, task deletion, and date grouping where those rules matter.

