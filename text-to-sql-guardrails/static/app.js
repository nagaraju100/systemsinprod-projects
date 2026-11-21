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

    // Pipeline block — shows the 4-stage architecture
    const pipelineBlock = buildPipelineBlock();
    results.insertBefore(pipelineBlock, results.firstChild);
    const pipelineList = pipelineBlock.el;
    const submitBtn = pipelineBlock.toggleBtn;

    // Add user's question to results
    const qBlock = document.createElement("div");
    qBlock.className = "result-block";
    const qText = escapeHtml(question);
    qBlock.innerHTML = `<div class="result-header"><span class="q-text">${qText}</span></div>`;
    results.insertBefore(qBlock, results.firstChild);

    // Show loading at the LLM step
    const llmStep = pipelineList.querySelector(".step-status");
    llmStep.textContent = "Calling Qwen 35B...";
    llmStep.className = "step-status running";

    // Highlight the LLM step (active)
    const steps = pipelineList.querySelectorAll(".pipeline-step");
    steps.forEach(s => s.classList.remove("active"));
    steps[0].classList.add("active");

    try {
        const resp = await fetch("/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question }),
        });

        // Remove loading
        llmStep.textContent = "Called Qwen 35B → ";
        const loading = pipelineList.querySelector(".loading");
        if (loading) loading.remove();

        if (!resp.ok) {
            const text = await resp.text();
            let errBody;
            try { errBody = JSON.parse(text); } catch { errBody = { error: text }; }
            llmStep.textContent = "Called Qwen 35B → ✗ " + (errBody.error || `Server error ${resp.status}`);
            llmStep.className = "step-status error";
            appendError(qBlock, errBody.error || `Server error ${resp.status}`);
            updateToggle(submitBtn, pipelineList);
            return;
        }

        const data = await resp.json();

        // Step 1: LLM → SQL (done)
        const llmStatus = pipelineList.querySelector(".step-status");
        if (data.sql) {
            llmStatus.textContent = "Called Qwen 35B → SQL generated";
            llmStatus.className = "step-status success";
        } else {
            llmStatus.textContent = "Called Qwen 35B → ✗ " + (data.error || "Unknown error");
            llmStatus.className = "step-status error";
            appendError(qBlock, data.error || "Unknown error");
            updateToggle(submitBtn, pipelineList);
            return;
        }

        // Step 2: Guardrails (validating)
        steps[1].classList.add("active");
        pipelineList.querySelector(".guard-status").textContent = "Guardrails → validating";
        pipelineList.querySelector(".guard-status").className = "step-status running";

        if (data.error && data.error.startsWith("Guardrail blocked")) {
            // Guardrail blocked
            pipelineList.querySelector(".guard-status").textContent = "Guardrails → ✗ BLOCKED";
            pipelineList.querySelector(".guard-status").className = "step-status error";
            appendError(qBlock, data.error);
            if (data.sql) {
                const sqlBlock = buildSqlBlock(data.sql, "Guardrails blocked: " + data.error);
                qBlock.appendChild(sqlBlock);
            }
            updateToggle(submitBtn, pipelineList);
            return;
        }

        // Step 3: SQL → execute (validating)
        pipelineList.querySelector(".guard-status").textContent = "Guardrails → passed";
        pipelineList.querySelector(".guard-status").className = "step-status success";

        // Step 4: SQLite (executing)
        steps[2].classList.add("active");
        pipelineList.querySelector(".exec-status").textContent = "SQLite → executing";
        pipelineList.querySelector(".exec-status").className = "step-status running";

        // Step 4: Results
        steps[2].classList.remove("active");
        const resultStatus = pipelineList.querySelector(".exec-status");

        if (data.results && data.results.length > 0) {
            resultStatus.textContent = `SQLite → ${data.results.length} rows`;
            resultStatus.className = "step-status success";
        } else if (data.sql && !data.results) {
            resultStatus.textContent = "SQLite → no results";
            resultStatus.className = "step-status";
        } else {
            resultStatus.textContent = "SQLite → ✗ error";
            resultStatus.className = "step-status error";
            appendError(qBlock, data.error || "Execution error");
            updateToggle(submitBtn, pipelineList);
            return;
        }

        // Success — build full result
        steps[3].classList.add("active");
        pipelineList.querySelector(".result-status").textContent = "Results rendered";
        pipelineList.querySelector(".result-status").className = "step-status success";

        const resultSection = buildResultSection(data);
        qBlock.appendChild(resultSection);

    } catch (e) {
        console.error("API error:", e);
        const llmStatus = pipelineList.querySelector(".step-status");
        llmStatus.textContent = "Connection failed: " + e.message;
        llmStatus.className = "step-status error";
    } finally {
        // Mark all completed steps
        const allSteps = pipelineList.querySelectorAll(".pipeline-step");
        allSteps.forEach((s, i) => {
            const st = s.querySelector(".step-status");
            if (i < allSteps.length - 1 && st && !st.classList.contains("error")) {
                s.classList.remove("active");
            }
        });
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
            <span class="guard-status step-status">Waiting...</span>
        </li>
        <li class="pipeline-step">
            <span class="step-label">3. SQLite</span>
            <span class="exec-status step-status">Waiting...</span>
        </li>
        <li class="pipeline-step">
            <span class="step-label">4. Results</span>
            <span class="result-status step-status">Waiting...</span>
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

    return { el: list, toggleBtn: header, block };
}

function updateToggle(btn, list) {
    const steps = list.querySelectorAll(".pipeline-step");
    steps.forEach(s => s.classList.remove("active"));
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
