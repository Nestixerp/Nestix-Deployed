"""
Email Service for Nestix ERP
Handles sending emails with PDF attachments for quotes and invoices
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from typing import Optional, List


class EmailService:
    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER")
        self.smtp_password = os.getenv("SMTP_PASSWORD")
        self.from_name = os.getenv("SMTP_FROM_NAME", "Nestix ERP")
        
    def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        pdf_content: Optional[bytes] = None,
        pdf_filename: Optional[str] = None,
        cc_emails: Optional[List[str]] = None
    ) -> dict:
        """
        Send email with optional PDF attachment
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            body: Email body (plain text or HTML)
            pdf_content: PDF file content as bytes
            pdf_filename: Name for the PDF attachment
            cc_emails: List of CC email addresses
            
        Returns:
            dict with status and message
        """
        try:
            # Validate configuration
            if not self.smtp_user or not self.smtp_password:
                return {
                    "success": False,
                    "message": "Email not configured. Please set SMTP_USER and SMTP_PASSWORD in .env file"
                }
            
            # Create message
            msg = MIMEMultipart()
            msg['From'] = f"{self.from_name} <{self.smtp_user}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            
            if cc_emails:
                msg['Cc'] = ', '.join(cc_emails)
            
            # Add body
            msg.attach(MIMEText(body, 'html'))
            
            # Add PDF attachment if provided
            if pdf_content and pdf_filename:
                pdf_attachment = MIMEApplication(pdf_content, _subtype='pdf')
                pdf_attachment.add_header('Content-Disposition', 'attachment', filename=pdf_filename)
                msg.attach(pdf_attachment)
            
            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                
                recipients = [to_email]
                if cc_emails:
                    recipients.extend(cc_emails)
                
                server.sendmail(self.smtp_user, recipients, msg.as_string())
            
            return {
                "success": True,
                "message": f"Email sent successfully to {to_email}"
            }
            
        except smtplib.SMTPAuthenticationError:
            return {
                "success": False,
                "message": "Email authentication failed. Please check SMTP credentials"
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to send email: {str(e)}"
            }


# Singleton instance
email_service = EmailService()


def send_quote_email(
    customer_email: str,
    customer_name: str,
    quote_number: str,
    pdf_content: bytes
) -> dict:
    """Send quote email with PDF attachment"""
    subject = f"Quote {quote_number} from {email_service.from_name}"
    
    body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Quote {quote_number}</h2>
            
            <p>Dear {customer_name},</p>
            
            <p>Thank you for your interest in our services.</p>
            
            <p>Please find attached our quote for your review. This quote is valid for 30 days from the date of issue.</p>
            
            <p>If you have any questions or would like to discuss this quote, please don't hesitate to contact us.</p>
            
            <div style="margin-top: 30px; padding: 15px; background-color: #f3f4f6; border-left: 4px solid #2563eb;">
                <p style="margin: 0;"><strong>Next Steps:</strong></p>
                <ul style="margin-top: 10px;">
                    <li>Review the attached quote</li>
                    <li>Contact us if you have any questions</li>
                    <li>Accept the quote to proceed with production</li>
                </ul>
            </div>
            
            <p style="margin-top: 30px;">Best regards,<br>
            <strong>{email_service.from_name}</strong></p>
            
            <hr style="margin-top: 30px; border: none; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 12px; color: #6b7280;">
                This is an automated email. Please do not reply directly to this message.
            </p>
        </div>
    </body>
    </html>
    """
    
    return email_service.send_email(
        to_email=customer_email,
        subject=subject,
        body=body,
        pdf_content=pdf_content,
        pdf_filename=f"Quote_{quote_number}.pdf"
    )


def send_invoice_email(
    customer_email: str,
    customer_name: str,
    invoice_number: str,
    total_amount: float,
    due_date: str,
    pdf_content: bytes
) -> dict:
    """Send invoice email with PDF attachment"""
    subject = f"Invoice {invoice_number} from {email_service.from_name}"
    
    body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #dc2626;">Invoice {invoice_number}</h2>
            
            <p>Dear {customer_name},</p>
            
            <p>Thank you for your business.</p>
            
            <p>Please find attached invoice {invoice_number} for the amount of <strong>${total_amount:,.2f}</strong>.</p>
            
            <div style="margin: 20px 0; padding: 15px; background-color: #fef2f2; border-left: 4px solid #dc2626;">
                <p style="margin: 0;"><strong>Payment Details:</strong></p>
                <ul style="margin-top: 10px;">
                    <li>Invoice Number: {invoice_number}</li>
                    <li>Amount Due: ${total_amount:,.2f}</li>
                    <li>Due Date: {due_date}</li>
                </ul>
            </div>
            
            <p>Please remit payment by the due date to avoid any late fees.</p>
            
            <p>If you have any questions regarding this invoice, please contact us immediately.</p>
            
            <p style="margin-top: 30px;">Best regards,<br>
            <strong>{email_service.from_name}</strong></p>
            
            <hr style="margin-top: 30px; border: none; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 12px; color: #6b7280;">
                This is an automated email. Please do not reply directly to this message.
            </p>
        </div>
    </body>
    </html>
    """
    
    return email_service.send_email(
        to_email=customer_email,
        subject=subject,
        body=body,
        pdf_content=pdf_content,
        pdf_filename=f"Invoice_{invoice_number}.pdf"
    )
