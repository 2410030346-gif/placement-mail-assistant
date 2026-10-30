const $ = (id) => document.getElementById(id);

// Escape text from the AI before putting it into the page
const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

const norm = (s) => String(s ?? "").trim().toLowerCase();
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const pad = (n) => String(n).padStart(2, "0");

/* ---------- Profile ---------- */

function getProfile() {
    return {
        batch: $("batch").value.trim(),
        branch: $("branch").value.trim(),
        cgpa: parseFloat($("cgpa").value)
    };
}

function saveProfile() {
    try {
        localStorage.setItem("profile", JSON.stringify({
            batch: $("batch").value,
            branch: $("branch").value,
            cgpa: $("cgpa").value
        }));
    } catch (e) { /* storage unavailable, ignore */ }
}

function loadProfile() {
    try {
        const p = JSON.parse(localStorage.getItem("profile")) || {};
        $("batch").value = p.batch || "";
        $("branch").value = p.branch || "";
        $("cgpa").value = p.cgpa || "";
    } catch (e) { /* ignore */ }
}

/* ---------- Deadline helpers ---------- */

function parseDeadline(text) {
    const m = String(text || "").match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59);
}

function countdown(deadline) {
    const date = parseDeadline(deadline);
    if (!date) return { text: "Deadline not found", cls: "warn" };

    const diff = date - new Date();
    if (diff <= 0) return { text: "Deadline passed", cls: "danger" };

    const hours = diff / 36e5;
    if (hours < 24) {
        return { text: `${Math.ceil(hours)} hour(s) left`, cls: "danger" };
    }
    const days = Math.ceil(hours / 24);
    return { text: `${days} day(s) remaining`, cls: days <= 3 ? "warn" : "ok" };
}

/* ---------- Eligibility (plain code, not AI) ---------- */

function checkEligibility(job, p) {
    if (!p.batch || !p.branch || isNaN(p.cgpa)) {
        return { cls: "maybe", icon: "📝", title: "Fill in your profile",
                 detail: "Add your batch, branch and CGPA to check eligibility." };
    }

    const problems = [];
    const unknown = [];

    const batches = asList(job.eligible_batches).map(norm);
    if (batches.length) {
        if (!batches.includes(norm(p.batch))) problems.push(`Open to batch ${asList(job.eligible_batches).join(", ")}, not ${p.batch}`);
    } else unknown.push("batch");

    const branches = asList(job.eligible_branches).map(norm);
    if (branches.length) {
        const ok = branches.some((b) => b === norm(p.branch) || b.includes("all"));
        if (!ok) problems.push(`Open to ${asList(job.eligible_branches).join(", ")}, not ${p.branch}`);
    } else unknown.push("branch");

    const min = parseFloat(job.min_cgpa);
    if (!isNaN(min)) {
        if (p.cgpa < min) problems.push(`Needs CGPA ${min} or higher, you have ${p.cgpa}`);
    } else unknown.push("CGPA");

    if (problems.length) {
        return { cls: "no", icon: "❌", title: "Not eligible", detail: problems.join(". ") };
    }
    if (unknown.length) {
        return { cls: "maybe", icon: "⚠️", title: "Possibly eligible",
                 detail: `The email does not state the ${unknown.join(", ")} requirement. Check the original.` };
    }
    return { cls: "yes", icon: "✅", title: "You are eligible", detail: "Your batch, branch and CGPA all match." };
}

/* ---------- Rendering ---------- */

function proofBadge(job, field) {
    const quote = job.evidence && job.evidence[field];
    const verified = job.evidence_verified && job.evidence_verified[field];
    if (quote && verified) {
        return `<details class="proof ok"><summary>✓ Found in the email</summary><blockquote>${esc(quote)}</blockquote></details>`;
    }
    if (quote && !verified) {
        return `<div class="proof bad"><span class="chip">⚠ Could not verify</span><span class="hint">Check this against the original email.</span></div>`;
    }
    return "";
}

function tile(label, value, i, extra = "", wide = false) {
    return `<div class="tile${wide ? " wide" : ""}" style="--i:${i}">
        <div class="label">${esc(label)}</div>
        <div class="value">${value}</div>
        ${extra}
    </div>`;
}

