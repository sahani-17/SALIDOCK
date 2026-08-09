"""
notifications.py — Email notification service for SaliDock.
Uses the Resend SDK (3,000 free emails/month on the free plan).

Triggers:
  • Docking job completion  → send_docking_completion_email()
    - Single docking: shown when server queue > 10
    - Batch docking:  always available
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
SENDER_EMAIL = os.getenv("NOTIFY_SENDER_EMAIL", "SaliDock <onboarding@resend.dev>")
SITE_URL = os.getenv("SITE_URL", "http://localhost:5173")


# Lazily import resend so that the module loads even if the package is missing
def _get_resend():
    try:
        import resend as _resend
        _resend.api_key = RESEND_API_KEY
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
      - /api/dock/run/{session_id}  (single docking, when queue > 10)
      - /api/batch/dock/run/{session_id}  (batch docking, always available)
    """
    if not to_email or "@" not in to_email:
        logger.debug(f"Invalid notification email provided: {to_email}")
        return False

    results_url = (
        f"{SITE_URL}/results?session_id={session_id}"
        if not is_batch
        else f"{SITE_URL}/batch-results?session_id={session_id}"
    )

    subject = (
        f"✅ SaliDock Finished: {protein_name} + {ligand_name}"
        if not is_batch
        else f"✅ SaliDock Batch Completed for Session {session_id[:8]}"
    )

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; color: #f3f4f6; margin: 0; padding: 20px; }}
        .card {{ max-width: 550px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }}
        .logo {{ font-size: 24px; font-weight: 800; color: #6366f1; letter-spacing: -0.5px; margin-bottom: 24px; display: inline-block; }}
        .badge {{ background-color: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); font-weight: 600; font-size: 12px; padding: 4px 10px; border-radius: 9999px; display: inline-block; margin-bottom: 16px; }}
        h2 {{ font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px; }}
        p {{ font-size: 14px; color: #9ca3af; line-height: 1.6; margin-bottom: 20px; }}
        .stats {{ background-color: #1f2937; border-radius: 8px; padding: 16px; margin-bottom: 24px; }}
        .stat-item {{ display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #374151; font-size: 13px; }}
        .stat-item:last-child {{ border-bottom: none; }}
        .stat-label {{ color: #9ca3af; }}
        .stat-value {{ color: #f3f4f6; font-weight: 600; }}
        .btn {{ display: block; text-align: center; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 15px; padding: 12px 24px; border-radius: 8px; box-shadow: 0 4px 14px 0 rgba(99, 102, 241, 0.39); }}
        .footer {{ text-align: center; font-size: 12px; color: #6b7280; margin-top: 32px; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">SaliDock</div>
        <br>
        <div class="badge">DOCKING COMPLETED</div>
        <h2>Your Docking Job is Ready!</h2>
        <p>The 3-method consensus cavity detection &amp; GNINA scoring engine have finished processing your complex.</p>

        <div class="stats">
          <div class="stat-item">
            <span class="stat-label">Target Protein</span>
            <span class="stat-value">{protein_name}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Ligand</span>
            <span class="stat-value">{ligand_name}</span>
          </div>
          {"<div class='stat-item'><span class='stat-label'>Top CNN Score</span><span class='stat-value'>" + str(top_score) + "</span></div>" if top_score else ""}
          <div class="stat-item">
            <span class="stat-label">Session ID</span>
            <span class="stat-value">{session_id[:12]}...</span>
          </div>
        </div>

        <a href="{results_url}" class="btn" target="_blank">View 3D Poses &amp; 2D Interactions →</a>

        <div class="footer">
          SaliDock — Consensus-Driven Drug Discovery Platform<br>
          This is an automated notification sent for session {session_id[:8]}.
        </div>
      </div>
    </body>
    </html>
    """

    if RESEND_API_KEY:
        resend = _get_resend()
        senders_to_try = [SENDER_EMAIL]
        # Always include the free Resend sandbox as a last-resort fallback
        if "onboarding@resend.dev" not in SENDER_EMAIL:
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
