# Daymark Project Context

## What this project is

Daymark is a personal productivity app for managing tasks, focus timers, calendar activity, notes, and progress reports. It is intentionally built with a small React client and Express API so the data flow stays easy to follow.

## Technology

- **Client:** JavaScript, React, Vite, and Tailwind CSS.
- **Server:** JavaScript and Express.
- **Database:** MongoDB Atlas with Mongoose models.
- **Authentication:** Email and password. Passwords are hashed; the server keeps the signed-in user in an HTTP-only session cookie.

## Main features

- Create, edit, search, and priority-filter tasks. Tasks can have notes, categories, and due dates. Marking a task complete asks for confirmation. Completed tasks remain in history; permanent deletion also removes their linked focus sessions.
- Run adjustable focus and break timers. Completed focus sessions are saved; breaks and incomplete sessions are not counted. The timer continues in the current browser and its state is saved locally.
- Use the calendar to navigate months or jump directly to a date. A selected day shows tasks due or completed that day, focus sessions, and an editable private note.
- Review a dashboard and weekly or monthly reports. Export account data as JSON or tasks and focus history as CSV.
- The configured admin account can load a sample workspace once when empty. Other accounts cannot load or see those sample records.
- Saved actions and timer completion use a custom in-app notification popup.

## Project layout

```text
client/
  src/App.jsx       Main screens and shared client state
  src/api.js        API requests and downloads
  src/utils.js      Local date, report, and timer-storage helpers
  src/styles.css    Responsive app styles
server/
  src/index.js      Express middleware, routes, and startup
  src/models.js     User, task, focus-session, and note schemas
  src/routes/       Authentication, tasks, activity, exports, and sample data
  src/db.js         MongoDB connection
  .env.example      Environment-variable template
README.md           Setup instructions and API overview
PROJECT_CONTEXT.md  Concise project and architecture reference
```

## How data moves

The React app keeps the current screen state and sends JSON requests through `client/src/api.js`. Express routes read the account ID from the session and include it in database queries so each account's data stays private. Mongoose schemas in `server/src/models.js` define the saved records.

Task completion timestamps and focus-session timestamps are stored as dates. Calendar and report grouping use the browser's local date. Daily notes use a `YYYY-MM-DD` key for the selected local calendar day.

## Local setup

1. Copy `server/.env.example` to `server/.env`.
2. Set `MONGODB_URI`, a long random `SESSION_SECRET`, `CLIENT_ORIGIN`, and the private `SAMPLE_ADMIN_EMAIL` and `SAMPLE_ADMIN_PASSWORD` values. Keep `server/.env` private; it is ignored by Git.
3. In one terminal, run `cd server`, `npm install`, then `npm run dev`.
4. In another terminal, run `cd client`, `npm install`, then `npm run dev`.
5. Open the local address printed by Vite.

The API defaults to port `5000`. The Vite development server proxies `/api` requests to Express. For a production build, run `npm run build` from the project root, set `NODE_ENV=production`, and start the API from the server directory.

## Keep the architecture approachable

Shared app behavior lives in `App.jsx`; screen components receive data and callbacks as props. API route files contain the database operations. Add comments when a rule is subtle, especially around timer completion, account authorization, and local-date calculations. Prefer small changes that fit these existing patterns.
