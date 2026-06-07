const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URLSearchParams } = require("url");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const BASE_URL = process.env.BASE_URL || `http://${HOST}:${PORT}`;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-admin-password";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update(ADMIN_PASSWORD).digest("hex");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

const files = {
  election: "election.json",
  voters: "voters.json",
  offices: "offices.json",
  candidates: "candidates.json",
  tokens: "tokens.json",
  votes: "votes.json",
  audit: "audit.json",
  snapshots: "snapshots.json",
};

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  writeIfMissing(files.election, {
    id: "naco94-2026",
    title: "NACO 94 Election",
    status: "setup",
    opensAt: "",
    closesAt: "",
    timezone: "Australia/Brisbane",
    registerLockedAt: "",
  });
  writeIfMissing(files.voters, []);
  writeIfMissing(files.offices, []);
  writeIfMissing(files.candidates, []);
  writeIfMissing(files.tokens, []);
  writeIfMissing(files.votes, []);
  writeIfMissing(files.audit, []);
  writeIfMissing(files.snapshots, []);
}

function writeIfMissing(file, value) {
  const target = path.join(DATA_DIR, file);
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, JSON.stringify(value, null, 2));
  }
}

function load(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
}

function save(file, value) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(value, null, 2));
}

function state() {
  return {
    election: load(files.election),
    voters: load(files.voters),
    offices: load(files.offices),
    candidates: load(files.candidates),
    tokens: load(files.tokens),
    votes: load(files.votes),
    audit: load(files.audit),
    snapshots: load(files.snapshots),
  };
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token).trim().toUpperCase()).digest("hex");
}

function newCode() {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

function nowIso() {
  return new Date().toISOString();
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) cookies[key] = decodeURIComponent(rest.join("="));
  }
  return cookies;
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function isAdmin(req) {
  const session = parseCookies(req).naco_admin;
  if (!session) return false;
  const [value, signature] = session.split(".");
  return value === "admin" && signature === sign(value);
}

function setAdminCookie(res) {
  const value = `admin.${sign("admin")}`;
  res.setHeader("Set-Cookie", `naco_admin=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/`);
}

function clearAdminCookie(res) {
  res.setHeader("Set-Cookie", "naco_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function send(res, status, body, contentType = "text/html; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(new URLSearchParams(body)));
    req.on("error", reject);
  });
}

function layout(title, content, options = {}) {
  const nav = options.admin
    ? `<nav><a href="/admin">Admin</a><a href="/results">Public results</a><a href="/admin/report">Report</a><form method="post" action="/admin/logout"><button>Logout</button></form></nav>`
    : `<nav><a href="/">Vote</a><a href="/results">Results</a><a href="/admin">Admin</a></nav>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>
    :root { color-scheme: light; --ink:#17202a; --muted:#5c6670; --line:#d9dee5; --panel:#ffffff; --bg:#f3f6f8; --accent:#087f5b; --danger:#b42318; --warn:#996f00; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Arial, Helvetica, sans-serif; color:var(--ink); background:var(--bg); }
    header { background:#0b3d2e; color:#fff; padding:18px 16px; }
    header .wrap, main { max-width:1100px; margin:0 auto; }
    h1 { margin:0; font-size:24px; line-height:1.2; letter-spacing:0; }
    h2 { font-size:20px; margin:0 0 12px; }
    h3 { font-size:16px; margin:0 0 10px; }
    p { line-height:1.5; }
    nav { display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-top:12px; }
    nav a, nav button { color:#fff; background:transparent; border:1px solid rgba(255,255,255,.45); padding:8px 10px; border-radius:6px; text-decoration:none; font-size:14px; cursor:pointer; }
    nav form { margin:0; }
    main { padding:18px 14px 40px; }
    section, .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; margin:0 0 16px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; }
    .stat { background:#eef7f3; border:1px solid #cde6dc; border-radius:8px; padding:12px; }
    .stat strong { display:block; font-size:24px; margin-top:4px; }
    label { display:block; font-weight:700; font-size:14px; margin:10px 0 5px; }
    input, select, textarea { width:100%; padding:11px; border:1px solid #bdc6cf; border-radius:6px; font:inherit; background:#fff; }
    textarea { min-height:120px; }
    button, .button { display:inline-block; border:0; background:var(--accent); color:#fff; border-radius:6px; padding:11px 14px; font-weight:700; cursor:pointer; text-decoration:none; }
    button.secondary, .button.secondary { background:#314156; }
    button.danger { background:var(--danger); }
    button.warn { background:var(--warn); }
    .row { display:flex; gap:10px; flex-wrap:wrap; align-items:end; }
    .row > * { flex:1; min-width:150px; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    th, td { text-align:left; vertical-align:top; border-bottom:1px solid var(--line); padding:9px 7px; }
    th { background:#f7fafb; }
    .muted { color:var(--muted); }
    .error { color:var(--danger); font-weight:700; }
    .ok { color:var(--accent); font-weight:700; }
    .pill { display:inline-block; padding:3px 8px; border-radius:999px; background:#eef0f2; font-size:12px; }
    .pill.ok { background:#dff4ea; color:#087f5b; }
    .pill.bad { background:#fde4e1; color:#b42318; }
    .candidate { display:block; padding:12px; border:1px solid var(--line); border-radius:8px; margin:8px 0; background:#fff; }
    .candidate input { width:auto; margin-right:8px; }
    .results-bar { height:12px; background:#e7ecef; border-radius:999px; overflow:hidden; margin:5px 0 12px; }
    .results-fill { height:100%; background:#0b8f66; }
    .nowrap { white-space:nowrap; }
    @media (max-width:720px) {
      table, thead, tbody, tr, th, td { display:block; }
      thead { display:none; }
      tr { border:1px solid var(--line); border-radius:8px; margin-bottom:10px; padding:8px; }
      td { border:0; padding:5px; }
      td[data-label]::before { content:attr(data-label) ": "; font-weight:700; }
      header { padding:16px 12px; }
      h1 { font-size:21px; }
    }
  </style>
</head>
<body>
  <header><div class="wrap"><h1>${esc(title)}</h1>${nav}</div></header>
  <main>${content}</main>
</body>
</html>`;
}

