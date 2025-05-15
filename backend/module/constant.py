""" To store all the variables used across the applciation. """
import os
from dotenv import load_dotenv

load_dotenv()

S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
REGION_NAME = os.getenv("REGION_NAME")
OPENAI_API_KEY=os.getenv("OPEN_AI_KEY")

