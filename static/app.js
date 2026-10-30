async function analyzeEmail() {

    document.getElementById("result").innerHTML =
        "<h2>Analyzing email...</h2>";

    const batch =
        document.getElementById("batch").value;

    const branch =
        document.getElementById("branch").value;

    const cgpa =
        parseFloat(document.getElementById("cgpa").value);

    const emailText =
        document.getElementById("emailText").value;

    const response = await fetch("/extract", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email_text: emailText
        })
    });

    const data = await response.json();

    let eligibilityMessage = "⚠️ Cannot Determine";

    const eligibleBatches =
        data.eligible_batches || [];

    const minCGPA =
        parseFloat(data.min_cgpa) || 0;

    if (
        eligibleBatches.includes(batch) &&
        cgpa >= minCGPA
    ) {
        eligibilityMessage = "✅ Eligible";
    } else {
        eligibilityMessage = "❌ Not Eligible";
    }

    window.currentJob = data;

    let countdownText = "Deadline unavailable";

    try {

        const cleanDeadline =
            (data.deadline || "").replace(" IST", "");

        const deadlineDate =
            new Date(cleanDeadline);

        const today =
            new Date();

        const difference =
            deadlineDate - today;

        const days =
            Math.ceil(
                difference /
                (1000 * 60 * 60 * 24)
            );

        if (!isNaN(days)) {

            if (days > 0) {
                countdownText =
                    `⏰ ${days} day(s) remaining`;
            }
            else {
                countdownText =
                    "⚠️ Deadline Passed";
            }
        }

    } catch (error) {

        countdownText =
            "Deadline unavailable";
    }

    document.getElementById("result").innerHTML = `
        <h2>Results</h2>

        <p><strong>Company:</strong> ${data.company || "Not Found"}</p>

        <p><strong>Role:</strong> ${data.role || "Not Found"}</p>

        <p><strong>Stipend:</strong> ${data.stipend || "Not Found"}</p>

        <p><strong>Deadline:</strong> ${data.deadline || "Not Found"}</p>

        <p><strong>${countdownText}</strong></p>

        <p><strong>Minimum CGPA:</strong> ${data.min_cgpa || "Not Found"}</p>

        <p><strong>Eligible Batches:</strong>
        ${(data.eligible_batches || []).join(", ")}</p>

        <p><strong>Eligible Branches:</strong>
        ${(data.eligible_branches || []).join(", ")}</p>

        <p><strong>Rounds:</strong>
        ${(data.rounds || []).join(", ")}</p>

        <h3>${eligibilityMessage}</h3>

        <button onclick="saveOpportunity()">
            Save Opportunity
        </button>

        <button onclick="addToCalendar()">
            📅 Add To Calendar
        </button>
    `;
}

function saveOpportunity() {

    if (!window.currentJob) {
        return;
    }

    let savedJobs =
        JSON.parse(localStorage.getItem("savedJobs")) || [];

    savedJobs.push(window.currentJob);

    localStorage.setItem(
        "savedJobs",
        JSON.stringify(savedJobs)
    );

    loadSavedJobs();
}

function loadSavedJobs() {

    let savedJobs =
        JSON.parse(localStorage.getItem("savedJobs")) || [];

    let html = "<h2>Saved Opportunities</h2>";

    savedJobs.forEach((job, index) => {

        html += `
            <div>
                <strong>${index + 1}. ${job.company}</strong>
                <br>
                ${job.role}
                <hr>
            </div>
        `;
    });

    document.getElementById("savedJobs").innerHTML =
        html;
}

function addToCalendar() {

    if (!window.currentJob) {
        return;
    }

    const title =
        `${window.currentJob.company} - ${window.currentJob.role}`;

    const details =
        "Application Deadline";

    const url =
        `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}`;

    window.open(url, "_blank");
}

window.onload = loadSavedJobs;