const input = document.getElementById("question-input");
const results = document.getElementById("results");
const sendBtn = document.getElementById("send-btn");
const tablesList = document.getElementById("tables-list");

// Load available tables on page load
document.addEventListener("DOMContentLoaded", () => {
    input.focus();
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    });
    fetchTables();
});

async function fetchTables() {
    try {
        const resp = await fetch("/api/tables");
        const data = await resp.json();
        tablesList.innerHTML = "";
        (data.tables || []).forEach((t) => {
            const wrapper = document.createElement("div");
            wrapper.className = "table-wrapper";

            const tag = document.createElement("span");
            tag.className = "table-tag";
            tag.innerHTML = `${t.name}<span class="count">(${t.rows} rows)</span>`;
            tag.style.cursor = "pointer";
            tag.onclick = () => showColumns(t.name, tag);
            wrapper.appendChild(tag);

            const colsDiv = document.createElement("div");
            colsDiv.className = "table-columns";
            colsDiv.textContent = "";
            wrapper.appendChild(colsDiv);

            tablesList.appendChild(wrapper);
        });
    } catch (e) {
        console.error("Table fetch error:", e);
        tablesList.innerHTML = `<span style="color:#f85149;font-size:0.8rem;">Could not connect to server (check it is running on port 8000)</span>`;
    }
}

async function showColumns(tableName, tag) {
    document.querySelectorAll(".table-tag.selected").forEach(el => el.classList.remove("selected"));
    document.querySelectorAll(".table-columns.expanded").forEach(el => {
        el.classList.remove("expanded");
        el.textContent = "";
    });

    tag.classList.add("selected");
    const wrapper = tag.parentElement;
    const colsDiv = wrapper.querySelector(".table-columns");

    if (colsDiv.classList.contains("expanded")) {
        tag.classList.remove("selected");
        colsDiv.classList.remove("expanded");
        return;
    }

    tag.classList.add("selected");
    colsDiv.classList.add("expanded");

    try {
        const resp = await fetch(`/api/tables/columns/${encodeURIComponent(tableName)}`);
        const data = await resp.json();

        if (data.columns) {
            const cols = data.columns;
            cols.forEach(col => {
                const span = document.createElement("span");
                let label = col.name;
                if (col.pk) label += " [PK]";
                span.className = "col-name";
                span.textContent = label;
                colsDiv.appendChild(span);
            });
        } else if (data.error) {
            colsDiv.textContent = data.error;
        }
    } catch (e) {
        colsDiv.textContent = "Could not fetch columns";
    }
}

function trySample(text) {
    input.value = text;
    submit();
}

async function submit() {
    const question = input.value.trim();
    if (!question) return;

    input.value = "";
    sendBtn.disabled = true;
    sendBtn.textContent = "...";

    // Build pipeline block (4 stages: LLM → Guardrails → SQLite → Results)
    const pipeline = buildPipelineBlock();
    // Build question block
    const qBlock = document.createElement("div");
    qBlock.className = "result-block";
    qBlock.innerHTML = `<div class="result-header"><span class="q-text">${escapeHtml(question)}</span></div>`;

    // Insert pipeline, then question block
    results.insertBefore(pipeline.block, results.firstChild);
    results.insertBefore(qBlock, pipeline.block.nextSibling);

    const list = pipeline.list;
    const statusEl = list.querySelectorAll(".step-status");
    const steps = list.querySelectorAll(".pipeline-step");

    // Start: LLM step active, others waiting
    steps[0].classList.add("active");
    statusEl[0].textContent = "Calling Qwen 35B...";
    statusEl[0].className = "step-status running";

    try {
        const resp = await fetch("/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question }),
        });

        if (!resp.ok) {
            const text = await resp.text();
            let errBody;
            try { errBody = JSON.parse(text); } catch { errBody = { error: text }; }
            statusEl[0].textContent = "✗ " + (errBody.error || `Server error ${resp.status}`);
            statusEl[0].className = "step-status error";
            appendError(qBlock, errBody.error || `Server error ${resp.status}`);
            return;
        }

        const data = await resp.json();

        // Step 1: LLM status
        if (data.sql) {
            statusEl[0].textContent = "SQL generated";
            statusEl[0].className = "step-status success";
        } else {
            statusEl[0].textContent = "✗ " + (data.error || "Unknown error");
            statusEl[0].className = "step-status error";
            appendError(qBlock, data.error || "Unknown error");
            return;
        }

        // Step 2: Guardrails
        steps[1].classList.add("active");
        statusEl[1].textContent = "validating...";
        statusEl[1].className = "step-status running";

        if (data.error && data.error.startsWith("Guardrail blocked")) {
            statusEl[1].textContent = "✗ BLOCKED";
            statusEl[1].className = "step-status error";
            appendError(qBlock, data.error);
            if (data.sql) {
                qBlock.appendChild(buildSqlBlock(data.sql, "Guardrails blocked: " + data.error));
            }
            return;
        }

        statusEl[1].textContent = "passed";
        statusEl[1].className = "step-status success";

        // Step 3: SQLite
        steps[2].classList.add("active");
        statusEl[2].textContent = "executing...";
        statusEl[2].className = "step-status running";

        if (data.results && data.results.length > 0) {
            statusEl[2].textContent = `${data.results.length} rows`;
            statusEl[2].className = "step-status success";
        } else if (data.sql && !data.results) {
            statusEl[2].textContent = "no results";
            statusEl[2].className = "step-status";
        } else {
            statusEl[2].textContent = "✗ error";
            statusEl[2].className = "step-status error";
            appendError(qBlock, data.error || "Execution error");
            return;
        }

        // Step 4: Results
        steps[3].classList.add("active");
        statusEl[3].textContent = "rendered";
        statusEl[3].className = "step-status success";

        const resultSection = buildResultSection(data);
        qBlock.appendChild(resultSection);

    } catch (e) {
        console.error("API error:", e);
        statusEl[0].textContent = "Connection failed: " + e.message;
        statusEl[0].className = "step-status error";
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
        input.focus();
    }
}

