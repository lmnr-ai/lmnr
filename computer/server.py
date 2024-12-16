from flask import Flask, request, jsonify
import subprocess
import os

app = Flask(__name__)


@app.route("/execute", methods=["POST"])
def execute_command():
    data = request.get_json()
    command = data.get("command")

    if not command:
        return jsonify({"error": "No command provided"}), 400

    try:
        # Execute the command and capture output
        process = subprocess.Popen(
            command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        stdout, stderr = process.communicate()

        return jsonify(
            {"stdout": stdout, "stderr": stderr, "returncode": process.returncode}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
