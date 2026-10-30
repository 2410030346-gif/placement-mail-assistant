from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from ollama import chat
import json

app = FastAPI()


class EmailInput(BaseModel):
    email_text: str


@app.post("/extract")
def extract_email(data: EmailInput):

    prompt = f"""
You are an information extraction system.

Return ONLY valid JSON.

Format:

{{
    "company": "",
    "role": "",
    "stipend": "",
    "deadline": "",
    "eligible_batches": [],
    "eligible_branches": [],
    "min_cgpa": "",
    "rounds": []
}}

Email:

{data.email_text}
"""

    response = chat(
        model="llama3.2",
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    content = response.message.content

    try:
        start = content.find("{")
        end = content.rfind("}") + 1

        json_text = content[start:end]

        return json.loads(json_text)

    except Exception:
        return {
            "error": "Could not parse response",
            "raw_response": content
        }


app.mount(
    "/",
    StaticFiles(directory="static", html=True),
    name="static"
)