function renderResult(job) {
    const profile = getProfile();
    const elig = checkEligibility(job, profile);
    const cd = countdown(job.deadline);
    const none = "Not stated";

    $("result").innerHTML = `
    <div class="card">
        <h2>Results</h2>

        <div class="verdict ${elig.cls}">
            <span class="icon">${elig.icon}</span>
            <div><strong>${esc(elig.title)}</strong><small>${esc(elig.detail)}</small></div>
        </div>

        <div class="grid">
            ${tile("Company", esc(job.company) || none, 0)}
            ${tile("Role", esc(job.role) || none, 1)}
            ${tile("Stipend", esc(job.stipend) || none, 2, proofBadge(job, "stipend"))}
            ${tile("Deadline", `${esc(job.deadline) || none} <span class="pill ${cd.cls}">${esc(cd.text)}</span>`, 3, proofBadge(job, "deadline"))}
            ${tile("Minimum CGPA", esc(job.min_cgpa) || none, 4)}
            ${tile("Eligible batches", esc(asList(job.eligible_batches).join(", ")) || none, 5)}
            ${tile("Eligible branches", esc(asList(job.eligible_branches).join(", ")) || none, 6, proofBadge(job, "eligibility"))}
            ${tile("Selection rounds", esc(asList(job.rounds).join(", ")) || none, 7, "", true)}
        </div>

        <button onclick="saveOpportunity()">Save opportunity</button>
        <button class="ghost" onclick="addToCalendar()">📅 Add to calendar</button>
    </div>`;
}

/* ---------- Analyze ---------- */

async function analyzeEmail() {
    const emailText = $("emailText").value.trim();
    if (!emailText) {
        $("result").innerHTML = `<div class="card note">Paste a placement email first.</div>`;
        return;
    }

    const btn = $("analyzeBtn");
    btn.disabled = true;
    saveProfile();
    $("result").innerHTML = `<div class="card loading"><div class="spinner"></div><p>Reading the email...</p></div>`;

    try {
        const response = await fetch("/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email_text: emailText })
        });
        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || "The server could not read that email.");
        }

        window.currentJob = data;
        renderResult(data);
    } catch (error) {
        $("result").innerHTML = `<div class="card note">${esc(error.message)} Try again in a moment.</div>`;
    } finally {
        btn.disabled = false;
    }
}

/* ---------- Saved opportunities ---------- */

function readSaved() {
    try { return JSON.parse(localStorage.getItem("savedJobs")) || []; }
    catch (e) { return []; }
}

function saveOpportunity() {
    if (!window.currentJob) return;
    const jobs = readSaved();
    jobs.push(window.currentJob);
    try { localStorage.setItem("savedJobs", JSON.stringify(jobs)); } catch (e) { /* ignore */ }
    loadSavedJobs();
}

function removeJob(index) {
    const jobs = readSaved();
    jobs.splice(index, 1);
    try { localStorage.setItem("savedJobs", JSON.stringify(jobs)); } catch (e) { /* ignore */ }
    loadSavedJobs();
}

function loadSavedJobs() {
    const jobs = readSaved().map((job, index) => ({ job, index }));
    // Nearest deadline first, jobs without a deadline last
    jobs.sort((a, b) => {
        const da = parseDeadline(a.job.deadline), db = parseDeadline(b.job.deadline);
        return (da ? da.getTime() : Infinity) - (db ? db.getTime() : Infinity);
    });

    let html = "<h2>Saved opportunities</h2>";
    if (!jobs.length) {
        html += `<p class="empty">Nothing saved yet. Analyze an email and save it here.</p>`;
    }
    jobs.forEach(({ job, index }) => {
        const cd = countdown(job.deadline);
        html += `<div class="job">
            <div>
                <strong>${esc(job.company) || "Unknown company"}</strong>
                <small>${esc(job.role) || "Role not stated"}</small>
                <span class="pill ${cd.cls}">${esc(cd.text)}</span>
            </div>
            <button class="ghost" onclick="removeJob(${index})">Remove</button>
        </div>`;
    });
    $("savedJobs").innerHTML = html;
}

/* ---------- Calendar ---------- */

function addToCalendar() {
    const job = window.currentJob;
    if (!job) return;

    const title = `Apply: ${job.company || "Placement"} - ${job.role || ""}`.trim();
    let url = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
        `&text=${encodeURIComponent(title)}` +
        `&details=${encodeURIComponent("Application deadline. Confirm details in the original email.")}`;

    const start = parseDeadline(job.deadline);
    if (start) {
        const end = new Date(start.getTime() + 30 * 60000);
        const fmt = (d) =>
            `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
        url += `&dates=${fmt(start)}/${fmt(end)}&ctz=Asia/Kolkata`;
    }
    window.open(url, "_blank");
}

window.onload = () => {
    loadProfile();
    loadSavedJobs();
};