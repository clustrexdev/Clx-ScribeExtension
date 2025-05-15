from flask import Flask
from flask_cors import CORS
import json
import serverless_wsgi
from module.constant import S3_BUCKET_NAME, REGION_NAME
from module.transcriber import register_routes  # <-- Import the function

app = Flask(__name__)
CORS(app)


@app.route("/")
def home():
    return "Home page"


register_routes(app, S3_BUCKET_NAME, REGION_NAME)


def handler(event, context):
    print("Event:", json.dumps(event))
    return serverless_wsgi.handle_request(app, event, context)

