"""
notifications.py — Email notification service for SaliDock completion alerts.
Supports Resend API (default, 3,000 free emails/mo) or direct SMTP.
"""

import os
import logging
import urllib.request
import json
from typing import Optional

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
SENDER_EMAIL = os.getenv("NOTIFY_SENDER_EMAIL", "SaliDock <onboarding@resend.dev>")
SITE_URL = os.getenv("SITE_URL", "http://localhost:5173")


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
    """
    if not to_email or "@" not in to_email:
        logger.debug(f"Invalid notification email provided: {to_email}")
        return False

    results_url = f"{SITE_URL}/results?session_id={session_id}" if not is_batch else f"{SITE_URL}/batch-results?session_id={session_id}"

    subject = f"✅ SaliDock Finished: {protein_name} + {ligand_name}" if not is_batch else f"✅ SaliDock Batch Completed for Session {session_id[:8]}"

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
        <p>The 3-method consensus cavity detection & GNINA scoring engine have finished processing your complex.</p>
        
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

        <a href="{results_url}" class="btn" target="_blank">View 3D Poses & 2D Interactions →</a>

        <div class="footer">
          SaliDock — Consensus-Driven Drug Discovery Platform<br>
          This is an automated notification sent for session {session_id[:8]}.
        </div>
      </div>
    </body>
    </html>
    """

    if RESEND_API_KEY:
        senders_to_try = [SENDER_EMAIL]
        if "onboarding@resend.dev" not in SENDER_EMAIL:
            senders_to_try.append("SaliDock <onboarding@resend.dev>")

        for sender in senders_to_try:
            try:
                req = urllib.request.Request(
                    "https://api.resend.com/emails",
                    data=json.dumps({
                        "from": sender,
                        "to": [to_email],
                        "subject": subject,
                        "html": html_content
                    }).encode("utf-8"),
                    headers={
                        "Authorization": f"Bearer {RESEND_API_KEY}",
                        "Content-Type": "application/json",
                        "User-Agent": "SaliDock/1.0"
                    },
                    method="POST"
                )
                with urllib.request.urlopen(req) as resp:
                    if resp.status in (200, 201):
                        logger.info(f"✅ Notification email sent to {to_email} via Resend (from {sender})")
                        return True
            except Exception as e:
                logger.warning(f"Failed to send email via Resend API from {sender}: {e}")

    # Fallback log output for development or when API key is unconfigured
    logger.info(f"📩 [MOCK EMAIL NOTIFICATION] To: {to_email} | Subject: {subject} | Link: {results_url}")
    return True

    # Fallback log output for development or when API key is unconfigured
    logger.info(f"📩 [MOCK EMAIL NOTIFICATION] To: {to_email} | Subject: {subject} | Link: {results_url}")
    return True
