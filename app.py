import os
import csv
from io import TextIOWrapper
from flask import Flask, request, jsonify, render_template, send_file
try:
    # Try importing clickhouse_connect for ClickHouse interactions
    import clickhouse_connect
    from clickhouse_connect import get_client
except ImportError:
    clickhouse_connect = None
    get_client = None

# Determine base directory and ensure uploads directory exists
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)

def connect_to_clickhouse(host, port, database, username, jwt_token, use_ssl=None):
    """
    Connect to ClickHouse using clickhouse_connect. If jwt_token is provided, use it for authentication.
    If jwt_token is empty, attempt connection without token (e.g., no password).
    use_ssl: bool or None. If None, determine based on port (8443/9440/443 implies True).
    """
    # Determine SSL if not specified
    if use_ssl is None:
        try:
            port_num = int(port)
        except:
            port_num = None
        if port_num in (8443, 9440, 443):
            use_ssl = True
        else:
            use_ssl = False
    if get_client:
        jwt_token = jwt_token.strip() if isinstance(jwt_token, str) else jwt_token
        if jwt_token:
            # Use JWT token for auth (as access_token)
            client = get_client(host=host, port=port, username=username,
                                 access_token=jwt_token, secure=use_ssl, database=database)
        else:
            # Connect without token (empty password)
            client = get_client(host=host, port=port, username=username,
                                 password='', secure=use_ssl, database=database)
        return client
    else:
        # If clickhouse_connect not installed
        raise RuntimeError("ClickHouse client library not installed.")

@app.route('/')
def index():
    # Serve the main page
    return render_template('index.html')

@app.route('/list_tables', methods=['POST'])
def list_tables():
    """
    Connect to ClickHouse and retrieve list of tables in the specified database.
    Expects JSON data with connection parameters.
    """
    data = request.get_json()
    if not data:
        return jsonify(error="No data provided"), 400
    host = data.get('host')
    port = data.get('port')
    database = data.get('database')
    username = data.get('username', data.get('user'))  # accept 'user' or 'username'
    jwt = data.get('jwt', data.get('token', ''))
    if not host or not port or not database or username is None:
        return jsonify(error="Missing connection parameters"), 400
    try:
        client = connect_to_clickhouse(host, port, database, username, jwt)
        # Query system.tables to get tables in the database
        query = f"SELECT name FROM system.tables WHERE database = '{database}'"
        result = client.query(query)
        # Extract table names from result
        if hasattr(result, 'result_set'):
            rows = result.result_set
        elif hasattr(result, 'result_rows'):
            rows = result.result_rows
        else:
            rows = result  # result might be a list of tuples
        tables = [row[0] for row in rows]
        return jsonify(tables=tables)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route('/list_columns_ch', methods=['POST'])
def list_columns_ch():
    """
    Given connection parameters and selected table(s), return column names (and types) for those table(s).
    Expects JSON with connection params and 'tables' (list of table names).
    """
    data = request.get_json()
    if not data:
        return jsonify(error="No data provided"), 400
    host = data.get('host')
    port = data.get('port')
    database = data.get('database')
    username = data.get('username', data.get('user'))
    jwt = data.get('jwt', data.get('token', ''))
    tables = data.get('tables')
    if not host or not port or not database or username is None or not tables:
        return jsonify(error="Missing parameters"), 400
    try:
        client = connect_to_clickhouse(host, port, database, username, jwt)
        columns_info = {}
        for table in tables:
            query = f"SELECT name, type FROM system.columns WHERE database = '{database}' AND table = '{table}'"
            result = client.query(query)
            if hasattr(result, 'result_set'):
                rows = result.result_set
            elif hasattr(result, 'result_rows'):
                rows = result.result_rows
            else:
                rows = result
            col_names = [row[0] for row in rows]
            col_types = [row[1] for row in rows]
            columns_info[table] = {'columns': col_names, 'types': col_types}
        return jsonify(columns=columns_info)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route('/list_columns_file', methods=['POST'])
