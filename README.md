
# ClickHouse-CSV Data Ingestion Web Application

This web application enables **bidirectional data transfer** between **ClickHouse** databases and **CSV files**. It provides a clean, responsive frontend with a Flask backend, supports JWT authentication for ClickHouse Cloud, and handles large data via streaming to avoid memory overload.

---

## 🚀 Features

- **Import CSV → ClickHouse**:
  - Upload CSV files and import into existing or newly created tables.
  - Schema inference from CSV headers + sample data.
  - Delimiter customization.
  - Streaming upload with progress tracking.

- **Export ClickHouse → CSV**:
  - Export selected tables or multi-table join query results to CSV.
  - Column selection and join key support.
  - Fast data streaming and download.
  - Real-time row count and progress bar.

- **JWT Token Authentication**: 
  - Connect to ClickHouse Cloud using secure Bearer token (no password required).

- **Streaming/Batched Data Transfer**:
  - Efficient chunked reads and writes using generators.
  - Handles large datasets with minimal memory usage.

- **Simple Web UI**:
  - Built with HTML, CSS, and vanilla JavaScript.
  - No frameworks, lightweight and easy to use.

- **Dockerized Setup**:
  - Includes `Dockerfile` and `docker-compose.yml`.
  - Comes with an optional local ClickHouse server for dev/testing.

---

## 🧱 Project Structure

```
clickhouse_csv_tool/
├── app.py                 # Flask backend logic
├── requirements.txt       # Python dependencies
├── Dockerfile             # Container definition for Flask app
├── docker-compose.yml     # Orchestrates Flask + ClickHouse containers
├── README.md              # You're reading this!
├── prompts.txt            # AI prompt history for transparency
├── templates/
│   └── index.html         # HTML frontend
└── static/
    ├── css/
    │   └── style.css      # Stylesheet
    └── js/
        └── main.js        # Frontend JS logic (AJAX, form handling, UI updates)
```

---

## 🐳 Setup Instructions

### 🛠️ Option 1: Docker (Recommended)

Make sure you have **Docker** and **Docker Compose** installed.

```bash
git clone https://github.com/your-username/clickhouse_csv_tool.git
cd clickhouse_csv_tool
docker-compose up --build
```

Then visit [http://localhost:5000](http://localhost:5000) in your browser.

- Flask app runs on port **5000**
- ClickHouse dev instance runs on **8123** (default user: `default`, no password)

### 🛠️ Option 2: Manual (Without Docker)

1. Install Python 3.10+
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Run the Flask app:

```bash
export FLASK_APP=app.py
flask run --host=0.0.0.0 --port=5000
```

Make sure a ClickHouse instance (local or cloud) is running and accessible.

---

## 📘 Usage Guide

1. **Connect to ClickHouse**:
   - Enter host, port, and database.
   - Choose `Username/Password` or `JWT Token`.
   - Click "Test Connection".

2. **Import Mode**:
   - Upload a CSV file.
   - Choose delimiter and whether to create a new table.
   - Click "Start Import" to begin.

3. **Export Mode**:
   - Select one or more tables.
   - If multi-table, choose a join key.
   - Pick columns to export.
   - Click "Start Export" and download CSV after completion.

Progress bars and live row count are shown for both modes.

---

## 🔐 Security Notes

- This is a local tool intended for internal or single-user deployments.
- Credentials and tokens are never saved server-side.
- For public deployment:
  - Add basic authentication
  - Use HTTPS
  - Secure Docker and ClickHouse ports

---

## 🧠 AI Prompt Disclosure

This project (including architecture and code) was created with help from **OpenAI’s GPT-4** based on the following prompt:

> “Build a full Flask + vanilla JS web app to import/export CSV from ClickHouse using JWT auth, multi-table joins, column selection, schema preview, and Docker support.”

(See `prompts.txt` for full record.)

---

## 📎 Licensing & Attribution

> **License**: MIT (or adjust as per your needs)

---

## 💬 Contact

Feel free to fork, contribute, or open issues!
