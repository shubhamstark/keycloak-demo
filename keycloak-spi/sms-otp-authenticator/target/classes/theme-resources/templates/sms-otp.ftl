<#--
  sms-otp.ftl — Freemarker template for the Mock SMS OTP form.

  Rendered by Keycloak's LoginFormsProvider when the MockSmsAuthenticator
  challenge() method is called. Shows:
    1. A visible mock code (in production, this would arrive via SMS)
    2. A text input for the user to enter the code
    3. Any error messages if the previous attempt was wrong

  Variables provided by Keycloak:
    - sms_code: the generated 6-digit mock code
    - message: error message (if any), set via setError()
    - client: the Keycloak client being authenticated against
    - realm: the Keycloak realm
    - url: URL builder for form actions
-->
<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('sms_code_input')>
    <div id="kc-form">
        <div id="kc-form-wrapper">
            <form id="kc-form-login" action="${url.loginAction}" method="post">
                <div class="kc-form-group">
                    <label class="control-label">
                        ${msg("Enter the SMS code sent to your phone")}
                    </label>

                    <#-- The mock code, shown visibly. In production this would
                         be sent via an SMS gateway and NOT displayed here. -->
                    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:16px 0;text-align:center">
                        <p style="color:#0c4a6e;font-size:14px;margin:0 0 8px 0">
                            📱 Your SMS code:
                        </p>
                        <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0f172a;margin:0;font-family:monospace">
                            ${sms_code}
                        </p>
                        <p style="color:#94a3b8;font-size:11px;margin:8px 0 0 0">
                            (This is a mock — in production, this code would arrive via SMS)
                        </p>
                    </div>

                    <input id="sms_code_input"
                           name="sms_code_input"
                           type="text"
                           inputmode="numeric"
                           autocomplete="one-time-code"
                           class="form-control"
                           placeholder="Enter 6-digit code"
                           autofocus
                           style="font-size:18px;text-align:center;letter-spacing:4px;padding:12px" />
                </div>

                <div id="kc-form-buttons" class="kc-form-group">
                    <input type="submit"
                           class="btn btn-primary btn-block btn-lg"
                           value="${msg("Verify")}" />
                </div>
            </form>
        </div>
    </div>
</@layout.registrationLayout>
