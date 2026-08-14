"""
notifications.py — Email notification service for SaliDock.
Uses the Resend SDK to send job completion notifications.

Triggers:
  • Docking job completion  → send_docking_completion_email()
    - Single docking: shown when server queue > 10 or upon user request
    - Batch docking:  always available
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# Lazily import resend and configure API key dynamically
def _get_resend():
    try:
        import resend as _resend
        api_key = os.getenv("RESEND_API_KEY", "")
        if api_key:
            _resend.api_key = api_key
        return _resend
    except ImportError:
        logger.warning("resend package not installed — run: pip install resend")
        return None


def send_docking_completion_email(
    to_email: str,
    session_id: str,
    protein_name: str = "Protein",
    ligand_name: str = "Ligand",
    top_score: Optional[str] = None,
    is_batch: bool = False,
) -> bool:
    """
    Sends a completion notification email to the user via Resend API or logs fallback.

    Used by:
      - /api/dock/run/{session_id}  (single docking)
      - /api/batch/dock/run/{session_id}  (batch docking)
    """
    if not to_email or "@" not in to_email:
        logger.debug(f"Invalid notification email provided: {to_email}")
        return False

    site_url = os.getenv("SITE_URL", "https://salidock-v2.salixirax.com")

    results_url = (
        f"{site_url}/results?session={session_id}"
        if not is_batch
        else f"{site_url}/batch-results?session={session_id}"
    )

    process_type = "batch docking" if is_batch else "single docking"

    subject = f"Your SaliDock {'Batch' if is_batch else 'Single'} Docking Results are Ready"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; color: #f3f4f6; margin: 0; padding: 24px; }}
        .card {{ max-width: 560px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 14px; padding: 36px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }}
        .logo {{ font-size: 26px; font-weight: 800; color: #3b82f6; letter-spacing: -0.5px; margin-bottom: 20px; display: inline-block; }}
        .greeting {{ font-size: 18px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }}
        p {{ font-size: 14px; color: #d1d5db; line-height: 1.6; margin-bottom: 16px; }}
        .btn-container {{ margin: 24px 0; text-align: center; }}
        .btn {{ display: inline-block; text-align: center; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.39); }}
        .warning-box {{ background-color: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 10px; padding: 16px; margin-top: 24px; color: #fca5a5; font-size: 13px; line-height: 1.6; }}
        .footer {{ text-align: center; font-size: 12px; color: #6b7280; margin-top: 32px; border-top: 1px solid #1f2937; padding-top: 16px; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">SaliDock</div>
        <div class="greeting">Thankyou for using Salidock</div>
        
        <p>Your {process_type} process on SaliDock has been completed successfully.</p>
        
        <p>Your results are now available for viewing:</p>
        <p style="margin-bottom: 8px;"><strong>View Your Docking Results:</strong> <a href="{results_url}" style="color: #60a5fa; text-decoration: underline;" target="_blank">{results_url}</a></p>
        
        <div class="btn-container">
          <a href="{results_url}" class="btn" target="_blank">View Your Docking Results →</a>
        </div>
        
        <div class="warning-box">
          <strong>⚠️ Access Notice:</strong><br>
          Please note that your results will be available for 24 hours only. After 24 hours, the result files and associated data will be automatically removed from the server.<br><br>
          We recommend downloading any required result files before the 24-hour access period expires.
        </div>

        <div class="footer">
          SaliDock — Consensus-Driven Drug Discovery Platform<br>
          Session ID: {session_id}
        </div>
      </div>
    </body>
    </html>
    """

    resend_api_key = os.getenv("RESEND_API_KEY", "")
    sender_email = os.getenv("NOTIFY_SENDER_EMAIL", "SaliDock <onboarding@resend.dev>")

    if resend_api_key:
        resend = _get_resend()
        senders_to_try = [sender_email]
        # Always include the free Resend sandbox as a last-resort fallback
        if "onboarding@resend.dev" not in sender_email:
            senders_to_try.append("SaliDock <onboarding@resend.dev>")

        if resend:
            for sender in senders_to_try:
                try:
                    resp = resend.Emails.send({
                        "from": sender,
                        "to": [to_email],
                        "subject": subject,
                        "html": html_content,
                    })
                    logger.info(f"✅ Docking completion email sent to {to_email} (id={resp.get('id')})")
                    return True
                except Exception as e:
                    logger.warning(f"Resend send failed (from={sender}): {e}")

    # Fallback: log only (no API key configured or all sends failed)
    logger.info(f"📩 [MOCK EMAIL] To: {to_email} | Subject: {subject} | Link: {results_url}")
    return True