function summarize(st) {
  const eligible = st.voters.filter((v) => v.eligible);
  const excluded = st.voters.filter((v) => !v.eligible);
  const usedVoterIds = new Set(st.tokens.filter((t) => t.usedAt).map((t) => t.voterId));
  const turnout = eligible.length ? Math.round((usedVoterIds.size / eligible.length) * 100) : 0;
  return {
    registered: st.voters.length,
    eligible: eligible.length,
    excluded: excluded.length,
    votesCast: usedVoterIds.size,
    turnout,
  };
}

function electionOpenStatus(election) {
  if (election.status !== "open") return { ok: false, message: `Voting is ${election.status}.` };
  const now = Date.now();
  if (election.opensAt && now < Date.parse(election.opensAt)) return { ok: false, message: "Voting has not opened yet." };
  if (election.closesAt && now > Date.parse(election.closesAt)) return { ok: false, message: "Voting has closed." };
  return { ok: true, message: "Voting is open." };
}

function findToken(st, code) {
  const tokenHash = hashToken(code);
  return st.tokens.find((t) => t.tokenHash === tokenHash && !t.revokedAt);
}

function publicHome(message = "") {
  const st = state();
  const summary = summarize(st);
  return layout(
    st.election.title,
    `<section>
      <h2>Enter your private voting code</h2>
      <p class="muted">Use the code ELECO sent to you privately on WhatsApp. Only registered eligible voters can open a ballot.</p>
      ${message ? `<p class="error">${esc(message)}</p>` : ""}
      <form method="post" action="/enter-code">
        <label for="code">Voting code</label>
        <input id="code" name="code" autocomplete="one-time-code" required placeholder="Example: A1B2C3D4E5">
        <p><button type="submit">Continue to ballot</button></p>
      </form>
    </section>
    <section>
      <h2>Live public result</h2>
      <p class="muted">Public results show totals only. Voter names and individual choices are not shown here.</p>
      <div class="stats">
        <div class="stat">Registered members<strong>${summary.registered}</strong></div>
        <div class="stat">Eligible voters<strong>${summary.eligible}</strong></div>
        <div class="stat">Votes cast<strong>${summary.votesCast}</strong></div>
        <div class="stat">Turnout<strong>${summary.turnout}%</strong></div>
      </div>
      <p><a class="button secondary" href="/results">View live results</a></p>
    </section>`
  );
}

