import os
import json
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from openai import OpenAI, RateLimitError, APIError

load_dotenv()

LLM_API_KEY = os.getenv("LLM_API_KEY")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "openai/gpt-oss-120b")

client = OpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL)

app = FastAPI()


class EmailInput(BaseModel):
    email_text: str


def normalize(text: str) -> str:
    """Collapse whitespace so quotes can be compared reliably."""
    return " ".join(str(text).split()).lower()


@app.post("/extract")
def extract_email(data: EmailInput):

    if not LLM_API_KEY:
        return {"error": "Server is missing the API key setting."}

    if len(data.email_text) > 20000:
        return {"error": "Email is too long. Please paste only the main text."}

    prompt = f"""
You are an information extraction system for campus placement emails.

Return ONLY valid JSON. No explanation, no markdown.

Format:

{{
    "company": "",
    "role": "",
    "stipend": "",
    "deadline": "",
    "eligible_batches": [],
    "eligible_branches": [],
    "min_cgpa": "",
    "rounds": [],
    "evidence": {{
        "deadline": "",
        "eligibility": "",
        "stipend": ""
    }}
}}

Rules:
- If something is not stated in the email, use "" or [] . NEVER guess.
- "deadline" must be written as YYYY-MM-DD HH:MM (24-hour, IST) when the
  date and time are stated. If only a date is given, use YYYY-MM-DD.
- Each "evidence" value must be ONE exact sentence copied word for word
  from the email that supports that field. Use "" if there is none.

Email:

{data.email_text}
"""

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=2000,
        )
    except RateLimitError:
        return {"error": "Too many requests right now. Please try again in a minute."}
    except APIError:
        return {"error": "The AI service had a problem. Please try again."}
    except Exception:
        return {"error": "Something went wrong while contacting the AI service."}

    content = response.choices[0].message.content or ""

    try:
        start = content.find("{")
        end = content.rfind("}") + 1
        result = json.loads(content[start:end])
    except Exception:
        return {
            "error": "Could not parse response",
            "raw_response": content
        }

    # Verify that each quoted evidence sentence really appears in the email.
    email_norm = normalize(data.email_text)
    evidence = result.get("evidence") or {}
    verified = {}
    for field, quote in evidence.items():
        verified[field] = bool(quote) and normalize(quote) in email_norm
    result["evidence_verified"] = verified

    return result


app.mount(
    "/",
    StaticFiles(directory="static", html=True),
    name="static"
)