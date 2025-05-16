# First import app from module
from module import app

if __name__ == "__main__":
    # For local development comment the handler in init.py and then run this file.
    app.run(debug=True, host="0.0.0.0", port=3000)