function buildPipelineBlock() {
    const block = document.createElement("div");
    block.className = "pipeline-block";

    const header = document.createElement("button");
    header.className = "pipeline-toggle-btn";
    header.textContent = "Show pipeline";

    const list = document.createElement("ol");
    list.className = "pipeline-stages";
    list.innerHTML = `
        <li class="pipeline-step">
            <span class="step-label">1. LLM (Qwen 35B)</span>
            <span class="step-status">Waiting...</span>
        </li>
        <li class="pipeline-step">
            <span class="step-label">2. Guardrails</span>
            <span class="step-status">Waiting...</span>
        </li>
        <li class="pipeline-step">
            <span class="step-label">3. SQLite</span>
            <span class="step-status">Waiting...</span>
        </li>
        <li class="pipeline-step">
            <span class="step-label">4. Results</span>
            <span class="step-status">Waiting...</span>
        </li>
    `;

    block.appendChild(header);
    block.appendChild(list);

    let open = false;
    header.onclick = () => {
        open = !open;
        list.classList.toggle("visible", open);
        header.textContent = open ? "Hide pipeline" : "Show pipeline";
    };

    return { block, list, header };
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function appendError(container, message) {
    const errEl = document.createElement("div");
    errEl.className = "error-msg";
    errEl.textContent = message;
    container.appendChild(errEl);
}

function buildSqlBlock(sql, label) {
    const sqlBlock = document.createElement("div");
    sqlBlock.className = "sql-block";
    const labelEl = document.createElement("div");
    labelEl.className = "sql-label";
    labelEl.textContent = label || "Generated SQL:";
    sqlBlock.appendChild(labelEl);
    sqlBlock.appendChild(document.createTextNode(sql));
    return sqlBlock;
}

function buildExplanationBlock(explanation) {
    const el = document.createElement("div");
    el.className = "explanation-block";

    const label = document.createElement("div");
    label.className = "explanation-label";
    label.textContent = "How this SQL was built:";
    el.appendChild(label);

    const ul = document.createElement("ul");
    ul.className = "explanation-list";

    const steps = explanation.split(/\bStep\s+\d+:/);
    steps.forEach((step, i) => {
        step = step.trim();
        if (!step) return;
        const li = document.createElement("li");
        li.textContent = (i > 0 ? "Step " + (i) + ": " : "") + step;
        ul.appendChild(li);
    });

    el.appendChild(ul);
    return el;
}

function buildResultSection(data) {
    const wrapper = document.createDocumentFragment();

    // Explanation (if present)
    if (data.explanation) {
        const expEl = buildExplanationBlock(data.explanation);
        const toggleBtn = document.createElement("button");
        toggleBtn.className = "exp-toggle";
        toggleBtn.textContent = "Show explanation";
        toggleBtn.onclick = () => {
            expEl.classList.toggle("show");
            toggleBtn.classList.toggle("open");
            toggleBtn.textContent = expEl.classList.contains("show")
                ? "Hide explanation"
                : "Show explanation";
        };
        wrapper.appendChild(toggleBtn);
        wrapper.appendChild(expEl);
    }

    // SQL display
    if (data.sql) {
        const sqlBlock = buildSqlBlock(data.sql, "Generated SQL:");
        wrapper.appendChild(sqlBlock);
    }

    // Result table (if any)
    if (data.results && data.results.length > 0) {
        const cols = Object.keys(data.results[0]);
        const rowCount = document.createElement("div");
        rowCount.className = "row-count";
        rowCount.textContent = `${data.results.length} row${data.results.length !== 1 ? "s" : ""}`;
        wrapper.appendChild(rowCount);

        const table = document.createElement("table");
        table.className = "data";
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        cols.forEach((c) => {
            const th = document.createElement("th");
            th.textContent = c;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        data.results.forEach((row) => {
            const tr = document.createElement("tr");
            cols.forEach((c) => {
                const td = document.createElement("td");
                td.innerHTML = formatValue(row[c]);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrapper.appendChild(table);
    } else if (data.sql && !data.results) {
        wrapper.appendChild(document.createTextNode("No results returned."));
    }

    return wrapper;
}

function formatValue(val) {
    if (val === null || val === undefined) return `<span style="color:var(--muted)">NULL</span>`;
    if (typeof val === "number") {
        if (Number.isInteger(val)) return val.toLocaleString();
        return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return escapeHtml(String(val));
}
