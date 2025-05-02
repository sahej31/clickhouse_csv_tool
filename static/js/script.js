// Utility for status and result messages
function showStatus(msg) {
    document.getElementById('status').textContent = msg;
}
function showResult(msg, isError=false) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = "";
    resultDiv.textContent = msg;
    if (isError) {
        resultDiv.classList.add('error');
    } else {
        resultDiv.classList.remove('error');
    }
}
function clearResult() {
    const resultDiv = document.getElementById('result');
    resultDiv.textContent = "";
    resultDiv.classList.remove('error');
}

// Toggle between source options
document.getElementById('src-ch').addEventListener('change', () => {
    document.getElementById('ch-section').style.display = 'block';
    document.getElementById('file-section').style.display = 'none';
    showStatus("");
    clearResult();
});
document.getElementById('src-file').addEventListener('change', () => {
    document.getElementById('ch-section').style.display = 'none';
    document.getElementById('file-section').style.display = 'block';
    showStatus("");
    clearResult();
});
// Hide file section initially
document.getElementById('file-section').style.display = 'none';

// Connect to ClickHouse and list tables
document.getElementById('btn-connect-ch').addEventListener('click', async () => {
    clearResult();
    showStatus("Connecting to ClickHouse...");
    // Gather CH connection inputs
    const host = document.getElementById('ch-host').value.trim();
    const port = document.getElementById('ch-port').value.trim();
    const database = document.getElementById('ch-db').value.trim();
    const user = document.getElementById('ch-user').value.trim();
    const token = document.getElementById('ch-jwt').value.trim();
    if (!host || !port || !database || user === "") {
        showStatus("");
        showResult("Please fill in ClickHouse connection details.", true);
        return;
    }
    try {
        const response = await fetch('/list_tables', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port, database, username: user, jwt: token })
        });
        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error || "Failed to connect");
        }
        // Populate tables list as checkboxes
        const tablesDiv = document.getElementById('tables-list');
        tablesDiv.innerHTML = "<h3>Select Table(s):</h3>";
        const tables = data.tables;
        if (!tables || tables.length === 0) {
            tablesDiv.innerHTML += "<p>No tables found in database.</p>";
        } else {
            tables.forEach(table => {
                const id = "table_" + table;
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = id;
                checkbox.value = table;
                checkbox.name = "tables";
                const label = document.createElement('label');
                label.htmlFor = id;
                label.textContent = table;
                const br = document.createElement('br');
                tablesDiv.appendChild(checkbox);
                tablesDiv.appendChild(label);
                tablesDiv.appendChild(br);
                // Show join field if multiple tables selected
                checkbox.addEventListener('change', () => {
                    const selected = document.querySelectorAll('#tables-list input[name="tables"]:checked');
                    if (selected.length >= 2) {
                        document.getElementById('join-condition-row').classList.remove('hidden');
                    } else {
                        document.getElementById('join-condition-row').classList.add('hidden');
                    }
                });
            });
        }
        document.getElementById('btn-load-columns-ch').disabled = false;
        showStatus("Connected. Select table(s) and click Load Columns.");
    } catch (error) {
        showStatus("");
        showResult("Connection failed: " + error.message, true);
    }
});

