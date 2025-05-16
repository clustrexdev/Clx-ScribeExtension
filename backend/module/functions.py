import openai
from module.constant import OPENAI_API_KEY

openai.api_key = OPENAI_API_KEY

def analyze_transcription(text: str):
    questions = [
        "What is the patient's blood pressure (BP)?",
        "What is the patient's pulse rate?",
        "Is there any mention of medication?",
        "Are there any symptoms described?",
        "What is the diagnosis or conclusion?"
    ]

    results = {}
    for question in questions:
        prompt = f"""You are a medical assistant analyzing a clinical transcript.

Transcript:
{text}

Question: {question}
Answer:"""

        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a helpful assistant extracting key medical information from clinical transcripts."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300,
            temperature=0
        )

        answer = response.choices[0].message['content'].strip()
        results[question] = answer

    return results

