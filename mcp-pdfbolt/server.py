#!/usr/bin/env python3
"""
PDFBolt MCP Server

Tools for interacting with the PDFBolt HTML-to-PDF API.
Supports PDF generation from Handlebars templates, template listing, and template updates.
"""

import json
import os
import base64
from typing import Optional, Any
import httpx
from pydantic import BaseModel, Field, ConfigDict
from mcp.server.fastmcp import FastMCP

# --- Server init ---
mcp = FastMCP("pdfbolt_mcp")

# --- Constants ---
API_BASE = "https://api.pdfbolt.com/v1"
API_KEY = os.environ.get("PDFBOLT_API_KEY", "38f66299-8e3d-434c-b390-edc69f979e23")
DEFAULT_TEMPLATE_ID = os.environ.get(
    "PDFBOLT_TEMPLATE_ID", "aea16618-09eb-4232-b7fd-889ddfd2cb1f"
)

# --- Shared helpers ---
def _headers() -> dict:
    return {"API-KEY": API_KEY, "Content-Type": "application/json"}


def _handle_error(e: Exception) -> str:
    if isinstance(e, httpx.HTTPStatusError):
        status = e.response.status_code
        try:
            body = e.response.json()
            msg = body.get("message") or body.get("error") or str(body)
        except Exception:
            msg = e.response.text[:300]
        if status == 401:
            return f"Error 401: Invalid API key. Check PDFBOLT_API_KEY env var."
        if status == 404:
            return f"Error 404: Template not found. Check the template ID."
        if status == 422:
            return f"Error 422: Validation error — {msg}"
        return f"Error {status}: {msg}"
    if isinstance(e, httpx.TimeoutException):
        return "Error: Request timed out (PDFBolt API). Try again."
    return f"Error: {type(e).__name__}: {str(e)}"

# --- Input models ---

class GeneratePDFInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    template_data: dict = Field(
        ...,
        description=(
            "JSON object passed to the Handlebars template as variables. "
            "E.g. {\"company_name\": \"Café Rózsa\", \"geo_score\": 72, \"findings\": [...]}"
        )
    )
    template_id: Optional[str] = Field(
        default=None,
        description=(
            "PDFBolt template UUID. Omit to use the default WEBLELET template "
            f"({DEFAULT_TEMPLATE_ID})."
        )
    )
    output_path: Optional[str] = Field(
        default=None,
        description=(
            "Absolute path where the generated PDF will be saved. "
            "E.g. /Users/horvathadam/Desktop/audit.pdf. "
            "If omitted, PDF is returned as base64."
        )
    )


class UpdateTemplateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    template_id: str = Field(
        ...,
        description="PDFBolt template UUID to update."
    )
    html_content: str = Field(
        ...,
        description=(
            "Full Handlebars HTML string to set as the new template body. "
            "Must be valid HTML with Handlebars {{variable}} syntax."
        ),
        min_length=50
    )

class GetTemplateInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    template_id: str = Field(
        ...,
        description="PDFBolt template UUID."
    )

# --- Tools ---