function renderVotePage(code, message = "") {
  const st = state();
  const token = findToken(st, code);
  if (!token) {
    logAudit("voter", "", "invalid_code_view", { codeSuffix: String(code).slice(-4) });
    return publicHome("Invalid voting code. Please check the code ELECO sent to you.");
  }
  const voter = st.voters.find((v) => v.id === token.voterId);
  if (!voter || !voter.eligible) {
    logAudit("voter", token.voterId, "ineligible_code_view", {});
    return publicHome("This code is not eligible to vote.");
  }
  if (token.usedAt) {
    return layout(
      st.election.title,
      `<section><h2>Vote already submitted</h2><p class="ok">Thank you, ${esc(voter.fullName)}. This voting code has already been used.</p><p><a class="button secondary" href="/results">View public results</a></p></section>`
    );
  }
  const open = electionOpenStatus(st.election);
  if (!open.ok) {
    return layout(st.election.title, `<section><h2>Hello, ${esc(voter.fullName)}</h2><p class="error">${esc(open.message)}</p><p><a class="button secondary" href="/results">View public results</a></p></section>`);
  }
  const offices = st.offices.slice().sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
  if (!offices.length) {
    return layout(st.election.title, `<section><h2>Hello, ${esc(voter.fullName)}</h2><p class="error">The ballot has not been configured yet.</p></section>`);
  }
  const ballot = offices
    .map((office) => {
      const candidates = st.candidates.filter((c) => c.officeId === office.id && c.status !== "inactive");
      return `<section>
        <h2>${esc(office.title)}</h2>
        <p class="muted">Choose one candidate.</p>
        ${candidates
          .map(
            (candidate) => `<label class="candidate"><input type="radio" name="office_${esc(office.id)}" value="${esc(candidate.id)}" required> ${esc(candidate.displayName || candidate.fullName)}</label>`
          )
          .join("")}
      </section>`;
    })
    .join("");
  return layout(
    st.election.title,
    `<section><h2>Hello, ${esc(voter.fullName)}</h2><p class="muted">Confirm your choices carefully. Your code can submit only once.</p>${message ? `<p class="error">${esc(message)}</p>` : ""}</section>
    <form method="post" action="/vote">
      <input type="hidden" name="code" value="${esc(code)}">
      ${ballot}
      <section><button type="submit">Submit vote</button></section>
    </form>`
  );
}

function buildResults() {
  const st = state();
  const summary = summarize(st);
  const offices = st.offices.slice().sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
  const resultOffices = offices.map((office) => {
    const candidates = st.candidates.filter((c) => c.officeId === office.id && c.status !== "inactive");
    const totals = candidates.map((candidate) => ({
      candidateId: candidate.id,
      name: candidate.displayName || candidate.fullName,
      count: st.votes.filter((v) => v.officeId === office.id && v.candidateId === candidate.id).length,
    }));
    const officeTotal = totals.reduce((sum, item) => sum + item.count, 0);
    return { officeId: office.id, title: office.title, total: officeTotal, candidates: totals };
  });
  return { election: st.election, summary, offices: resultOffices };
}

function resultsPage() {
  const data = buildResults();
  return layout(
    `${data.election.title} Results`,
    `<section>
      <h2>Live public results</h2>
      <p class="muted">This page updates automatically and shows totals only.</p>
      <div id="results">${renderResultsHtml(data)}</div>
    </section>
    <script>
      async function refreshResults() {
        const res = await fetch('/api/results', { cache: 'no-store' });
        const data = await res.json();
        document.getElementById('results').innerHTML = data.html;
      }
      setInterval(refreshResults, 3000);
    </script>`
  );
}

function renderResultsHtml(data) {
  return `<div class="stats">
    <div class="stat">Registered<strong>${data.summary.registered}</strong></div>
    <div class="stat">Eligible<strong>${data.summary.eligible}</strong></div>
    <div class="stat">Votes cast<strong>${data.summary.votesCast}</strong></div>
    <div class="stat">Turnout<strong>${data.summary.turnout}%</strong></div>
  </div>
  ${data.offices
    .map(
      (office) => `<section>
        <h2>${esc(office.title)}</h2>
        ${office.candidates
          .map((candidate) => {
            const pct = office.total ? Math.round((candidate.count / office.total) * 100) : 0;
            return `<div><strong>${esc(candidate.name)}</strong> <span class="muted">- ${candidate.count} vote${candidate.count === 1 ? "" : "s"} (${pct}%)</span><div class="results-bar"><div class="results-fill" style="width:${pct}%"></div></div></div>`;
          })
          .join("")}
      </section>`
    )
    .join("")}`;
}

function adminLogin(message = "") {
  const warning = ADMIN_PASSWORD === "change-this-admin-password" ? `<p class="error">Set ADMIN_PASSWORD before using this for a real election.</p>` : "";
  return layout(
    "ELECO Admin Login",
    `<section>
      <h2>ELECO admin login</h2>
      ${warning}
      ${message ? `<p class="error">${esc(message)}</p>` : ""}
      <form method="post" action="/admin/login">
        <label for="password">Admin password</label>
        <input id="password" type="password" name="password" required>
        <p><button type="submit">Login</button></p>
      </form>
    </section>`
  );
}

