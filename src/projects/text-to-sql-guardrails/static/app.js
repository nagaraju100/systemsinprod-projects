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
    // Remove "selected" class from all tags
    document.querySelectorAll(".table-tag.selected").forEach(el => el.classList.remove("selected"));
    document.querySelectorAll(".table-columns.expanded").forEach(el => {
        el.classList.remove("expanded");
        el.textContent = "";
    });

    tag.classList.add("selected");

    const wrapper = tag.parentElement;
    const colsDiv = wrapper.querySelector(".table-columns");

    // If already expanded, collapse it
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

    // Add user's question to results
    const qBlock = document.createElement("div");
    qBlock.className = "result-block";
    const qText = question.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    qBlock.innerHTML = `<div class="result-header"><span class="q-text">${qText}</span></div>`;
    results.insertBefore(qBlock, results.firstChild);

    // Show loading
    const loading = document.createElement("div");
    loading.className = "loading";
    loading.textContent = "Converting to SQL and executing";
    qBlock.appendChild(loading);

    try {
        const resp = await fetch("/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question }),
        });
        loading.remove();

        if (!resp.ok) {
            const text = await resp.text();
            let errBody;
            try { errBody = JSON.parse(text); } catch { errBody = { error: text }; }
            const errEl = document.createElement("div");
            errEl.className = "error-msg";
            errEl.textContent = errBody.error || `Server error ${resp.status}`;
            qBlock.appendChild(errEl);
            return;
        }

        const data = await resp.json();

        if (data.error) {
            const errEl = document.createElement("div");
            errEl.className = "error-msg";
            errEl.textContent = data.error;
            qBlock.appendChild(errEl);

            if (data.sql) {
                const sqlBlock = document.createElement("div");
                sqlBlock.className = "sql-block";
                const label = document.createElement("div");
                label.className = "sql-label";
                label.textContent = "Generated SQL (blocked by guardrails):";
                sqlBlock.appendChild(label);
                sqlBlock.appendChild(document.createTextNode(data.sql));
                qBlock.appendChild(sqlBlock);
            }
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
                qBlock.appendChild(toggleBtn);
                qBlock.appendChild(expEl);
            }
        } else {
            const resultSection = buildResultSection(data);
            qBlock.appendChild(resultSection);
            // Add follow-up questions if we got results
            if (data.sql && data.results && data.results.length > 0) {
                const followupEl = await getFollowupQuestions(
                    question, data.sql, data.results.length
                );
                if (followupEl) {
                    qBlock.appendChild(followupEl);
                }
            }
        }
    } catch (e) {
        console.error("API error:", e);
        loading.textContent = `Connection failed: ${e.message}`;
        loading.style.color = "#f85149";
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
        input.focus();
    }
}

function buildResultSection(data) {
    const wrapper = document.createDocumentFragment();

    // Explanation (if present) — hidden by default
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
        const sqlBlock = document.createElement("div");
        sqlBlock.className = "sql-block";
        const label = document.createElement("div");
        label.className = "sql-label";
        label.textContent = "Generated SQL:";
        sqlBlock.appendChild(label);
        sqlBlock.appendChild(document.createTextNode(data.sql));
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

function buildExplanationBlock(explanation) {
    const el = document.createElement("div");
    el.className = "explanation-block";

    const label = document.createElement("div");
    label.className = "explanation-label";
    label.textContent = "How this SQL was built:";
    el.appendChild(label);

    const ul = document.createElement("ul");
    ul.className = "explanation-list";

    // Split "Step 1: ... Step 2: ..." into individual bullet points
    const steps = explanation.split(/\bStep\s+\d+:/);
    steps.forEach((step, i) => {
        step = step.trim();
        if (!step) return;
        const li = document.createElement("li");
        // Reattach the "Step N:" prefix
        li.textContent = (i > 0 ? "Step " + (i) + ": " : "") + step;
        ul.appendChild(li);
    });

    el.appendChild(ul);
    return el;
}

async function getFollowupQuestions(question, sql, rowCount) {
    // Return null — follow-up requires another LLM call which crashes the server (too much memory for Qwen 35B).
    // Users can ask new questions using the input box.
    return null;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

function formatValue(val) {
    if (val === null || val === undefined) return `<span style="color:var(--muted)">NULL</span>`;
    if (typeof val === "number") {
        if (Number.isInteger(val)) return val.toLocaleString();
        return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return escapeHtml(String(val));
}
