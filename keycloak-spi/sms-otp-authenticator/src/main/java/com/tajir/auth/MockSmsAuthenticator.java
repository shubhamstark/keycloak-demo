package com.tajir.auth;

import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import org.keycloak.authentication.*;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.*;
import org.keycloak.sessions.AuthenticationSessionModel;

import java.security.SecureRandom;

/**
 * Mock SMS OTP Authenticator — a custom Keycloak authentication step.
 *
 * <p>This is the concrete implementation of the SPI extension pattern described
 * in keycloak-mapped.md (lines 549–558): "a custom authenticator appears in
 * the flow editor exactly like a built-in one."</p>
 *
 * <h3>What it does</h3>
 * <ol>
 *   <li><b>challenge()</b> — called when Keycloak reaches this step in the
 *       login flow. Generates a random 6-digit code, stores it in the
 *       authentication session (so it survives the form submit), and renders
 *       an HTML form showing the mock code and a text input.</li>
 *   <li><b>action()</b> — called when the user submits the form. Reads the
 *       entered code, compares it with the stored code, and either proceeds
 *       to the next step or returns an error.</li>
 * </ol>
 *
 * <p>In production, challenge() would call an SMS gateway (Twilio, etc.)
 * instead of showing the code on-screen. The rest of the flow — storing
 * the code in the session, validating it in action() — would be identical.</p>
 *
 * @see MockSmsAuthenticatorFactory The factory that registers this with Keycloak.
 */
public class MockSmsAuthenticator implements Authenticator {

    // The authentication session key where we store the generated code.
    // The session persists across the challenge() → action() round-trip.
    private static final String CODE_SESSION_KEY = "mock_sms_code";

    // SecureRandom for generating unguessable codes. Not just
    // Math.random() — this is a security-sensitive value.
    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * Called when Keycloak reaches this step. Generates the mock code,
     * stores it in the session, and renders the SMS-code form.
     */
    @Override
    public void authenticate(AuthenticationFlowContext context) {
        // Generate a 6-digit code. In production, this code would be
        // sent via an SMS gateway (Twilio, Vonage, etc.) instead of
        // being displayed on-screen.
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));

        // Store the code in the authentication session so we can
        // retrieve it in action() after the user submits the form.
        // The session is scoped to this authentication attempt.
        AuthenticationSessionModel session = context.getAuthenticationSession();
        session.setAuthNote(CODE_SESSION_KEY, code);

        // Render the challenge form. Keycloak's LoginFormsProvider
        // generates the HTML. The Freemarker template "sms-otp.ftl"
        // receives the code as a form attribute.
        Response challenge = context.form()
                .setAttribute("sms_code", code)  // shown as "Your SMS code is: 482916"
                .createForm("sms-otp.ftl");       // our custom form template

        // Respond with the challenge — the user sees the form.
        context.challenge(challenge);
    }

    /**
     * Called when the user submits the form. Validates the entered code
     * against the value stored in the session during challenge().
     */
    @Override
    public void action(AuthenticationFlowContext context) {
        // Retrieve the code we stored in challenge().
        String expectedCode = context.getAuthenticationSession().getAuthNote(CODE_SESSION_KEY);

        // Extract the user's entered code from the HTTP form POST.
        // The form field is named "sms_code_input" in our template.
        MultivaluedMap<String, String> formData =
                context.getHttpRequest().getDecodedFormParameters();
        String enteredCode = formData.getFirst("sms_code_input");

        // Compare: if the entered code matches, authentication succeeds
        // and the flow proceeds to the next step (or finishes).
        if (expectedCode != null && expectedCode.equals(enteredCode)) {
            // success() tells Keycloak this step passed.
            context.success();
        } else {
            // If the code doesn't match, re-render the form with an error.
            // The user can retry. In production you'd also implement rate
            // limiting and max attempts here.
            Response challenge = context.form()
                    .setAttribute("sms_code", expectedCode)  // keep same code for retry
                    .setError("Invalid SMS code")             // error message shown to user
                    .createForm("sms-otp.ftl");

            // challenge() with an error re-shows the form without
            // advancing the flow.
            context.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS, challenge);
        }
    }

    /**
     * Whether this authenticator requires the user to already be identified.
     * Returns TRUE — the user must complete password authentication first.
     * This ensures Mock SMS OTP runs AFTER username/password even if the
     * flow editor places it earlier. Keycloak will skip this step until
     * the user is known, run password first, then come back here.
     */
    @Override
    public boolean requiresUser() {
        return true;
    }

    /**
     * Whether this authenticator is configured for the user. Since we don't
     * store per-user SMS phone numbers (this is a mock), always true.
     * In production, this would check whether the user has a phone number
     * registered for SMS delivery.
     */
    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
        return true;
    }

    /**
     * Called when the flow is set up for a user (e.g., via account console).
     * Not used in this mock — we always return true from configuredFor().
     */
    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
        // No required actions for mock SMS.
    }

    /**
     * Cleanup if this authenticator is closed before completing.
     */
    @Override
    public void close() {
        // Nothing to clean up.
    }
}
