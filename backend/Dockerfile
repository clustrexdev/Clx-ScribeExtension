FROM public.ecr.aws/lambda/python:3.9

# Copy function code
COPY . ${LAMBDA_TASK_ROOT}

# Install Python dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Set the CMD to your handler
CMD [ "module.handler" ]