// Load columns for selected ClickHouse tables
document.getElementById('btn-load-columns-ch').addEventListener('click', async () => {
    clearResult();
    showStatus("Loading columns...");
    const checkboxes = document.querySelectorAll('#tables-list input[name="tables"]:checked');
    if (checkboxes.length === 0) {
        showStatus("");
        showResult("No table selected.", true);
        return;
    }
    const tables = Array.from(checkboxes).map(cb => cb.value);
    // Reuse connection details
    const host = document.getElementById('ch-host').value.trim();
    const port = document.getElementById('ch-port').value.trim();
    const database = document.getElementById('ch-db').value.trim();
    const user = document.getElementById('ch-user').value.trim();
    const token = document.getElementById('ch-jwt').value.trim();
    try {
        const response = await fetch('/list_columns_ch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port, database, username: user, jwt: token, tables })
        });
        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error || "Failed to retrieve columns");
        }
        const columnsDiv = document.getElementById('columns-list-ch');
        columnsDiv.innerHTML = "<h3>Select Columns:</h3>";
        const columnsInfo = data.columns;
        // Display columns, grouped by table if multiple tables
        for (let tbl in columnsInfo) {
            const colNames = columnsInfo[tbl].columns;
            if (Object.keys(columnsInfo).length > 1) {
                const tableHeader = document.createElement('h4');
                tableHeader.textContent = tbl;
                columnsDiv.appendChild(tableHeader);
            }
            colNames.forEach(col => {
                const id = `col_${tbl}_${col}`;
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = id;
                checkbox.value = col;
                checkbox.name = `col_${tbl}`; // group by table
                const label = document.createElement('label');
                label.htmlFor = id;
                label.textContent = col;
                const br = document.createElement('br');
                columnsDiv.appendChild(checkbox);
                columnsDiv.appendChild(label);
                columnsDiv.appendChild(br);
            });
        }
        document.getElementById('btn-start-ch').disabled = false;
        showStatus("Columns loaded. Select columns and start ingestion.");
    } catch (error) {
        showStatus("");
        showResult("Error: " + error.message, true);
    }
});

// Load columns from CSV file (when CSV is source)
document.getElementById('btn-load-columns-file').addEventListener('click', async () => {
    clearResult();
    showStatus("Reading file...");
    const fileInput = document.getElementById('csv-file');
    const file = fileInput.files[0];
    if (!file) {
        showStatus("");
        showResult("Please choose a CSV file first.", true);
        return;
    }
    const delimiter = document.getElementById('file-delimiter').value || ',';
    const formData = new FormData();
    formData.append('file', file);
    formData.append('delimiter', delimiter);
    try {
        const response = await fetch('/list_columns_file', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error || "Failed to parse file");
        }
        const columns = data.columns;
        const columnsDiv = document.getElementById('columns-list-file');
        columnsDiv.innerHTML = "<h3>Select Columns:</h3>";
        columns.forEach(col => {
            const id = "filecol_" + col;
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = id;
            checkbox.value = col;
            checkbox.name = "file-columns";
            const label = document.createElement('label');
            label.htmlFor = id;
            label.textContent = col;
            const br = document.createElement('br');
            columnsDiv.appendChild(checkbox);
            columnsDiv.appendChild(label);
            columnsDiv.appendChild(br);
        });
        document.getElementById('btn-start-file').disabled = false;
        showStatus("Columns loaded. Select columns and start ingestion.");
    } catch (error) {
        showStatus("");
        showResult("Error: " + error.message, true);
    }
});