def list_columns_file():
    """
    Accept a file upload (CSV) and delimiter, and return the list of column names from the header.
    Saves the uploaded file to a temporary location for later use.
    """
    if 'file' not in request.files:
        return jsonify(error="No file uploaded"), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify(error="No file selected"), 400
    delimiter = request.form.get('delimiter', ',')
    temp_path = os.path.join(UPLOAD_DIR, "uploaded_file.csv")
    try:
        file.save(temp_path)
    except Exception as e:
        return jsonify(error=f"Failed to save uploaded file: {e}"), 500
    # Read the first line to get header
    try:
        with open(temp_path, 'r', newline='', encoding='utf-8') as csvfile:
            reader = csv.reader(csvfile, delimiter=delimiter)
            headers = next(reader)  # first row as headers
    except Exception as e:
        return jsonify(error=f"Failed to read CSV file: {e}"), 500
    return jsonify(columns=headers)

@app.route('/ingest', methods=['POST'])
def ingest():
    """
    Perform the ingestion process based on provided parameters.
    Handles both directions:
    - If 'file' in request: CSV -> ClickHouse.
    - Otherwise: ClickHouse -> CSV.
    """
    # Check if a file is included (indicates CSV -> ClickHouse)
    if 'file' in request.files:
        # CSV to ClickHouse
        file = request.files['file']
        if file.filename == '':
            return jsonify(error="No file selected for ingestion"), 400
        # Collect ClickHouse target params from form fields
        host = request.form.get('host')
        port = request.form.get('port')
        database = request.form.get('database')
        username = request.form.get('username', request.form.get('user'))
        jwt = request.form.get('jwt', request.form.get('token', ''))
        table_name = request.form.get('table_name')
        delimiter = request.form.get('delimiter', ',')
        columns = request.form.getlist('columns')  # list of selected column names
        if not host or not port or not database or username is None or not table_name:
            return jsonify(error="Missing target database parameters"), 400
        if not columns:
            return jsonify(error="No columns selected for ingestion"), 400
        # Save the file (overwrite existing if any)
        temp_path = os.path.join(UPLOAD_DIR, "uploaded_file.csv")
        try:
            file.save(temp_path)
        except Exception as e:
            return jsonify(error=f"Failed to save uploaded file: {e}"), 500
        # Connect to ClickHouse target
        try:
            client = connect_to_clickhouse(host, port, database, username, jwt)
        except Exception as e:
            return jsonify(error=f"Failed to connect to ClickHouse: {e}"), 500
        # Create target table (columns as String type for simplicity)
        column_defs = ", ".join(f"`{col}` String" for col in columns)
        create_query = f"CREATE TABLE IF NOT EXISTS `{database}`.`{table_name}` ({column_defs}) ENGINE = MergeTree() ORDER BY tuple()"
        try:
            client.command(create_query)
        except Exception as e:
            return jsonify(error=f"Failed to create target table: {e}"), 500
        # Read file and insert data in batches
        total_inserted = 0
        try:
            with open(temp_path, 'r', newline='', encoding='utf-8') as csvfile:
                reader = csv.reader(csvfile, delimiter=delimiter)
                header = next(reader)  # skip header row (already have columns)
                # Determine indices of selected columns in the CSV
                col_indices = [header.index(col) for col in columns]
                batch = []
                batch_size = 1000
                for row in reader:
                    selected_row = [row[idx] for idx in col_indices]
                    batch.append(selected_row)
                    if len(batch) >= batch_size:
                        client.insert(table_name, batch, database=database)
                        total_inserted += len(batch)
                        batch.clear()
                # Insert remaining rows
                if batch:
                    client.insert(table_name, batch, database=database)
                    total_inserted += len(batch)
        except Exception as e:
            return jsonify(error=f"Error during data ingestion: {e}"), 500
        # Clean up the uploaded file (optional)
        try:
            os.remove(temp_path)
        except Exception:
            pass
        return jsonify(message="Ingestion completed", records=total_inserted)
    else:
        # ClickHouse to CSV
        data = request.get_json()
        if not data:
            return jsonify(error="No data provided"), 400
        host = data.get('host')
        port = data.get('port')
        database = data.get('database')
        username = data.get('username', data.get('user'))
        jwt = data.get('jwt', data.get('token', ''))
        tables = data.get('tables')             # list of table names
        columns = data.get('columns')           # selected columns (list or dict if multiple tables)
        join_condition = data.get('join_condition', '')
        outfile = data.get('outfile', 'output.csv')
        delimiter = data.get('delimiter', ',')
        if not host or not port or not database or username is None or not tables or not columns:
            return jsonify(error="Missing source parameters or selections"), 400
        if isinstance(tables, str):
            tables = [tables]
        # Ensure columns is proper format
        if not isinstance(columns, list) and not isinstance(columns, dict):
            return jsonify(error="Columns selection format is invalid"), 400
        try:
            client = connect_to_clickhouse(host, port, database, username, jwt)
        except Exception as e:
            return jsonify(error=f"Failed to connect to ClickHouse: {e}"), 500
        # Build SELECT query
        query = ""
        if len(tables) == 1:
            # Single table query
            tbl = tables[0]
            col_list = columns if not isinstance(columns, dict) else columns.get(tbl, [])
            if not col_list:
                return jsonify(error="No columns selected"), 400
            cols_sql = ", ".join(f"`{col}`" for col in col_list)
            query = f"SELECT {cols_sql} FROM `{database}`.`{tbl}`"
        else:
            # Multi-table join query
            if not join_condition:
                return jsonify(error="Join condition required for multiple tables"), 400
            # Assign aliases t1, t2, ... for each table
            aliases = {tbl: f"t{i+1}" for i, tbl in enumerate(tables)}
            # Build select clause with table aliases
            select_parts = []
            if isinstance(columns, dict):
                # columns grouped by table
                for tbl, cols in columns.items():
                    alias = aliases.get(tbl, tbl)
                    for col in cols:
                        select_parts.append(f"{alias}.`{col}` AS `{tbl}.{col}`")
            else:
                # If columns is a flat list (not expected here), abort for safety
                return jsonify(error="Columns must be provided per table for multi-table join"), 400
            select_clause = ", ".join(select_parts)
            # Construct FROM ... JOIN ... ON ... string
            base_table = tables[0]
            base_alias = aliases[base_table]
            query = f"SELECT {select_clause} FROM `{database}`.`{base_table}` AS {base_alias} "
            for tbl in tables[1:]:
                alias = aliases[tbl]
                query += f"JOIN `{database}`.`{tbl}` AS {alias} ON {join_condition} "
        # Execute query and write results to CSV
        safe_outfile = os.path.basename(outfile)  # prevent directory traversal
        output_path = os.path.join(UPLOAD_DIR, safe_outfile)
        total_rows = 0
        try:
            with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.writer(csvfile, delimiter=delimiter)
                # Write header row
                if len(tables) == 1:
                    header = columns if not isinstance(columns, dict) else columns.get(tables[0], [])
                else:
                    header = []
                    if isinstance(columns, dict):
                        for tbl, cols in columns.items():
                            for col in cols:
                                header.append(f"{tbl}.{col}")
                writer.writerow(header)
                # Fetch data from ClickHouse
                result = client.query(query)
                if hasattr(result, 'result_set'):
                    rows = result.result_set
                elif hasattr(result, 'result_rows'):
                    rows = result.result_rows
                else:
                    rows = result
                for row in rows:
                    writer.writerow(row)
                total_rows = len(rows)
        except Exception as e:
            return jsonify(error=f"Failed during export: {e}"), 500
        return jsonify(message="Ingestion completed", records=total_rows, output_file=safe_outfile)

@app.route('/download/<path:filename>', methods=['GET'])
def download_file(filename):
    """
    Endpoint to download a file from the uploads directory (e.g., the output CSV).
    """
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    if not os.path.isfile(file_path):
        return "File not found", 404
    return send_file(file_path, as_attachment=True)

if __name__ == '__main__':
    # Run Flask development server (accessible in Docker)
    app.run(host='0.0.0.0', port=5000)