@mcp.tool(
    name="pdfbolt_generate_pdf",
    annotations={
        "title": "Generate PDF from PDFBolt Template",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": True,
    }
)
async def pdfbolt_generate_pdf(params: GeneratePDFInput) -> str:
    """
    Generate a PDF file from a PDFBolt Handlebars HTML template.

    Sends template_data as JSON variables to the PDFBolt /v1/direct endpoint,
    which renders the Handlebars template and returns a binary PDF.

    Args:
        params (GeneratePDFInput):
            - template_data (dict): Variables injected into the Handlebars template.
            - template_id (Optional[str]): Template UUID. Defaults to WEBLELET template.
            - output_path (Optional[str]): Where to save the PDF. If omitted, returns base64.

    Returns:
        str: On success: "PDF saved to /path/to/file.pdf" or base64-encoded PDF string.
             On error: "Error <code>: <message>"

    Examples:
        - Generate audit PDF: template_data={"company_name": "Rózsa Étterem", "geo_score": 61}
        - Save to Desktop: output_path="/Users/horvathadam/Desktop/weblelet_audit.pdf"
    """
    tid = params.template_id or DEFAULT_TEMPLATE_ID
    payload = {"templateId": tid, "templateData": params.template_data}

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{API_BASE}/direct",
                headers=_headers(),
                json=payload
            )
            resp.raise_for_status()
            pdf_bytes = resp.content

        if params.output_path:
            os.makedirs(os.path.dirname(params.output_path), exist_ok=True)
            with open(params.output_path, "wb") as f:
                f.write(pdf_bytes)
            size_kb = len(pdf_bytes) // 1024
            return json.dumps({
                "success": True,
                "saved_to": params.output_path,
                "size_kb": size_kb,
                "template_id": tid
            }, ensure_ascii=False)

        # No path → return base64
        b64 = base64.b64encode(pdf_bytes).decode("ascii")
        return json.dumps({
            "success": True,
            "pdf_base64": b64,
            "size_bytes": len(pdf_bytes),
            "template_id": tid
        })

    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="pdfbolt_list_templates",
    annotations={
        "title": "List PDFBolt Templates",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    }
)
async def pdfbolt_list_templates() -> str:
    """
    List all available templates in the PDFBolt account.

    Returns:
        str: JSON array of templates with id, name, and createdAt.
             "Error <code>: <message>" on failure.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{API_BASE}/templates",
                headers=_headers()
            )
            resp.raise_for_status()
            data = resp.json()
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="pdfbolt_get_template",
    annotations={
        "title": "Get PDFBolt Template Details",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    }
)
async def pdfbolt_get_template(params: GetTemplateInput) -> str:
    """
    Retrieve details and HTML content of a specific PDFBolt template.

    Args:
        params (GetTemplateInput):
            - template_id (str): Template UUID.

    Returns:
        str: JSON with template id, name, html, and metadata.
             "Error <code>: <message>" on failure.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{API_BASE}/templates/{params.template_id}",
                headers=_headers()
            )
            resp.raise_for_status()
            data = resp.json()
        return json.dumps(data, ensure_ascii=False, indent=2)
    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="pdfbolt_update_template",
    annotations={
        "title": "Update PDFBolt Template HTML",
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": True,
        "openWorldHint": True,
    }
)
async def pdfbolt_update_template(params: UpdateTemplateInput) -> str:
    """
    Replace the HTML content of an existing PDFBolt template.

    Use this to push an updated Handlebars HTML template directly via API
    without opening the PDFBolt dashboard.

    Args:
        params (UpdateTemplateInput):
            - template_id (str): Template UUID to update.
            - html_content (str): Full Handlebars HTML to set as the new template.

    Returns:
        str: JSON confirmation with template id and updated status.
             "Error <code>: <message>" on failure.

    WARNING: This overwrites the existing template HTML immediately.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.put(
                f"{API_BASE}/templates/{params.template_id}",
                headers=_headers(),
                json={"html": params.html_content}
            )
            resp.raise_for_status()
            data = resp.json()
        return json.dumps({"success": True, "template_id": params.template_id, "response": data},
                          ensure_ascii=False, indent=2)
    except Exception as e:
        return _handle_error(e)


@mcp.tool(
    name="pdfbolt_test_connection",
    annotations={
        "title": "Test PDFBolt API Connection",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    }
)
async def pdfbolt_test_connection() -> str:
    """
    Test the PDFBolt API connection and verify the API key is valid.

    Attempts to list templates and returns connection status.

    Returns:
        str: JSON with connection status, api_key_masked, and template count.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{API_BASE}/templates",
                headers=_headers()
            )
            resp.raise_for_status()
            data = resp.json()

        templates = data if isinstance(data, list) else data.get("templates", data)
        count = len(templates) if isinstance(templates, list) else "unknown"
        masked = API_KEY[:8] + "..." + API_KEY[-4:]

        return json.dumps({
            "status": "connected",
            "api_key": masked,
            "template_count": count,
            "default_template_id": DEFAULT_TEMPLATE_ID,
        }, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": _handle_error(e)
        }, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    mcp.run()