function adminPage(message = "") {
  const st = state();
  const summary = summarize(st);
  const eligibleMissingCodes = st.voters.filter((v) => v.eligible && !st.tokens.some((t) => t.voterId === v.id && !t.revokedAt && !t.usedAt)).length;
  return layout(
    "ELECO Admin",
    `${message ? `<section><p class="ok">${esc(message)}</p></section>` : ""}
    <section>
      <h2>${esc(st.election.title)}</h2>
      <div class="stats">
        <div class="stat">Registered members<strong>${summary.registered}</strong></div>
        <div class="stat">Eligible voters<strong>${summary.eligible}</strong></div>
        <div class="stat">Excluded voters<strong>${summary.excluded}</strong></div>
        <div class="stat">Votes cast<strong>${summary.votesCast}</strong></div>
        <div class="stat">Turnout<strong>${summary.turnout}%</strong></div>
        <div class="stat">Codes needed<strong>${eligibleMissingCodes}</strong></div>
      </div>
    </section>
    ${electionAdmin(st)}
    ${voterAdmin(st)}
    ${officeAdmin(st)}
    ${tokenAdmin(st)}
    ${auditAdmin(st)}`,
    { admin: true }
  );
}

function electionAdmin(st) {
  return `<section>
    <h2>Election settings</h2>
    <form method="post" action="/admin/election">
      <div class="row">
        <div><label>Election title</label><input name="title" value="${esc(st.election.title)}" required></div>
        <div><label>Status</label><select name="status">${["setup", "open", "paused", "closed"].map((s) => `<option value="${s}" ${st.election.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div><label>Timezone</label><input name="timezone" value="${esc(st.election.timezone)}"></div>
      </div>
      <div class="row">
        <div><label>Opens at</label><input name="opensAt" type="datetime-local" value="${esc(toLocalInput(st.election.opensAt))}"></div>
        <div><label>Closes at</label><input name="closesAt" type="datetime-local" value="${esc(toLocalInput(st.election.closesAt))}"></div>
        <div><button type="submit">Save settings</button></div>
      </div>
    </form>
    <form method="post" action="/admin/register/lock" onsubmit="return confirm('Lock the voter register and preserve a final snapshot?');">
      <p>Register lock: ${st.election.registerLockedAt ? `<span class="pill ok">${esc(st.election.registerLockedAt)}</span>` : `<span class="pill">Not locked</span>`}</p>
      <button class="warn" type="submit">Lock register and snapshot</button>
    </form>
  </section>`;
}

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  if (!value) return "";
  return new Date(value).toISOString();
}

function voterAdmin(st) {
  const rows = st.voters
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((v) => {
      const token = st.tokens.find((t) => t.voterId === v.id && !t.revokedAt);
      return `<tr>
        <td data-label="Name">${esc(v.fullName)}</td>
        <td data-label="WhatsApp">${esc(v.whatsappNumber)}</td>
        <td data-label="Status">${v.eligible ? `<span class="pill ok">Eligible</span>` : `<span class="pill bad">Excluded</span>`}<br><span class="muted">${esc(v.exclusionReason || "")}</span></td>
        <td data-label="Code">${token ? (token.usedAt ? `<span class="pill bad">Used</span>` : `<span class="pill ok">Issued</span>`) : `<span class="pill">None</span>`}</td>
        <td data-label="Edit">
          <form method="post" action="/admin/voters/update">
            <input type="hidden" name="id" value="${esc(v.id)}">
            <input name="fullName" value="${esc(v.fullName)}" required>
            <input name="whatsappNumber" value="${esc(v.whatsappNumber)}" placeholder="WhatsApp number">
            <select name="eligible"><option value="true" ${v.eligible ? "selected" : ""}>Eligible</option><option value="false" ${!v.eligible ? "selected" : ""}>Ineligible</option></select>
            <input name="exclusionReason" value="${esc(v.exclusionReason || "")}" placeholder="Exclusion reason">
            <button type="submit">Save</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");
  return `<section>
    <h2>Registered voters</h2>
    <form method="post" action="/admin/voters/add">
      <div class="row">
        <div><label>Full name</label><input name="fullName" required></div>
        <div><label>WhatsApp number</label><input name="whatsappNumber"></div>
        <div><label>Eligibility</label><select name="eligible"><option value="true">Eligible</option><option value="false">Ineligible</option></select></div>
        <div><label>Exclusion reason</label><input name="exclusionReason" placeholder="Example: ELECO member"></div>
        <div><button type="submit">Add voter</button></div>
      </div>
    </form>
    <form method="post" action="/admin/voters/import">
      <label>Bulk import voters</label>
      <textarea name="voters" placeholder="One voter per line: Full Name, WhatsApp Number"></textarea>
      <p><button class="secondary" type="submit">Import list</button></p>
    </form>
    <div style="overflow:auto">
      <table>
        <thead><tr><th>Name</th><th>WhatsApp</th><th>Status</th><th>Code</th><th>Edit</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5">No voters yet.</td></tr>`}</tbody>
      </table>
    </div>
  </section>`;
}

function officeAdmin(st) {
  const officeOptions = st.offices.map((o) => `<option value="${esc(o.id)}">${esc(o.title)}</option>`).join("");
  const offices = st.offices
    .slice()
    .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0))
    .map((office) => {
      const candidates = st.candidates.filter((c) => c.officeId === office.id);
      return `<div class="panel">
        <h3>${esc(office.title)}</h3>
        <p class="muted">Seats: ${esc(office.seatsAvailable || 1)} | Order: ${esc(office.displayOrder || 0)}</p>
        <ul>${candidates.map((c) => `<li>${esc(c.displayName || c.fullName)} <span class="muted">(${esc(c.status || "active")})</span></li>`).join("") || "<li>No candidates yet.</li>"}</ul>
      </div>`;
    })
    .join("");
  return `<section>
    <h2>Offices and candidates</h2>
    <div class="grid">
      <form method="post" action="/admin/offices/add" class="panel">
        <h3>Add office</h3>
        <label>Office title</label><input name="title" required placeholder="President">
        <label>Seats available</label><input name="seatsAvailable" type="number" min="1" value="1">
        <label>Display order</label><input name="displayOrder" type="number" value="${st.offices.length + 1}">
        <p><button type="submit">Add office</button></p>
      </form>
      <form method="post" action="/admin/candidates/add" class="panel">
        <h3>Add candidate</h3>
        <label>Office</label><select name="officeId" required>${officeOptions}</select>
        <label>Full name</label><input name="fullName" required>
        <label>Display name</label><input name="displayName">
        <p><button type="submit">Add candidate</button></p>
      </form>
    </div>
    <div class="grid">${offices || `<p class="muted">No offices yet.</p>`}</div>
  </section>`;
}

function tokenAdmin(st) {
  return `<section>
    <h2>Voting codes</h2>
    <p class="muted">Codes are linked to specific eligible voters. Send each code or private link by WhatsApp direct message.</p>
    <form method="post" action="/admin/tokens/generate">
      <button type="submit">Generate missing eligible voter codes</button>
    </form>
  </section>`;
}

function auditAdmin(st) {
  const recent = st.audit.slice(-10).reverse();
  return `<section>
    <h2>Recent audit log</h2>
    <table>
      <thead><tr><th>Time</th><th>Actor</th><th>Event</th><th>Details</th></tr></thead>
      <tbody>${recent.map((a) => `<tr><td data-label="Time">${esc(a.createdAt)}</td><td data-label="Actor">${esc(a.actorType)} ${esc(a.actorId || "")}</td><td data-label="Event">${esc(a.eventType)}</td><td data-label="Details">${esc(JSON.stringify(a.metadata || {}))}</td></tr>`).join("") || `<tr><td colspan="4">No audit events yet.</td></tr>`}</tbody>
    </table>
  </section>`;
}

function logAudit(actorType, actorId, eventType, metadata) {
  const audit = load(files.audit);
  audit.push({ id: id("audit"), actorType, actorId, eventType, metadata, createdAt: nowIso() });
  save(files.audit, audit);
}

function reportData() {
  const st = state();
  const results = buildResults();
  const eligibleIds = new Set(st.voters.filter((v) => v.eligible).map((v) => v.id));
  const votedIds = new Set(st.tokens.filter((t) => t.usedAt).map((t) => t.voterId));
  const choicesByVoter = {};
  for (const vote of st.votes) {
    const office = st.offices.find((o) => o.id === vote.officeId);
    const candidate = st.candidates.find((c) => c.id === vote.candidateId);
    const voter = st.voters.find((v) => v.id === vote.voterId);
    if (!voter) continue;
    choicesByVoter[voter.id] ||= { voter: voter.fullName, whatsappNumber: voter.whatsappNumber, castAt: vote.castAt, choices: [] };
    choicesByVoter[voter.id].choices.push({ office: office?.title || vote.officeId, candidate: candidate?.displayName || candidate?.fullName || vote.candidateId });
  }
  return {
    election: st.election,
    summary: results.summary,
    results: results.offices,
    votersWhoVoted: st.voters.filter((v) => votedIds.has(v.id)).map((v) => ({ name: v.fullName, whatsappNumber: v.whatsappNumber })),
    eligibleVotersWhoDidNotVote: st.voters.filter((v) => eligibleIds.has(v.id) && !votedIds.has(v.id)).map((v) => ({ name: v.fullName, whatsappNumber: v.whatsappNumber })),
    excludedVoters: st.voters.filter((v) => !v.eligible).map((v) => ({ name: v.fullName, whatsappNumber: v.whatsappNumber, reason: v.exclusionReason || "" })),
    confidentialChoices: Object.values(choicesByVoter),
    audit: st.audit,
    snapshots: st.snapshots,
  };
}

function reportPage() {
  const report = reportData();
  return layout(
    "ELECO Confidential Report",
    `<section>
      <h2>Confidential ELECO report</h2>
      <p class="muted">Do not share this page with the general WhatsApp group. Public results are available at /results.</p>
      <p><a class="button secondary" href="/admin/report.json">Download JSON report</a></p>
      <div class="stats">
        <div class="stat">Registered<strong>${report.summary.registered}</strong></div>
        <div class="stat">Eligible<strong>${report.summary.eligible}</strong></div>
        <div class="stat">Excluded<strong>${report.summary.excluded}</strong></div>
        <div class="stat">Votes cast<strong>${report.summary.votesCast}</strong></div>
        <div class="stat">Turnout<strong>${report.summary.turnout}%</strong></div>
      </div>
    </section>
    <section><h2>Result totals</h2>${renderResultsHtml({ summary: report.summary, offices: report.results })}</section>
    <section><h2>Voters who voted</h2>${simpleList(report.votersWhoVoted, "No votes yet.")}</section>
    <section><h2>Eligible voters who did not vote</h2>${simpleList(report.eligibleVotersWhoDidNotVote, "None.")}</section>
    <section><h2>Excluded voters</h2>${simpleList(report.excludedVoters, "None.")}</section>
    <section><h2>Voter-by-voter choices</h2>${choiceList(report.confidentialChoices)}</section>`,
    { admin: true }
  );
}

function simpleList(items, empty) {
  if (!items.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<table><tbody>${items.map((item) => `<tr>${Object.values(item).map((value) => `<td>${esc(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function choiceList(items) {
  if (!items.length) return `<p class="muted">No submitted votes yet.</p>`;
  return `<table><thead><tr><th>Voter</th><th>WhatsApp</th><th>Choices</th></tr></thead><tbody>${items
    .map((item) => `<tr><td data-label="Voter">${esc(item.voter)}</td><td data-label="WhatsApp">${esc(item.whatsappNumber)}</td><td data-label="Choices">${item.choices.map((c) => `${esc(c.office)}: ${esc(c.candidate)}`).join("<br>")}</td></tr>`)
    .join("")}</tbody></table>`;
}

async function handleAdminPost(req, res, pathname) {
  const form = await readBody(req);
  const st = state();
  if (pathname === "/admin/election") {
    st.election.title = form.get("title") || st.election.title;
    st.election.status = form.get("status") || st.election.status;
    st.election.timezone = form.get("timezone") || st.election.timezone;
    st.election.opensAt = fromLocalInput(form.get("opensAt"));
    st.election.closesAt = fromLocalInput(form.get("closesAt"));
    save(files.election, st.election);
    logAudit("admin", "admin", "election_updated", { status: st.election.status });
    return redirect(res, "/admin?saved=election");
  }
  if (pathname === "/admin/register/lock") {
    st.election.registerLockedAt = nowIso();
    const snapshot = { id: id("snapshot"), electionId: st.election.id, snapshotAt: st.election.registerLockedAt, voterCount: st.voters.length, voters: st.voters };
    st.snapshots.push(snapshot);
    save(files.election, st.election);
    save(files.snapshots, st.snapshots);
    logAudit("admin", "admin", "register_locked", { voterCount: st.voters.length });
    return redirect(res, "/admin?saved=register-locked");
  }
  if (pathname === "/admin/voters/add") {
    if (st.election.registerLockedAt) return send(res, 400, layout("Register locked", `<section><p class="error">The register is locked. Additions are blocked.</p><p><a class="button" href="/admin">Back</a></p></section>`, { admin: true }));
    const voter = {
      id: id("voter"),
      fullName: String(form.get("fullName") || "").trim(),
      whatsappNumber: String(form.get("whatsappNumber") || "").trim(),
      registeredAt: nowIso(),
      eligible: form.get("eligible") === "true",
      exclusionReason: String(form.get("exclusionReason") || "").trim(),
    };
    if (voter.fullName) {
      st.voters.push(voter);
      save(files.voters, st.voters);
      logAudit("admin", "admin", "voter_added", { voterId: voter.id, fullName: voter.fullName });
    }
    return redirect(res, "/admin?saved=voter");
  }
  if (pathname === "/admin/voters/update") {
    if (st.election.registerLockedAt) return send(res, 400, layout("Register locked", `<section><p class="error">The register is locked. Voter edits are blocked.</p><p><a class="button" href="/admin">Back</a></p></section>`, { admin: true }));
    const voter = st.voters.find((v) => v.id === form.get("id"));
    if (voter) {
      voter.fullName = String(form.get("fullName") || "").trim();
      voter.whatsappNumber = String(form.get("whatsappNumber") || "").trim();
      voter.eligible = form.get("eligible") === "true";
      voter.exclusionReason = String(form.get("exclusionReason") || "").trim();
      save(files.voters, st.voters);
      logAudit("admin", "admin", "voter_updated", { voterId: voter.id });
    }
    return redirect(res, "/admin?saved=voter");
  }
  if (pathname === "/admin/voters/import") {
    if (st.election.registerLockedAt) return send(res, 400, layout("Register locked", `<section><p class="error">The register is locked. Imports are blocked.</p><p><a class="button" href="/admin">Back</a></p></section>`, { admin: true }));
    const lines = String(form.get("voters") || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let count = 0;
    for (const line of lines) {
      const [name, phone = ""] = line.split(",").map((part) => part.trim());
      if (!name) continue;
      st.voters.push({ id: id("voter"), fullName: name, whatsappNumber: phone, registeredAt: nowIso(), eligible: true, exclusionReason: "" });
      count++;
    }
    save(files.voters, st.voters);
    logAudit("admin", "admin", "voters_imported", { count });
    return redirect(res, `/admin?saved=${count}-voters-imported`);
  }
  if (pathname === "/admin/offices/add") {
    const office = { id: id("office"), electionId: st.election.id, title: String(form.get("title") || "").trim(), seatsAvailable: Number(form.get("seatsAvailable") || 1), displayOrder: Number(form.get("displayOrder") || st.offices.length + 1) };
    if (office.title) {
      st.offices.push(office);
      save(files.offices, st.offices);
      logAudit("admin", "admin", "office_added", { officeId: office.id, title: office.title });
    }
    return redirect(res, "/admin?saved=office");
  }
  if (pathname === "/admin/candidates/add") {
    const candidate = { id: id("candidate"), officeId: form.get("officeId"), fullName: String(form.get("fullName") || "").trim(), displayName: String(form.get("displayName") || "").trim(), status: "active" };
    if (candidate.officeId && candidate.fullName) {
      st.candidates.push(candidate);
      save(files.candidates, st.candidates);
      logAudit("admin", "admin", "candidate_added", { candidateId: candidate.id, fullName: candidate.fullName });
    }
    return redirect(res, "/admin?saved=candidate");
  }
  if (pathname === "/admin/tokens/generate") {
    const generated = [];
    for (const voter of st.voters.filter((v) => v.eligible)) {
      const hasActive = st.tokens.some((t) => t.voterId === voter.id && !t.revokedAt && !t.usedAt);
      if (hasActive) continue;
      const code = newCode();
      const token = { id: id("token"), electionId: st.election.id, voterId: voter.id, tokenHash: hashToken(code), issuedAt: nowIso(), usedAt: "", revokedAt: "", codeSuffix: code.slice(-4) };
      st.tokens.push(token);
      generated.push({ voter, code, link: `${BASE_URL}/vote?code=${encodeURIComponent(code)}` });
    }
    save(files.tokens, st.tokens);
    logAudit("admin", "admin", "tokens_generated", { count: generated.length });
    const body = generated.map((g) => `${g.voter.fullName}, ${g.voter.whatsappNumber}, Code: ${g.code}, Link: ${g.link}`).join("\n");
    return send(
      res,
      200,
      layout(
        "Generated Voting Codes",
        `<section><h2>Generated voting codes</h2><p class="muted">Copy these now and send privately by WhatsApp. Raw codes are not stored; if a code is lost, generate a new one for that voter after revoking the old token manually in data/tokens.json.</p><textarea readonly>${esc(body || "No new codes were needed.")}</textarea><p><a class="button" href="/admin">Back to admin</a></p></section>`,
        { admin: true }
      )
    );
  }
  return send(res, 404, "Not found");
}

async function handleVoteSubmit(req, res) {
  const form = await readBody(req);
  const code = String(form.get("code") || "").trim();
  const st = state();
  const token = findToken(st, code);
  if (!token) {
    logAudit("voter", "", "invalid_code_submit", { codeSuffix: code.slice(-4) });
    return send(res, 400, publicHome("Invalid voting code."));
  }
  const voter = st.voters.find((v) => v.id === token.voterId);
  if (!voter || !voter.eligible) {
    logAudit("voter", token.voterId, "ineligible_vote_attempt", {});
    return send(res, 403, publicHome("This code is not eligible to vote."));
  }
  if (token.usedAt) {
    logAudit("voter", voter.id, "duplicate_vote_attempt", {});
    return send(res, 409, renderVotePage(code));
  }
  const open = electionOpenStatus(st.election);
  if (!open.ok) return send(res, 403, renderVotePage(code, open.message));
  const offices = st.offices.filter((office) => st.candidates.some((c) => c.officeId === office.id && c.status !== "inactive"));
  const selections = [];
  for (const office of offices) {
    const candidateId = form.get(`office_${office.id}`);
    const validCandidate = st.candidates.some((c) => c.id === candidateId && c.officeId === office.id && c.status !== "inactive");
    if (!validCandidate) return send(res, 400, renderVotePage(code, `Please choose a valid candidate for ${office.title}.`));
    selections.push({ officeId: office.id, candidateId });
  }
  const castAt = nowIso();
  for (const selection of selections) {
    st.votes.push({ id: id("vote"), electionId: st.election.id, officeId: selection.officeId, candidateId: selection.candidateId, voterId: voter.id, castAt });
  }
  token.usedAt = castAt;
  save(files.votes, st.votes);
  save(files.tokens, st.tokens);
  logAudit("voter", voter.id, "vote_submitted", { officeCount: selections.length });
  return send(
    res,
    200,
    layout(st.election.title, `<section><h2>Vote submitted</h2><p class="ok">Thank you, ${esc(voter.fullName)}. Your vote has been recorded.</p><p><a class="button secondary" href="/results">View public results</a></p></section>`)
  );
}

async function router(req, res) {
  try {
    const url = new URL(req.url, BASE_URL);
    const pathname = url.pathname;
    if (req.method === "GET" && pathname === "/") return send(res, 200, publicHome());
    if (req.method === "POST" && pathname === "/enter-code") {
      const form = await readBody(req);
      return redirect(res, `/vote?code=${encodeURIComponent(String(form.get("code") || "").trim())}`);
    }
    if (req.method === "GET" && pathname === "/vote") return send(res, 200, renderVotePage(url.searchParams.get("code") || ""));
    if (req.method === "POST" && pathname === "/vote") return handleVoteSubmit(req, res);
    if (req.method === "GET" && pathname === "/results") return send(res, 200, resultsPage());
    if (req.method === "GET" && pathname === "/api/results") {
      const data = buildResults();
      return send(res, 200, JSON.stringify({ ...data, html: renderResultsHtml(data) }), "application/json; charset=utf-8");
    }
    if (pathname === "/admin/login" && req.method === "POST") {
      const form = await readBody(req);
      if (form.get("password") === ADMIN_PASSWORD) {
        setAdminCookie(res);
        logAudit("admin", "admin", "admin_login", {});
        return redirect(res, "/admin");
      }
      logAudit("unknown", "", "failed_admin_login", {});
      return send(res, 403, adminLogin("Incorrect password."));
    }
    if (pathname === "/admin/logout" && req.method === "POST") {
      clearAdminCookie(res);
      return redirect(res, "/admin");
    }
    if (pathname.startsWith("/admin")) {
      if (!isAdmin(req)) return send(res, 200, adminLogin());
      if (req.method === "GET" && pathname === "/admin") return send(res, 200, adminPage(url.searchParams.get("saved") ? `Saved: ${url.searchParams.get("saved")}` : ""));
      if (req.method === "GET" && pathname === "/admin/report") return send(res, 200, reportPage());
      if (req.method === "GET" && pathname === "/admin/report.json") return send(res, 200, JSON.stringify(reportData(), null, 2), "application/json; charset=utf-8");
      if (req.method === "POST") return handleAdminPost(req, res, pathname);
    }
    return send(res, 404, layout("Not found", `<section><p>Page not found.</p></section>`));
  } catch (error) {
    console.error(error);
    return send(res, 500, layout("Server error", `<section><p class="error">${esc(error.message)}</p></section>`));
  }
}

ensureData();
http.createServer(router).listen(PORT, HOST, () => {
  console.log(`NACO 94 voting app running at ${BASE_URL}`);
  console.log(`Admin page: ${BASE_URL}/admin`);
  if (ADMIN_PASSWORD === "change-this-admin-password") {
    console.log("WARNING: set ADMIN_PASSWORD before using this for a real election.");
  }
});
