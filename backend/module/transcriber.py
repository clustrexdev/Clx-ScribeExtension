import time
import uuid
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
import json
import logging
from flask import jsonify, request
from module.functions import analyze_transcription

# Don't import app yet - we'll register routes in register_routes() function

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Define a function to register all routes with the app
def register_routes(app, S3_BUCKET_NAME, REGION_NAME):
    """Register all routes with the Flask app"""
    
    s3_config = Config(
            region_name="us-east-1",
            signature_version='s3v4',
        )

    s3 = boto3.client("s3", config=s3_config)
    transcribe = boto3.client("transcribe", region_name=REGION_NAME)
    

    @app.route("/get-s3-presigned-url", methods=["GET"])
    def generate_presigned_url():
        object_name = request.args.get("object_name")
        if not object_name:
            return jsonify({"error": "Missing 'object_name' parameter"}), 400
        
        if not object_name.lower().endswith(".mp3"):
            return jsonify({"error": "Only .mp3 files are allowed"}), 400
        
        try:
            response = s3.generate_presigned_url(
                ClientMethod='put_object', 
                Params={"Bucket": S3_BUCKET_NAME, "Key": f"audio/{object_name}"},
                ExpiresIn=3600
            )

            print(response)

            return jsonify({"presigned_url": response})
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return jsonify({"error": "Failed to generate presigned URL"}), 500
        

    @app.route("/transcribe", methods=["POST"])
    def transcribe_audio():
        """ 
        Inputs:
        {
            "object_name": "filename.mp3"
        }
        """
        data = request.get_json()
        if not data or "object_name" not in data:
            return jsonify({"error": "Missing 'object_name' parameter"}), 400
        
        object_name = data.get("object_name")
        
        if not object_name.lower().endswith(".mp3"):
            return jsonify({"error": "Only .mp3 files are allowed"}), 400
        
        try:
            s3.head_object(Bucket=S3_BUCKET_NAME, Key=f"audio/{object_name}")
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return jsonify({"error": "File not found in S3"}), 404
            else:
                logger.error(f"Error checking S3 file: {e}")
                return jsonify({"error": "Failed to check file in S3"}), 500
        
        job_name = f"transcribe-{uuid.uuid4()}"
        
        s3_uri = f"s3://{S3_BUCKET_NAME}/audio/{object_name}"
        
        output_key = f"transcriptions/{object_name}-{int(time.time())}.txt"
        
        try:
            transcribe.start_transcription_job(
                TranscriptionJobName=job_name,
                Media={'MediaFileUri': s3_uri},
                MediaFormat='mp3',
                LanguageCode='en-US',
                OutputBucketName=S3_BUCKET_NAME,
                OutputKey=f"transcriptions/{job_name}.json"
            )
            
            logger.info(f"Started transcription job: {job_name}")
            
            while True:
                status = transcribe.get_transcription_job(TranscriptionJobName=job_name)
                job_status = status['TranscriptionJob']['TranscriptionJobStatus']
                
                if job_status in ['COMPLETED', 'FAILED']:
                    break
                    
                logger.info(f"Transcription job status: {job_status}")
                time.sleep(5)
            
            if job_status == 'COMPLETED':
                transcript_file_uri = status['TranscriptionJob']['Transcript']['TranscriptFileUri']
                
                if transcript_file_uri.startswith('https://s3'):
                    transcript_key = f"transcriptions/{job_name}.json"
                    
                    try:
                        response = s3.get_object(Bucket=S3_BUCKET_NAME, Key=transcript_key)
                        transcript_json = json.loads(response['Body'].read().decode('utf-8'))
                        
                        transcript_text = transcript_json['results']['transcripts'][0]['transcript']
                        
                        s3.put_object(
                            Bucket=S3_BUCKET_NAME,
                            Key=output_key,
                            Body=transcript_text,
                            ContentType='text/plain'
                        )
                        
                        text_presigned_url = s3.generate_presigned_url(
                            'get_object',
                            Params={'Bucket': S3_BUCKET_NAME, 'Key': output_key},
                            ExpiresIn=86400
                        )
                        
                        return jsonify({
                            "status": "completed",
                            "text": transcript_text,
                            "download_url": text_presigned_url
                        })
                        
                    except ClientError as e:
                        logger.error(f"Error processing transcript: {e}")
                        return jsonify({"error": "Failed to process transcript"}), 500
                else:
                    return jsonify({"error": "Unexpected transcript URI format"}), 500
            else:
                error_message = status['TranscriptionJob'].get('FailureReason', 'Unknown error')
                logger.error(f"Transcription job failed: {error_message}")
                return jsonify({"error": f"Transcription failed: {error_message}"}), 500
                
        except ClientError as e:
            logger.error(f"AWS error during transcription: {e}")
            return jsonify({"error": "Failed to start transcription job"}), 500
        except Exception as e:
            logger.error(f"Unexpected error during transcription: {e}")
            return jsonify({"error": f"Unexpected error: {str(e)}"}), 500
        

    @app.route("/llm-response", methods=["POST"])
    def generate_LLM_response():        
        """
        Inputs:
        {
            "transcribed_text": ""
        }
        """
        
        data = request.get_json()
        if not data or "transcribed_text" not in data:
            return jsonify({"error": "Missing 'transcribed_text' parameter"}), 400
        
        transcribed_text = data.get("transcribed_text")

        res = analyze_transcription(jsonify(transcribed_text))

        return jsonify(res)


    @app.route("/check-transcription-status", methods=["GET"])
    def check_transcription_status():
        """
        Check the status of a transcription job
        """
        job_name = request.args.get("job_name")
        if not job_name:
            return jsonify({"error": "Missing 'job_name' parameter"}), 400
        
        try:
            status = transcribe.get_transcription_job(TranscriptionJobName=job_name)
            job_status = status['TranscriptionJob']['TranscriptionJobStatus']
            
            response = {
                "job_name": job_name,
                "status": job_status
            }
            
            if job_status == 'COMPLETED':
                transcript_file_uri = status['TranscriptionJob']['Transcript']['TranscriptFileUri']
                response["transcript_uri"] = transcript_file_uri
                
            elif job_status == 'FAILED':
                response["error"] = status['TranscriptionJob'].get('FailureReason', 'Unknown error')
                
            return jsonify(response)
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'BadRequestException':
                return jsonify({"error": "Transcription job not found"}), 404
            else:
                logger.error(f"Error checking transcription status: {e}")
                return jsonify({"error": "Failed to check transcription status"}), 500


    @app.route("/get-transcript-url", methods=["GET"])
    def get_transcript_url():
        """
        Generate a presigned URL for downloading a transcript
        """
        object_key = request.args.get("object_key")
        if not object_key:
            return jsonify({"error": "Missing 'object_key' parameter"}), 400
        
        try:
            s3.head_object(Bucket=S3_BUCKET_NAME, Key=object_key)
            
            presigned_url = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': S3_BUCKET_NAME, 'Key': object_key},
                ExpiresIn=600
            )
            
            return jsonify({
                "download_url": presigned_url
            })
            
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return jsonify({"error": "Transcript file not found"}), 404
            else:
                logger.error(f"Error generating transcript URL: {e}")
                return jsonify({"error": "Failed to generate transcript URL"}), 500
                
    # Return a message confirming routes were registered
    logger.info("All transcriber routes have been registered!")
    return "Routes registered successfully"