// Start ingestion ClickHouse -> CSV
document.getElementById('btn-start-ch').addEventListener('click', async () => {
    clearResult();
    showStatus("Ingesting data from ClickHouse...");
    // Gather all necessary inputs
    const host = document.getElementById('ch-host').value.trim();
    const port = document.getElementById('ch-port').value.trim();
    const database = document.getElementById('ch-db').value.trim();
    const user = document.getElementById('ch-user').value.trim();
    const token = document.getElementById('ch-jwt').value.trim();
    const tablesChecked = document.querySelectorAll('#tables-list input[name="tables"]:checked');
    const columnsChecked = document.querySelectorAll('#columns-list-ch input[type="checkbox"]:checked');
    if (!host || !port || !database || user === "") {
        showStatus("");
        showResult("Missing ClickHouse connection parameters.", true);
        return;
    }
    if (tablesChecked.length === 0) {
        showStatus("");
        showResult("No source table selected.", true);
        return;
    }
    if (columnsChecked.length === 0) {
        showStatus("");
        showResult("No columns selected.", true);
        return;
    }
    const tables = Array.from(tablesChecked).map(cb => cb.value);
    let columns;
    if (tables.length > 1) {
        // multiple tables: prepare columns as a dict {table: [cols]}
        columns = {};
        tables.forEach(tbl => {
            const colCbs = document.querySelectorAll(`#columns-list-ch input[name="col_${tbl}"]:checked`);
            columns[tbl] = Array.from(colCbs).map(cb => cb.value);
        });
    } else {
        // single table: columns as simple list
        columns = Array.from(columnsChecked).map(cb => cb.value);
    }
    const joinCondition = document.getElementById('join-condition').value;
    const outfile = document.getElementById('out-filename').value.trim() || 'output.csv';
    const delimiter = document.getElementById('out-delimiter').value || ',';
    try {
        const response = await fetch('/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                host, port, database,
                username: user, jwt: token,
                tables: tables, columns: columns,
                join_condition: joinCondition,
                outfile: outfile, delimiter: delimiter
            })
        });
        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error || "Ingestion failed");
        }
        showStatus("");
        const count = data.records;
        const fileName = data.output_file;
        const resultMsg = `Success! ${count} records exported to CSV. `;
        // Create a download link for the output CSV
        const downloadLink = document.createElement('a');
        downloadLink.href = `/download/${encodeURIComponent(fileName)}`;
        downloadLink.textContent = "Download CSV";
        downloadLink.setAttribute('download', fileName);
        // Display the result message and link
        const resultDiv = document.getElementById('result');
        resultDiv.classList.remove('error');
        resultDiv.textContent = resultMsg;
        resultDiv.appendChild(downloadLink);
    } catch (error) {
        showStatus("");
        showResult("Error: " + error.message, true);
    }
});

// Start ingestion CSV -> ClickHouse
document.getElementById('btn-start-file').addEventListener('click', async () => {
    clearResult();
    showStatus("Ingesting data to ClickHouse...");
    // Gather form data for CSV->CH
    const fileInput = document.getElementById('csv-file');
    const file = fileInput.files[0];
    const delimiter = document.getElementById('file-delimiter').value || ',';
    const host = document.getElementById('ch-host-f').value.trim();
    const port = document.getElementById('ch-port-f').value.trim();
    const database = document.getElementById('ch-db-f').value.trim();
    const user = document.getElementById('ch-user-f').value.trim();
    const token = document.getElementById('ch-jwt-f').value.trim();
    const tableName = document.getElementById('ch-table-f').value.trim();
    const colsChecked = document.querySelectorAll('#columns-list-file input[name="file-columns"]:checked');
    if (!file) {
        showStatus("");
        showResult("No file selected.", true);
        return;
    }
    if (!host || !port || !database || user === "") {
        showStatus("");
        showResult("Missing ClickHouse target parameters.", true);
        return;
    }
    if (!tableName) {
        showStatus("");
        showResult("Please provide a target table name.", true);
        return;
    }
    if (colsChecked.length === 0) {
        showStatus("");
        showResult("No columns selected for ingestion.", true);
        return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('delimiter', delimiter);
    formData.append('host', host);
    formData.append('port', port);
    formData.append('database', database);
    formData.append('username', user);
    formData.append('jwt', token);
    formData.append('table_name', tableName);
    Array.from(colsChecked).forEach(cb => {
        formData.append('columns', cb.value);
    });
    try {
        const response = await fetch('/ingest', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error || "Ingestion failed");
        }
        showStatus("");
        const count = data.records;
        const resultMsg = `Success! ${count} records inserted into ClickHouse table "${tableName}".`;
        showResult(resultMsg);
    } catch (error) {
        showStatus("");
        showResult("Error: " + error.message, true);
    }
});

// Enable the CSV "Load Columns" button only after a file is selected
document.getElementById('csv-file').addEventListener('change', () => {
    const file = document.getElementById('csv-file').files[0];
    document.getElementById('btn-load-columns-file').disabled = !file;
});
