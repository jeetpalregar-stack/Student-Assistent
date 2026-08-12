# AI Student Assistant

A full-stack study dashboard with notes, a timetable, calculator, quiz prompts, CGPA calculator, tips, theme switching, and responsive UI.

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer

## Run locally

1. Open a terminal in this folder.
2. Install packages: `npm install`
3. Start the app: `npm start`
4. Visit `http://localhost:3000` in your browser.

For development with automatic server restarts, use `npm run dev`.

## Project layout

```
public/          Frontend HTML, CSS, and browser JavaScript
src/database.js  SQLite connection and schema setup
data/            Created automatically; contains the local SQLite database
server.js        Express API and static web server
```

## Features

- **Accounts:** create an account or sign in from the header. Passwords are salted and hashed with Node's `scrypt`; browser sessions use random, HTTP-only cookies.
- **Private Notes CRUD:** notes persist in the local SQLite database and are visible only to the signed-in account.
- **Custom timetable:** add coloured sessions, remove sessions, and use the focus-block suggestion.
- **Calculator / CGPA calculator:** run completely in the browser.
- **Quiz generator:** creates a reusable self-testing prompt for any topic. A production AI version can call an LLM from the server, never directly from the browser.
- **Light/dark mode:** saved in the browser’s local storage.

## Security notes

The API uses Helmet security headers, request-size limits, rate limiting, parameterized SQLite queries, server-side input limits, password hashing with `scrypt`, signed-in user checks, and random HTTP-only session cookies. Before publishing publicly, add CSRF protection, email verification/password reset, a production HTTPS deployment, and environment-managed secrets.

## Optional AI upgrade

To generate real subject-specific quiz questions, add an API route in `server.js` that calls your selected AI provider using a key stored only in `.env`, validate the topic server-side, and return a short structured JSON quiz. Do not put provider keys in `public/app.js`.
